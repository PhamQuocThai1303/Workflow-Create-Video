import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile, readdir, rename, stat, unlink, writeFile} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const dashboardDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dashboardDir, '..');
const port = Number(process.env.DASHBOARD_API_PORT ?? 4310);
const slugPattern = /^[a-z0-9][a-z0-9-]*$/;
const watermarkPath = path.join(root, 'public', 'watermark.png');
const templatePreviewManifestPath = path.join(root, 'public', 'template-previews', 'manifest.json');
const maxWatermarkBytes = 10 * 1024 * 1024;
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const templatePreviewUrlPattern = /^\/template-previews\/[a-z0-9][a-z0-9-]*\.(?:png|webp|jpe?g)$/i;
const youtubeVideoIdPattern = /^[A-Za-z0-9_-]{6,}$/;
const templateIdPattern = /^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/;

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function sendJson(response, statusCode, value) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(value));
}

function safeSlug(value) {
  return slugPattern.test(value) ? value : null;
}

async function readText(file) {
  try {
    return (await readFile(file, 'utf8')).trim();
  } catch {
    return '';
  }
}

async function readTemplatePreviews() {
  try {
    const manifest = JSON.parse(await readFile(templatePreviewManifestPath, 'utf8'));
    if (!manifest || typeof manifest !== 'object' || !manifest.previews || typeof manifest.previews !== 'object') return new Map();
    const entries = Object.entries(manifest.previews)
      .filter(([id, preview]) => templateIdPattern.test(id) && preview && typeof preview === 'object')
      .map(([id, preview]) => {
        const thumbnailUrl = typeof preview.thumbnailUrl === 'string' && templatePreviewUrlPattern.test(preview.thumbnailUrl) ? preview.thumbnailUrl : null;
        const youtubeVideoId = typeof preview.youtubeVideoId === 'string' && youtubeVideoIdPattern.test(preview.youtubeVideoId) ? preview.youtubeVideoId : null;
        const duration = typeof preview.duration === 'string' ? preview.duration : null;
        const sourceTemplateId = typeof preview.sourceTemplateId === 'string' && templateIdPattern.test(preview.sourceTemplateId) ? preview.sourceTemplateId : null;
        return [id, thumbnailUrl ? {thumbnailUrl, youtubeVideoId, duration, sourceTemplateId} : null];
      })
      .filter(([, preview]) => preview);
    return new Map(entries);
  } catch {
    return new Map();
  }
}

async function readRegistry() {
  const source = await readFile(path.join(root, 'src', 'templates', 'registry.ts'), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
  }).outputText;
  const module = {exports: {}};
  const sandbox = {
    module,
    exports: module.exports,
    require: () => {
      throw new Error('The template registry may not load dependencies in dashboard mode.');
    },
  };
  new vm.Script(output, {filename: 'src/templates/registry.ts'}).runInNewContext(sandbox);
  const entries = module.exports.TEMPLATE_REGISTRY;
  if (!Array.isArray(entries)) throw new Error('TEMPLATE_REGISTRY is unavailable.');
  const previews = await readTemplatePreviews();
  return entries.map((entry) => ({
    id: entry.id,
    behavior: entry.behavior,
    name: entry.name,
    category: entry.category,
    description: entry.description,
    aspectRatio: entry.aspectRatio,
    assetManifestPath: entry.assetManifestPath,
    defaultBgMusic: entry.defaultBgMusic ?? null,
    voice: entry.voice
      ? {
          elevenLabsVoiceId: entry.voice.elevenLabsVoiceId ?? null,
          geminiVoice: entry.voice.geminiVoice ?? null,
        }
      : null,
    preview: previews.get(entry.id) ?? null,
  }));
}

function compactTitle(context, slug) {
  const firstLine = context.split(/\r?\n/).find(Boolean)?.trim() ?? '';
  return firstLine || slug;
}

async function scanVideos() {
  const videosRoot = path.join(root, 'videos');
  const entries = await readdir(videosRoot, {withFileTypes: true});
  const results = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && safeSlug(entry.name))
      .map(async (entry) => {
        const slug = entry.name;
        const folder = path.join(videosRoot, slug);
        const output = path.join(folder, 'output', 'video.mp4');
        const [context, templateId, folderStat, outputStat] = await Promise.all([
          readText(path.join(folder, 'context.txt')),
          readText(path.join(folder, 'template.txt')),
          stat(folder),
          stat(output).catch(() => null),
        ]);
        return {
          slug,
          title: compactTitle(context, slug),
          context,
          templateId: templateId || null,
          updatedAt: (outputStat ?? folderStat).mtime.toISOString(),
          status: outputStat ? 'ready' : 'incomplete',
          outputAvailable: Boolean(outputStat),
          mediaUrl: outputStat ? `/media/${encodeURIComponent(slug)}` : null,
        };
      }),
  );
  return results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

async function overview() {
  const [templates, videos] = await Promise.all([readRegistry(), scanVideos()]);
  return {
    templateCount: templates.length,
    videoCount: videos.length,
    renderedVideoCount: videos.filter((video) => video.outputAvailable).length,
    recentVideos: videos.slice(0, 4),
  };
}

async function watermarkInfo() {
  const fileStat = await stat(watermarkPath);
  return {
    updatedAt: fileStat.mtime.toISOString(),
    size: fileStat.size,
    url: `/watermark.png?v=${Math.trunc(fileStat.mtimeMs)}`,
  };
}

async function readRequestBody(request, maxBytes) {
  const contentLength = Number(request.headers['content-length'] ?? 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new HttpError(413, `Watermark must be ${maxBytes / (1024 * 1024)} MB or smaller.`);
  }

  const chunks = [];
  let bytesRead = 0;
  for await (const chunk of request) {
    bytesRead += chunk.length;
    if (bytesRead > maxBytes) {
      throw new HttpError(413, `Watermark must be ${maxBytes / (1024 * 1024)} MB or smaller.`);
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function isPng(content) {
  return content.length >= pngSignature.length && content.subarray(0, pngSignature.length).equals(pngSignature);
}

async function replaceWatermark(request) {
  const contentType = request.headers['content-type']?.split(';')[0]?.trim().toLowerCase();
  if (contentType !== 'image/png') {
    throw new HttpError(415, 'Only PNG watermark images are accepted.');
  }
  const image = await readRequestBody(request, maxWatermarkBytes);
  if (!isPng(image)) throw new HttpError(415, 'The uploaded file is not a valid PNG image.');

  const temporaryPath = path.join(root, 'public', `.watermark-${process.pid}-${Date.now()}.tmp`);
  try {
    await writeFile(temporaryPath, image, {flag: 'wx'});
    await rename(temporaryPath, watermarkPath);
  } finally {
    await unlink(temporaryPath).catch(() => undefined);
  }
  return watermarkInfo();
}

async function sendVideo(response, slug, rangeHeader) {
  const validSlug = safeSlug(slug);
  if (!validSlug) return sendJson(response, 400, {error: 'Invalid video slug.'});
  const file = path.join(root, 'videos', validSlug, 'output', 'video.mp4');
  let fileStat;
  try {
    fileStat = await stat(file);
  } catch {
    return sendJson(response, 404, {error: 'Rendered video was not found.'});
  }
  const size = fileStat.size;
  const match = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader ?? '');
  if (!match) {
    response.writeHead(200, {'Content-Type': 'video/mp4', 'Content-Length': size, 'Accept-Ranges': 'bytes'});
    return response.end(await readFile(file));
  }
  const start = Number(match[1]);
  const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (start >= size || end < start) {
    response.writeHead(416, {'Content-Range': `bytes */${size}`});
    return response.end();
  }
  const body = await readFile(file).then((content) => content.subarray(start, end + 1));
  response.writeHead(206, {
    'Content-Type': 'video/mp4',
    'Content-Length': body.length,
    'Content-Range': `bytes ${start}-${end}/${size}`,
    'Accept-Ranges': 'bytes',
  });
  response.end(body);
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);
    if (request.method === 'POST' && url.pathname === '/api/watermark') {
      return sendJson(response, 200, await replaceWatermark(request));
    }
    if (request.method !== 'GET') return sendJson(response, 405, {error: 'Dashboard API does not support this action.'});
    if (url.pathname === '/api/health') return sendJson(response, 200, {status: 'ok', mode: 'watermark-write'});
    if (url.pathname === '/api/overview') return sendJson(response, 200, await overview());
    if (url.pathname === '/api/videos') return sendJson(response, 200, await scanVideos());
    if (url.pathname === '/api/templates') return sendJson(response, 200, await readRegistry());
    if (url.pathname === '/api/watermark') return sendJson(response, 200, await watermarkInfo());
    if (url.pathname.startsWith('/media/')) return sendVideo(response, decodeURIComponent(url.pathname.slice('/media/'.length)), request.headers.range);
    return sendJson(response, 404, {error: 'Dashboard route was not found.'});
  } catch (error) {
    console.error(error);
    if (error instanceof HttpError) return sendJson(response, error.statusCode, {error: error.message});
    return sendJson(response, 500, {error: 'Dashboard could not complete this request.'});
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Dashboard API listening at http://127.0.0.1:${port}`);
});

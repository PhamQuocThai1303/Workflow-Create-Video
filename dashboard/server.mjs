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
const apiUsagePath = path.join(root, '.dashboard', 'api-usage.ndjson');
const envPath = path.join(root, '.env');
const maxWatermarkBytes = 10 * 1024 * 1024;
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const templatePreviewUrlPattern = /^\/template-previews\/[a-z0-9][a-z0-9-]*\.(?:png|webp|jpe?g)$/i;
const youtubeVideoIdPattern = /^[A-Za-z0-9_-]{6,}$/;
const templateIdPattern = /^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/;
const apiKeyProviders = [
  {id: 'elevenlabs', label: 'ElevenLabs', operation: 'TTS', keyName: 'ELEVENLABS_API_KEY'},
  {id: 'gemini', label: 'Gemini', operation: 'TTS', keyName: 'GEMINI_API_KEY'},
  {id: 'groq', label: 'Groq', operation: 'STT', keyName: 'GROQ_API_KEY'},
  {id: 'stt.ai', label: 'api.stt.ai', operation: 'STT', keyName: 'STT_API_KEY'},
  {id: 'cloudflare', label: 'Cloudflare Workers AI', operation: 'Workers AI', keyName: 'CLOUDFLARE_API_TOKEN'},
  {id: 'pexels', label: 'Pexels', operation: 'Media assets', keyName: 'PEXELS_API_KEY'},
];
const geminiVoices = [
  ['Zephyr', 'Bright'], ['Puck', 'Upbeat'], ['Charon', 'Informative'], ['Kore', 'Firm'], ['Fenrir', 'Excitable'], ['Leda', 'Youthful'], ['Orus', 'Firm'], ['Aoede', 'Breezy'], ['Callirrhoe', 'Easy-going'], ['Autonoe', 'Bright'], ['Enceladus', 'Breathy'], ['Iapetus', 'Clear'], ['Umbriel', 'Easy-going'], ['Algieba', 'Smooth'], ['Despina', 'Smooth'], ['Erinome', 'Clear'], ['Algenib', 'Gravelly'], ['Rasalgethi', 'Informative'], ['Laomedeia', 'Upbeat'], ['Achernar', 'Soft'], ['Anilam', 'Firm'], ['Schedar', 'Even'], ['Gacrux', 'Mature'], ['Pulcherrima', 'Forward'], ['Achird', 'Friendly'], ['Zubenelgenubi', 'Casual'], ['Vindemiatrix', 'Gentle'], ['Sadachbia', 'Lively'], ['Sadaltager', 'Knowledgeable'], ['Sulafat', 'Warm'],
].map(([id, description]) => ({id, name: id, description}));

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

async function apiUsage() {
  const environment = readEnvironment(await readFile(envPath, 'utf8').catch(() => ''));
  const disabledKeys = new Set((environment.DASHBOARD_DISABLED_API_KEYS ?? '').split(',').map((item) => item.trim()).filter(Boolean));
  const providers = apiKeyProviders.map((provider) => ({...provider, configured: Boolean(environment[provider.keyName]), disabled: disabledKeys.has(provider.id)}));
  const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const events = (await readText(apiUsagePath)).split(/\r?\n/).flatMap((line) => {
    try {
      const event = JSON.parse(line);
      return typeof event?.at === 'string' && Number.isFinite(Date.parse(event.at)) ? [event] : [];
    } catch {
      return [];
    }
  }).filter((event) => Date.parse(event.at) >= since);
  const byProvider = new Map(providers.map((provider) => [provider.id, {
    ...provider, requests: 0, succeeded: 0, failed: 0, inputChars: 0, inputBytes: 0,
    outputBytes: 0, durationSeconds: 0, latestAt: null,
  }]));
  const daily = new Map();
  for (const event of events) {
    const provider = byProvider.get(event.provider);
    if (!provider) continue;
    provider.requests += 1;
    if (event.status === 'succeeded') provider.succeeded += 1;
    else provider.failed += 1;
    provider.inputChars += Number.isFinite(event.inputChars) ? event.inputChars : 0;
    provider.inputBytes += Number.isFinite(event.inputBytes) ? event.inputBytes : 0;
    provider.outputBytes += Number.isFinite(event.outputBytes) ? event.outputBytes : 0;
    provider.durationSeconds += Number.isFinite(event.durationSeconds) ? event.durationSeconds : 0;
    if (!provider.latestAt || event.at > provider.latestAt) provider.latestAt = event.at;
    const day = event.at.slice(0, 10);
    const summary = daily.get(day) ?? {day, requests: 0, succeeded: 0, failed: 0};
    summary.requests += 1;
    if (event.status === 'succeeded') summary.succeeded += 1;
    else summary.failed += 1;
    daily.set(day, summary);
  }
  return {
    periodDays: 30,
    providers: [...byProvider.values()],
    recent: events.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 12),
    daily: [...daily.values()].sort((a, b) => a.day.localeCompare(b.day)),
  };
}

function readEnvironment(source) {
  return Object.fromEntries(source.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);
    return match ? [[match[1], match[2]]] : [];
  }));
}

function replaceEnvironmentValue(source, name, value) {
  const linePattern = new RegExp(`^\\s*${name}\\s*=.*(?:\\r?\\n|$)`, 'm');
  const nextLine = value === null ? '' : `${name}=${value}\n`;
  if (linePattern.test(source)) return source.replace(linePattern, nextLine).replace(/\n{3,}/g, '\n\n');
  if (value === null) return source;
  return `${source.replace(/\s*$/, '')}${source.trim() ? '\n' : ''}${nextLine}`;
}

async function writeEnvironment(source) {
  const temporaryPath = path.join(root, `.env-${process.pid}-${Date.now()}.tmp`);
  try {
    await writeFile(temporaryPath, source, {flag: 'wx', mode: 0o600});
    await rename(temporaryPath, envPath);
  } finally {
    await unlink(temporaryPath).catch(() => undefined);
  }
}

function apiKeyProvider(providerId) {
  const provider = apiKeyProviders.find((item) => item.id === providerId);
  if (!provider) throw new HttpError(400, 'Unknown API key provider.');
  return provider;
}

async function apiKeyConnection(providerId) {
  const provider = apiKeyProvider(providerId);
  const environment = readEnvironment(await readFile(envPath, 'utf8').catch(() => ''));
  return {providerId: provider.id, configured: Boolean(environment[provider.keyName])};
}

async function voices() {
  const environment = readEnvironment(await readFile(envPath, 'utf8').catch(() => ''));
  const result = {
    gemini: {configured: Boolean(environment.GEMINI_API_KEY), selectedId: environment.GEMINI_TTS_VOICE || 'Achird', voices: geminiVoices},
    elevenlabs: {configured: Boolean(environment.ELEVENLABS_API_KEY), selectedId: environment.ELEVENLABS_VOICE_ID || 'K7ewtjKRNtwwt3lKQ6M0', voices: []},
  };
  if (!result.elevenlabs.configured) return result;
  const response = await fetch('https://api.elevenlabs.io/v1/voices', {headers: {'xi-api-key': environment.ELEVENLABS_API_KEY}});
  if (!response.ok) throw new HttpError(502, 'Không thể tải danh sách giọng ElevenLabs.');
  const payload = await response.json();
  result.elevenlabs.voices = Array.isArray(payload?.voices) ? payload.voices.map((voice) => ({id: String(voice.voice_id), name: String(voice.name ?? voice.voice_id), description: String(voice.category ?? 'ElevenLabs')})).filter((voice) => voice.id && voice.id.length < 256) : [];
  return result;
}

async function updateVoice(request) {
  const body = await readRequestBody(request, 2048);
  let payload; try { payload = JSON.parse(body.toString('utf8')); } catch { throw new HttpError(400, 'Invalid voice update payload.'); }
  const provider = payload?.provider === 'gemini' || payload?.provider === 'elevenlabs' ? payload.provider : null;
  const voiceId = typeof payload?.voiceId === 'string' ? payload.voiceId.trim() : '';
  if (!provider || !voiceId || voiceId.length > 255 || /[\r\n\0]/.test(voiceId)) throw new HttpError(400, 'Invalid voice selection.');
  if (provider === 'gemini' && !geminiVoices.some((voice) => voice.id === voiceId)) throw new HttpError(400, 'Unknown Gemini voice.');
  const current = await readFile(envPath, 'utf8').catch(() => '');
  await writeEnvironment(replaceEnvironmentValue(current, provider === 'gemini' ? 'GEMINI_TTS_VOICE' : 'ELEVENLABS_VOICE_ID', voiceId));
  return voices();
}

async function previewVoice(request) {
  const body = await readRequestBody(request, 2048);
  let payload; try { payload = JSON.parse(body.toString('utf8')); } catch { throw new HttpError(400, 'Invalid voice preview payload.'); }
  const provider = payload?.provider === 'gemini' || payload?.provider === 'elevenlabs' ? payload.provider : null;
  const voiceId = typeof payload?.voiceId === 'string' ? payload.voiceId.trim() : '';
  if (!provider || !voiceId) throw new HttpError(400, 'Voice selection is required.');
  const environment = readEnvironment(await readFile(envPath, 'utf8').catch(() => ''));
  if (provider === 'elevenlabs') {
    if (!environment.ELEVENLABS_API_KEY) throw new HttpError(409, 'ElevenLabs API key chưa được kết nối.');
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {method: 'POST', headers: {'xi-api-key': environment.ELEVENLABS_API_KEY, 'Content-Type': 'application/json'}, body: JSON.stringify({text: 'Xin chào', model_id: 'eleven_v3', output_format: 'mp3_44100_128'})});
    if (!response.ok) throw new HttpError(502, 'Không thể tạo audio preview ElevenLabs.');
    return {contentType: 'audio/mpeg', body: Buffer.from(await response.arrayBuffer())};
  }
  if (!environment.GEMINI_API_KEY) throw new HttpError(409, 'Gemini API key chưa được kết nối.');
  if (!geminiVoices.some((voice) => voice.id === voiceId)) throw new HttpError(400, 'Unknown Gemini voice.');
  const {GoogleGenAI} = await import('@google/genai');
  const ai = new GoogleGenAI({apiKey: environment.GEMINI_API_KEY});
  const result = await ai.models.generateContent({model: 'gemini-2.5-flash-preview-tts', contents: [{parts: [{text: 'Xin chào'}]}], config: {responseModalities: ['AUDIO'], speechConfig: {voiceConfig: {prebuiltVoiceConfig: {voiceName: voiceId}}}}});
  const pcm = result.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!pcm) throw new HttpError(502, 'Gemini did not return preview audio.');
  const raw = Buffer.from(pcm, 'base64'); const header = Buffer.alloc(44); header.write('RIFF', 0); header.writeUInt32LE(36 + raw.length, 4); header.write('WAVE', 8); header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(24000, 24); header.writeUInt32LE(48000, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(raw.length, 40);
  return {contentType: 'audio/wav', body: Buffer.concat([header, raw])};
}

async function clearApiKey(providerId) {
  const provider = apiKeyProvider(providerId);
  const current = await readFile(envPath, 'utf8').catch(() => '');
  await writeEnvironment(replaceEnvironmentValue(current, provider.keyName, null));
  return apiUsage();
}

async function setApiKeyDisabled(request, providerId) {
  const contentType = request.headers['content-type']?.split(';')[0]?.trim().toLowerCase();
  if (contentType !== 'application/json') throw new HttpError(415, 'API key updates must be JSON.');
  const body = await readRequestBody(request, 1024);
  let payload;
  try { payload = JSON.parse(body.toString('utf8')); } catch { throw new HttpError(400, 'Invalid API key update payload.'); }
  if (typeof payload?.disabled !== 'boolean') throw new HttpError(400, 'Disabled state is required.');
  const provider = apiKeyProvider(providerId);
  const current = await readFile(envPath, 'utf8').catch(() => '');
  const environment = readEnvironment(current);
  const disabledKeys = new Set((environment.DASHBOARD_DISABLED_API_KEYS ?? '').split(',').map((item) => item.trim()).filter(Boolean));
  if (payload.disabled) disabledKeys.add(provider.id); else disabledKeys.delete(provider.id);
  await writeEnvironment(replaceEnvironmentValue(current, 'DASHBOARD_DISABLED_API_KEYS', disabledKeys.size ? [...disabledKeys].join(',') : null));
  return apiUsage();
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

async function updateApiKey(request) {
  const contentType = request.headers['content-type']?.split(';')[0]?.trim().toLowerCase();
  if (contentType !== 'application/json') throw new HttpError(415, 'API key updates must be JSON.');
  const body = await readRequestBody(request, 16 * 1024);
  let payload;
  try {
    payload = JSON.parse(body.toString('utf8'));
  } catch {
    throw new HttpError(400, 'Invalid API key update payload.');
  }
  const provider = apiKeyProviders.find((item) => item.id === payload?.providerId);
  const value = typeof payload?.value === 'string' ? payload.value.trim() : '';
  if (!provider) throw new HttpError(400, 'Unknown API key provider.');
  if (!value || value.length > 4096 || /[\r\n\0]/.test(value)) throw new HttpError(400, 'API key is invalid. Paste the complete key again.');

  const current = await readFile(envPath, 'utf8').catch(() => '');
  await writeEnvironment(replaceEnvironmentValue(current, provider.keyName, value));
  return apiUsage();
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
    if (request.method === 'POST' && url.pathname === '/api/api-keys') {
      return sendJson(response, 200, await updateApiKey(request));
    }
    if (request.method === 'GET' && url.pathname === '/api/voices') return sendJson(response, 200, await voices());
    if (request.method === 'PATCH' && url.pathname === '/api/voices') return sendJson(response, 200, await updateVoice(request));
    if (request.method === 'POST' && url.pathname === '/api/voices/preview') {
      const preview = await previewVoice(request);
      response.writeHead(200, {'Content-Type': preview.contentType, 'Cache-Control': 'no-store'});
      return response.end(preview.body);
    }
    const apiKeyMatch = /^\/api\/api-keys\/([a-z0-9.-]+)$/.exec(url.pathname);
    if (apiKeyMatch && request.method === 'GET') return sendJson(response, 200, await apiKeyConnection(apiKeyMatch[1]));
    if (apiKeyMatch && request.method === 'DELETE') return sendJson(response, 200, await clearApiKey(apiKeyMatch[1]));
    if (apiKeyMatch && request.method === 'PATCH') return sendJson(response, 200, await setApiKeyDisabled(request, apiKeyMatch[1]));
    if (request.method !== 'GET') return sendJson(response, 405, {error: 'Dashboard API does not support this action.'});
    if (url.pathname === '/api/health') return sendJson(response, 200, {status: 'ok', mode: 'watermark-write'});
    if (url.pathname === '/api/overview') return sendJson(response, 200, await overview());
    if (url.pathname === '/api/videos') return sendJson(response, 200, await scanVideos());
    if (url.pathname === '/api/templates') return sendJson(response, 200, await readRegistry());
    if (url.pathname === '/api/watermark') return sendJson(response, 200, await watermarkInfo());
    if (url.pathname === '/api/api-usage') return sendJson(response, 200, await apiUsage());
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

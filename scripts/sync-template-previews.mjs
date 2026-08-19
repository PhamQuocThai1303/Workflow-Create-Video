import {mkdir, mkdtemp, readFile, rename, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const catalogUrl = 'https://tramai.net/templates';
const catalogOrigin = new URL(catalogUrl).origin;
const registryPath = path.join(root, 'src', 'templates', 'registry.ts');
const previewsDir = path.join(root, 'public', 'template-previews');
const manifestPath = path.join(previewsDir, 'manifest.json');
const imageFilePattern = /^[a-z0-9][a-z0-9-]*\.(?:png|webp|jpe?g)$/i;
const previewIdPattern = /^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/;
const youtubeIdPattern = /^[A-Za-z0-9_-]{6,}$/;
const maxImageBytes = 10 * 1024 * 1024;

function fail(message) {
  throw new Error(message);
}

async function fetchResponse(url, kind) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, {redirect: 'error', signal: controller.signal});
    if (!response.ok) fail(`Could not download ${kind}: ${response.status} ${response.statusText}.`);
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchText(url, kind) {
  return (await fetchResponse(url, kind)).text();
}

function readRegistryIds(source) {
  return new Set([...source.matchAll(/\bid:\s*"([^"]+)"/g)].map((match) => match[1]).filter((id) => previewIdPattern.test(id)));
}

function absoluteCatalogUrl(value) {
  const url = new URL(value, catalogUrl);
  if (url.origin !== catalogOrigin) fail(`Unexpected remote origin: ${url.origin}.`);
  return url.href;
}

function extractChunkUrls(html) {
  return [...html.matchAll(/<script[^>]+\bsrc="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((value) => value.startsWith('/_next/static/chunks/'))
    .map(absoluteCatalogUrl);
}

function normalizeYoutubeId(value) {
  if (youtubeIdPattern.test(value)) return value;
  try {
    const url = new URL(value);
    if (url.hostname === 'youtu.be') return url.pathname.slice(1);
    if (url.hostname.endsWith('youtube.com')) return url.searchParams.get('v') ?? '';
  } catch {
    return '';
  }
  return '';
}

function extractCatalogEntries(chunks) {
  const entries = new Map();
  const templatePattern = /\{id:"([^"]+)"[\s\S]*?thumbnail:\w+\("([^"]+)"\),youtubeUrl:\w+\("([^"]+)"\),duration:"([^"]*)"/g;

  for (const chunk of chunks) {
    for (const match of chunk.matchAll(templatePattern)) {
      const [, id, thumbnailFile, youtubeValue, duration] = match;
      if (!previewIdPattern.test(id) || !imageFilePattern.test(thumbnailFile)) continue;
      const youtubeVideoId = normalizeYoutubeId(youtubeValue);
      if (!youtubeVideoId || !youtubeIdPattern.test(youtubeVideoId)) continue;
      entries.set(id, {thumbnailFile, youtubeVideoId, duration: duration || null});
    }
  }
  return entries;
}

function localFileName(templateId, thumbnailFile) {
  const extension = path.extname(thumbnailFile).toLowerCase();
  return `${templateId.replace('/', '--')}${extension}`;
}

function findCatalogPreview(templateId, catalogEntries) {
  const exactPreview = catalogEntries.get(templateId);
  if (exactPreview) return {preview: exactPreview, sourceTemplateId: null};
  if (!templateId.startsWith('creative/')) return null;
  const sfxPreviewId = `${templateId}-sfx`;
  const sfxPreview = catalogEntries.get(sfxPreviewId);
  return sfxPreview ? {preview: sfxPreview, sourceTemplateId: sfxPreviewId} : null;
}

function isValidImage(content, filename) {
  if (filename.endsWith('.png')) {
    return content.length >= 8 && content.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (filename.endsWith('.jpg') || filename.endsWith('.jpeg')) {
    return content.length >= 3 && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff;
  }
  if (filename.endsWith('.webp')) {
    return content.length >= 12 && content.subarray(0, 4).equals(Buffer.from('RIFF')) && content.subarray(8, 12).equals(Buffer.from('WEBP'));
  }
  return false;
}

async function downloadImage(thumbnailFile) {
  const imageUrl = absoluteCatalogUrl(`/thumbnails/${thumbnailFile}`);
  const response = await fetchResponse(imageUrl, `thumbnail ${thumbnailFile}`);
  const declaredSize = Number(response.headers.get('content-length') ?? 0);
  if (Number.isFinite(declaredSize) && declaredSize > maxImageBytes) fail(`Thumbnail ${thumbnailFile} is larger than 10 MB.`);
  const content = Buffer.from(await response.arrayBuffer());
  if (content.length > maxImageBytes) fail(`Thumbnail ${thumbnailFile} is larger than 10 MB.`);
  if (!isValidImage(content, thumbnailFile)) fail(`Thumbnail ${thumbnailFile} has an unexpected file signature.`);
  return content;
}

async function main() {
  const registryIds = readRegistryIds(await readFile(registryPath, 'utf8'));
  if (!registryIds.size) fail('No template IDs were found in src/templates/registry.ts.');

  const catalogHtml = await fetchText(catalogUrl, 'template catalog');
  const chunkUrls = extractChunkUrls(catalogHtml);
  if (!chunkUrls.length) fail('The public catalog did not expose its template data bundle.');

  const chunks = await Promise.all(chunkUrls.map((url) => fetchText(url, 'template catalog data')));
  const catalogEntries = extractCatalogEntries(chunks);
  const selectedEntries = [...registryIds].map((id) => ({id, ...findCatalogPreview(id, catalogEntries)})).filter((entry) => entry.preview);
  const missingIds = [...registryIds].filter((id) => !findCatalogPreview(id, catalogEntries));
  if (!selectedEntries.length) fail('No public previews matched the current template registry.');

  await mkdir(previewsDir, {recursive: true});
  const temporaryDir = await mkdtemp(path.join(root, '.template-preview-sync-'));
  try {
    const downloaded = await Promise.all(
      selectedEntries.map(async ({id, preview, sourceTemplateId}) => {
        const content = await downloadImage(preview.thumbnailFile);
        const fileName = localFileName(id, preview.thumbnailFile);
        const temporaryFile = path.join(temporaryDir, fileName);
        await writeFile(temporaryFile, content, {flag: 'wx'});
        return {id, preview, sourceTemplateId, fileName, temporaryFile};
      }),
    );

    const previews = Object.fromEntries(
      downloaded.map(({id, preview, sourceTemplateId, fileName}) => [id, {
        thumbnailUrl: `/template-previews/${fileName}`,
        youtubeVideoId: preview.youtubeVideoId,
        duration: preview.duration,
        sourceTemplateId,
      }]),
    );
    const manifest = {schemaVersion: 1, source: catalogUrl, syncedAt: new Date().toISOString(), previews};
    const temporaryManifest = path.join(temporaryDir, 'manifest.json');
    await writeFile(temporaryManifest, `${JSON.stringify(manifest, null, 2)}\n`, {encoding: 'utf8', flag: 'wx'});

    for (const {temporaryFile, fileName} of downloaded) await rename(temporaryFile, path.join(previewsDir, fileName));
    await rename(temporaryManifest, manifestPath);

    console.log(`Synced ${downloaded.length} template previews from ${catalogUrl}.`);
    if (missingIds.length) console.log(`No public preview matched: ${missingIds.join(', ')}`);
  } finally {
    await rm(temporaryDir, {recursive: true, force: true});
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

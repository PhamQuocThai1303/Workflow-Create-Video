import {appendFile, mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptsDir, '..');
const usageDirectory = path.join(root, '.dashboard');
const usageFile = path.join(usageDirectory, 'api-usage.ndjson');

/**
 * Stores local observations of outbound provider calls. It deliberately never
 * records request text, audio content, response content, headers, or API keys.
 */
export async function recordApiUsage(event) {
  const safeEvent = {
    at: new Date().toISOString(),
    provider: String(event.provider ?? 'unknown').slice(0, 48),
    operation: String(event.operation ?? 'unknown').slice(0, 48),
    status: event.status === 'succeeded' ? 'succeeded' : 'failed',
    ...(Number.isFinite(event.inputChars) ? {inputChars: Math.max(0, Math.trunc(event.inputChars))} : {}),
    ...(Number.isFinite(event.inputBytes) ? {inputBytes: Math.max(0, Math.trunc(event.inputBytes))} : {}),
    ...(Number.isFinite(event.outputBytes) ? {outputBytes: Math.max(0, Math.trunc(event.outputBytes))} : {}),
    ...(Number.isFinite(event.durationSeconds) ? {durationSeconds: Math.max(0, event.durationSeconds)} : {}),
    ...(Number.isFinite(event.latencyMs) ? {latencyMs: Math.max(0, Math.trunc(event.latencyMs))} : {}),
    ...(typeof event.model === 'string' ? {model: event.model.slice(0, 120)} : {}),
    ...(typeof event.slug === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(event.slug) ? {slug: event.slug} : {}),
  };

  try {
    await mkdir(usageDirectory, {recursive: true});
    await appendFile(usageFile, `${JSON.stringify(safeEvent)}\n`, 'utf8');
  } catch (error) {
    // Metrics must not make the video pipeline fail.
    console.error(`⚠️  Could not record local API usage: ${error.message}`);
  }
}

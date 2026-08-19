import {spawn} from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

const dashboardDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dashboardDir, '..');
const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const api = spawn(process.execPath, [path.join(dashboardDir, 'server.mjs')], {
  cwd: root,
  stdio: 'inherit',
});
const ui = spawn(process.execPath, [viteBin, '--config', path.join(dashboardDir, 'vite.config.ts')], {
  cwd: root,
  stdio: 'inherit',
});

function stop(code = 0) {
  api.kill('SIGTERM');
  ui.kill('SIGTERM');
  process.exit(code);
}

process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
api.on('exit', (code) => stop(code ?? 1));
ui.on('exit', (code) => stop(code ?? 1));

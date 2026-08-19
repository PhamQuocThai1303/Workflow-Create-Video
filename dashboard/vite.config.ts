import {defineConfig} from 'vite';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const dashboardDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: dashboardDir,
  publicDir: path.resolve(dashboardDir, '..', 'public'),
  esbuild: {jsx: 'automatic'},
  server: {
    port: 4311,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:4310',
      '/media': 'http://127.0.0.1:4310',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});

import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Vite: 빠른 HMR + 멀티 페이지(게임 / 운영자 에디터) 번들링. JSX는 esbuild 가 preact 로 변환한다.
const root = resolve(__dirname);
export default defineConfig({
  root,
  publicDir: resolve(root, 'public'),
  esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
  resolve: { alias: { '@shared': resolve(root, '../shared') } },
  server: {
    port: 5173,
    fs: { allow: [resolve(root, '..')] },
    proxy: {
      '/socket.io': { target: 'http://localhost:3000', ws: true },
      '/api': 'http://localhost:3000',
      '/uploads': 'http://localhost:3000',
    },
  },
  build: {
    outDir: resolve(root, '../dist/client'),
    emptyOutDir: true,
    rollupOptions: { input: { main: resolve(root, 'index.html'), admin: resolve(root, 'admin.html') } },
  },
});

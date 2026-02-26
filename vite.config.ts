import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: 'src/client',
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
  },
  server: {
    port: 3001,
    host: true, // expose on LAN so you can test on real phones
  },
});

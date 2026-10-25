import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run dev` for development, `npm run build` makes one self-contained play file in dist/
export default defineConfig({
  plugins: [viteSingleFile()],
  server: { host: true, port: 5173 },
  build: { target: 'es2020', chunkSizeWarningLimit: 2000 },
});

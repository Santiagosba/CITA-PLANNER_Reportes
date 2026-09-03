import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/** Base path opcional vía `VITE_APP_BASE_PATH` (ej. `/sb`) para reverse proxy / subruta. */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const raw = (env.VITE_APP_BASE_PATH || '').trim();
  const baseSeg = raw.replace(/^\/+|\/+$/g, '');
  const base = !raw || raw === '/' ? '/' : `/${baseSeg}/`;
  const apiPort = (env.API_PORT || '3001').trim()
  return {
    base,
    plugins: [react()],
    server: {
      port: 5174,
      proxy: {
        '/api': {
          target: `http://localhost:${apiPort}`,
          changeOrigin: true,
        },
      },
    },
  };
});

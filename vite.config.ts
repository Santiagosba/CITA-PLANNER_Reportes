import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/** Base path opcional vía `VITE_APP_BASE_PATH` (ej. `/sb`) para reverse proxy / subruta. */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const raw = (env.VITE_APP_BASE_PATH || '').trim();
  const baseSeg = raw.replace(/^\/+|\/+$/g, '');
  const base = !raw || raw === '/' ? '/' : `/${baseSeg}/`;
  const devPort = Number((env.VITE_DEV_PORT || '3001').trim())
  const apiPort = (env.VITE_API_PORT || env.API_PORT || '3002').trim()
  const previewPort = Number((env.VITE_PREVIEW_PORT || '4173').trim())
  const crmPort = (env.VITE_CRM_API_PORT || '3000').trim()

  // api-crm y la API SQL no comparten rutas, así que un único origen puede servir
  // la SPA y repartir /api entre las dos. Lo usa `npm run preview` detrás del túnel.
  const proxy = {
    '^/api/(webrtc|call|calls)(/|$)': {
      target: `http://localhost:${crmPort}`,
      changeOrigin: true,
    },
    '/socket.io': {
      target: `http://localhost:${crmPort}`,
      changeOrigin: true,
      ws: true,
    },
    '/api': {
      target: `http://localhost:${apiPort}`,
      changeOrigin: true,
    },
  };

  return {
    base,
    plugins: [react()],
    server: {
      port: devPort,
      strictPort: true,
      proxy,
    },
    preview: {
      port: previewPort,
      strictPort: true,
      // El túnel llega con un Host público que Vite no conoce de antemano.
      allowedHosts: true,
      proxy,
    },
  };
});

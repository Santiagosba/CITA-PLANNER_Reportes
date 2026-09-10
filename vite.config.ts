import { defineConfig, loadEnv, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';

/** Destino del proxy /api. sslip.io de Dokploy aún no tiene certificado: forzar HTTP. */
function sqlApiProxyOrigin(env: Record<string, string>, fallbackPort: string): string {
  const raw = (env.SQL_API_PROXY_TARGET || env.VITE_SQL_API_URL || `http://localhost:${fallbackPort}`).trim()
  try {
    const url = new URL(raw)
    if (url.hostname.endsWith('.sslip.io')) url.protocol = 'http:'
    // The local API listens on IPv4; avoid resolving localhost to ::1.
    if (url.hostname === 'localhost') url.hostname = '127.0.0.1'
    return url.origin
  } catch {
    return `http://localhost:${fallbackPort}`
  }
}

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
  const sqlProxyTarget = sqlApiProxyOrigin(env, apiPort)

  // api-crm y la API SQL no comparten rutas, así que un único origen puede servir
  // la SPA y repartir /api entre las dos. Lo usa `npm run preview` detrás del túnel.
  const proxy: Record<string, ProxyOptions> = {
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
      target: sqlProxyTarget,
      changeOrigin: true,
      configure(proxy) {
        proxy.on('error', (_error, _request, response) => {
          if (!('writeHead' in response) || response.headersSent || response.writableEnded) return
          response.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8', 'Retry-After': '1' })
          response.end(JSON.stringify({ code: 'api-down', error: 'La API SQL no está disponible o se está reiniciando. Vuelve a intentarlo en unos segundos.' }))
        })
      },
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

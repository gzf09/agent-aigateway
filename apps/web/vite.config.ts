import { defineConfig, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import http from 'node:http';
import { URL } from 'node:url';

const higressTarget = process.env['VITE_HIGRESS_URL'] || 'http://localhost:8001';

// Paths that belong to the Web app or Vite — everything else goes to Higress
const webAppPaths = ['/api', '/ws', '/@', '/src/', '/node_modules/'];

function higressFallbackPlugin(): PluginOption {
  return {
    name: 'higress-fallback',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url || '/';
        const isHtml = req.headers.accept?.includes('text/html');
        const isRoot = url === '/' || url === '/index.html';
        const isWebApp = webAppPaths.some((p) => url.startsWith(p));

        if (isHtml && !isRoot && !isWebApp) {
          const target = new URL(higressTarget);
          const proxyReq = http.request(
            {
              hostname: target.hostname,
              port: target.port,
              path: url,
              method: req.method,
              headers: { ...req.headers, host: target.host },
            },
            (proxyRes) => {
              res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
              proxyRes.pipe(res);
            },
          );
          proxyReq.on('error', () => next());
          req.pipe(proxyReq);
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), higressFallbackPlugin()],
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: process.env['VITE_BFF_URL'] || 'http://localhost:3000',
        changeOrigin: true,
      },
      '/ws': {
        target: (process.env['VITE_BFF_URL'] || 'http://localhost:3000').replace('http', 'ws'),
        ws: true,
      },
      // Higress Console: static assets (absolute paths referenced in HTML)
      '/css': {
        target: higressTarget,
        changeOrigin: true,
      },
      '/js': {
        target: higressTarget,
        changeOrigin: true,
      },
      '/higress.jpg': {
        target: higressTarget,
        changeOrigin: true,
      },
      // Higress Console: API and auth (called by Higress JS at runtime)
      '/session': {
        target: higressTarget,
        changeOrigin: true,
      },
      '/v1': {
        target: higressTarget,
        changeOrigin: true,
      },
      '/system': {
        target: higressTarget,
        changeOrigin: true,
      },
    },
  },
});

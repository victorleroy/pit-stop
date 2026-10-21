import react from '@vitejs/plugin-react';
import path from 'node:path';
import {defineConfig} from 'vite';

// Everything is served from the dev server: one port is enough to share the app through a
// tunnel, and the browser talks to a single origin, so there is no CORS in development.
// The service port is configurable so the dev server can sit next to another project
// already holding 3000.
const API = process.env.VITE_PROXY_TARGET ?? 'http://localhost:3000';

export default defineConfig({
  base: '/',
  // Vendors change far less often than the app: splitting them keeps the browser cache
  // across releases, and keeps every chunk under Vite's size warning.
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/]node_modules[\\/](@mui|@emotion)[\\/]/.test(id)) return 'mui';
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) {
            return 'react';
          }
          return 'vendor';
        },
      },
    },
  },
  plugins: [react()],
  resolve: {alias: {'@': path.resolve(__dirname, './src')}},
  server: {
    allowedHosts: true,
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        changeOrigin: true,
        // The API authenticates with a bearer token only. Same-origin requests would
        // otherwise carry whatever cookies other localhost apps have set.
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyRequest) => proxyRequest.removeHeader('cookie'));
        },
        target: API,
      },
      // One process now serves both HTTP and websockets, so they share a port.
      '/ws': {
        configure: (proxy) => {
          proxy.on('proxyReqWs', (proxyRequest) => proxyRequest.removeHeader('cookie'));
        },
        target: API.replace(/^http/, 'ws'),
        ws: true,
      },
    },
    strictPort: true,
  },
});

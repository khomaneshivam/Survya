import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const env = loadEnv('', path.resolve(__dirname, '..'), '')
const BACKEND_PORT = env.PORT || process.env.PORT || '5000'
const BACKEND_TARGET = `http://127.0.0.1:${BACKEND_PORT}`

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/@xyflow') || id.includes('node_modules/reactflow')) {
            return 'vendor-xyflow';
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'vendor-icons';
          }
        }
      }
    }
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: BACKEND_TARGET,
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (err, req, res) => {
            // Ignore normal TCP resets when server restarts or client closes SSE streams
            if (err.code === 'ECONNRESET' || err.code === 'EPIPE' || err.code === 'ECONNABORTED') {
              return;
            }
            if (res && res.writeHead && !res.headersSent) {
              res.writeHead(503, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, message: 'Server is restarting, retrying...' }));
            }
          });
        }
      },
      '/webhook': {
        target: BACKEND_TARGET,
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (err, req, res) => {
            if (res && res.writeHead && !res.headersSent) {
              res.writeHead(503, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, message: 'Server is restarting, retrying...' }));
            }
          });
        }
      },
      '/uploads': {
        target: BACKEND_TARGET,
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (err, req, res) => {
            if (res && res.writeHead && !res.headersSent) {
              res.writeHead(503, { 'Content-Type': 'text/plain' });
              res.end('Upload asset unavailable temporarily.');
            }
          });
        }
      }
    }
  }
})

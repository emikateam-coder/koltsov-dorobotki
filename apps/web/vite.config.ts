import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_API_PROXY_TARGET ?? 'http://127.0.0.1:3001';
  const proxy = {
    '/me': { target: apiTarget, changeOrigin: true },
    '/health': { target: apiTarget, changeOrigin: true },
    '/events': { target: apiTarget, changeOrigin: true },
  } as const;

  return {
    plugins: [react()],
    server: {
      host: true,
      port: 5173,
      strictPort: true,
      allowedHosts: [
        '.ngrok-free.app',
        '.ngrok-free.dev',
        '.ngrok.app',
        '.ngrok.dev',
        '.ngrok.io',
        '.trycloudflare.com',
      ],
      headers: {
        'ngrok-skip-browser-warning': 'true',
      },
      proxy,
    },
    preview: {
      proxy,
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
    },
  };
});

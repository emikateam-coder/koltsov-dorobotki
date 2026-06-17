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

  // Base path для деплоя на GitHub Pages в подкаталог /<repo>/.
  // Передаётся CI как переменная окружения VITE_BASE_PATH (например "/koltsov-dorobotki/").
  const base = env.VITE_BASE_PATH && env.VITE_BASE_PATH.length > 0 ? env.VITE_BASE_PATH : '/';

  return {
    base,
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

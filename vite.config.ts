import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, (process as any).cwd(), '');
  
  return {
    plugins: [react()],
    root: '.', // กำหนด Root directory เป็นโฟลเดอร์ปัจจุบัน
    build: {
      outDir: 'dist',
    },
    server: {
      port: 3000,
    },
    define: {
      // Polyfill process.env.API_KEY so it works in the browser
      // It tries to find API_KEY, VITE_API_KEY, or falls back to system process.env
      'process.env.API_KEY': JSON.stringify(env.API_KEY || env.VITE_API_KEY || process.env.API_KEY),
    },
  };
});
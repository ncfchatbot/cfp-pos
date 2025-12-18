import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, (process as any).cwd(), '');
  
  return {
    plugins: [react()],
    root: '.',
    build: {
      outDir: 'dist',
    },
    server: {
      port: 3000,
    },
    define: {
      'process.env.API_KEY': JSON.stringify(env.API_KEY || env.VITE_API_KEY || process.env.API_KEY),
      // แซงค่า FIREBASE_CONFIG เข้าไปในระบบเพื่อให้ทุก Device ใช้ชุดเดียวกัน
      'process.env.FIREBASE_CONFIG': JSON.stringify(env.FIREBASE_CONFIG || env.VITE_FIREBASE_CONFIG || ''),
    },
  };
});
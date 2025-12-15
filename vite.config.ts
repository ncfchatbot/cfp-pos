import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  root: '.', // กำหนด Root directory เป็นโฟลเดอร์ปัจจุบัน (เพราะไม่มีโฟลเดอร์ src)
  build: {
    outDir: 'dist',
  },
  server: {
    port: 3000,
  }
});
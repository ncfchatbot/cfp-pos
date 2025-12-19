
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Use a type assertion to 'any' for the process object to fix the "Property 'cwd' does not exist on type 'Process'" error.
  // This is a common TypeScript issue in Vite configs where Node types might not be globally recognized.
  const env = loadEnv(mode, (process as any).cwd(), '');
  
  return {
    plugins: [react()],
    root: '.',
    build: {
      outDir: 'dist',
      rollupOptions: {
        output: {
          manualChunks: undefined,
        }
      }
    },
    define: {
      'process.env.API_KEY': JSON.stringify(env.API_KEY || env.VITE_API_KEY || ''),
      'process.env.FIREBASE_CONFIG': JSON.stringify(env.FIREBASE_CONFIG || env.VITE_FIREBASE_CONFIG || ''),
    },
  };
});

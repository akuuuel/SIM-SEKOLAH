import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true, // Mengizinkan akses dari HP & perangkat lain di jaringan Wi-Fi lokal
    port: 3000,
    open: true,
  },
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          // Pisahkan library besar ke dalam vendor chunk tersendiri agar di-cache permanen oleh browser
          'vendor-react': ['react', 'react-dom'],
          'vendor-dexie': ['dexie', 'dexie-react-hooks'],
          'vendor-icons': ['lucide-react'],
        },
      },
    },
  },
});


import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'build',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
        output: {
            manualChunks: {
                vendor: ['react', 'react-dom', 'react-router-dom'],
                utils: ['jspdf', 'jsbarcode', 'sweetalert2', 'lucide-react', 'recharts']
            }
        }
    }
  }
});
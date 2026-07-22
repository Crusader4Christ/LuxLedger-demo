import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/demo': mode === 'test' ? 'http://127.0.0.1:3100' : 'http://127.0.0.1:3000',
    },
  },
}));

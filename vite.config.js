import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// For production (GitHub Pages project site) assets must be served from the
// repo subpath; dev stays at root. Override with BASE env if hosting elsewhere.
export default defineConfig(({ command }) => ({
  // relative base → the same dist works on GitHub Pages (subpath), Netlify/Vercel
  // (root), or opened as a file. Override with BASE env if a host needs otherwise.
  base: process.env.BASE ?? (command === 'build' ? './' : '/'),
  plugins: [react()],
  server: { port: 5173 },
}));

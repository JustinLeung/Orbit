import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      // Proxy to local Supabase Mailpit so the dev OTP helper can read
      // sign-in emails without tripping CORS.
      '/__mailpit': {
        target: 'http://127.0.0.1:54424',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/__mailpit/, ''),
      },
    },
  },
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  publicDir: 'img',
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5178',
        changeOrigin: true
      }
    }
  }
})

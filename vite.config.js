import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Prevent duplicate React instances which can cause hook errors
    dedupe: ['react', 'react-dom'],
  },
  build: {
    // App.jsx is intentionally large — suppress the chunk size warning
    chunkSizeWarningLimit: 5000,
  },
})

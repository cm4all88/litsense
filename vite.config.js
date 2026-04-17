import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom', '@clerk/clerk-react'],
  },
  build: {
    // Minification disabled — esbuild's scope-flattening on large single-component
    // files misorients const bindings causing TDZ at runtime. The bundle is served
    // over Vercel CDN with gzip which brings unminified ~500KB down to ~150KB.
    // No meaningful performance difference for end users.
    minify: false,
    chunkSizeWarningLimit: 5000,
  },
})

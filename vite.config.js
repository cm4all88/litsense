import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom', '@clerk/clerk-react'],
  },
  build: {
    // Disable minification — esbuild is creating const bindings with incorrect
    // initialization order, causing TDZ at runtime. Unminified code preserves
    // JS function hoisting and source declaration order.
    minify: false,
    chunkSizeWarningLimit: 5000,
  },
})

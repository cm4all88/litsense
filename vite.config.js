import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  build: {
    rollupOptions: {
      // Disable tree-shaking — this is what converts `function X()` declarations
      // to `const X =` bindings in the bundle output, breaking JS hoisting
      // and causing "Cannot access 'X' before initialization" TDZ errors.
      treeshake: false,
      output: {
        manualChunks: () => 'bundle',
        hoistTransitiveImports: false,
      },
    },
    chunkSizeWarningLimit: 5000,
  },
})

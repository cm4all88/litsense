import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],

  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'lucide-react',
      '@clerk/clerk-react',
      '@supabase/supabase-js',
    ],
  },

  build: {
    // Single output bundle — no chunk splitting, no cross-chunk TDZ possible.
    // App.jsx + all vendor code evaluates in one deterministic pass.
    rollupOptions: {
      output: {
        manualChunks: () => 'bundle',
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames:  'assets/[name]-[hash].js',
      },
    },
    // LitSense is intentionally a large single-file app
    chunkSizeWarningLimit: 5000,
  },
})

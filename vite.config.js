import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],

  // Pre-bundle deps that have known ESM initialization issues in Vite 6.
  // Clerk v5 uses live bindings that can cause TDZ when Rollup tree-shakes
  // the module graph across chunk boundaries.
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'lucide-react',
      '@clerk/clerk-react',
      '@supabase/supabase-js',
    ],
    // Force re-optimization on each build to avoid stale dep cache
    force: false,
  },

  build: {
    rollupOptions: {
      output: {
        // Keep all app code in a single chunk.
        // Vite 6's automatic code splitting can reorder module evaluation,
        // causing "Cannot access 'X' before initialization" TDZ errors
        // when const declarations in App.jsx are placed across chunks.
        manualChunks(id) {
          // All node_modules → one vendor chunk
          if (id.includes('node_modules')) {
            // Clerk and Supabase together to avoid circular chunk deps
            if (
              id.includes('@clerk') ||
              id.includes('@supabase') ||
              id.includes('stripe')
            ) {
              return 'vendor-auth';
            }
            return 'vendor';
          }
          // All app code (including App.jsx, supabase.js, etc.) → single chunk
          // This is the key fix: prevents Rollup from splitting App.jsx
          // across chunks which causes the TDZ on large single-file modules.
          return 'index';
        },
      },
    },
    // Raise the warning limit — App.jsx is intentionally large
    chunkSizeWarningLimit: 2000,
  },
})

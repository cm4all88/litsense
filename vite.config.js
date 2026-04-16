import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom', '@clerk/clerk-react'],
  },
  // Force Clerk to pre-bundle as CJS — prevents live-binding TDZ when
  // supabase.js or App.jsx imports Clerk exports at module init time.
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      '@clerk/clerk-react',
      '@supabase/supabase-js',
      'lucide-react',
    ],
  },
  build: {
    chunkSizeWarningLimit: 5000,
  },
})

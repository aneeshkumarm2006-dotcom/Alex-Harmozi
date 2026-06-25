import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// Read the SINGLE root .env (one file for the whole project). We map only the
// two browser-safe values into the client bundle. SUPABASE_SERVICE_KEY /
// VOYAGE_API_KEY / ANTHROPIC_API_KEY are never referenced here, so they are
// NOT exposed to the browser -- they stay backend-only.
const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, '') // '' = load all names, no prefix filter
  // Local dev reads the root .env; hosts (Vercel) inject via process.env.
  const pick = (k) => env[k] || process.env[k] || ''
  return {
    plugins: [react()],
    // Accept either VITE_-prefixed or plain names, from .env or the host.
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(pick('VITE_SUPABASE_URL') || pick('SUPABASE_URL')),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(pick('VITE_SUPABASE_ANON_KEY') || pick('SUPABASE_ANON_KEY')),
      'import.meta.env.VITE_API_URL': JSON.stringify(pick('VITE_API_URL')),
    },
    server: {
      port: 5173,
      proxy: {
        '/chat': 'http://localhost:8000',
        '/health': 'http://localhost:8000',
      },
    },
  }
})

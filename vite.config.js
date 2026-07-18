import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// The ERP API is plain HTTP. In dev we hit it through this proxy so the app
// stays same-origin (avoids any mixed-content / firewall surprises). The
// client fetches "/erp-api" and Vite forwards it to the ERP host.
// The target origin is read from .env (ERP_API_ORIGIN).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const origin = env.ERP_API_ORIGIN || 'http://eksai12.ddns.net:8786'
  return {
    plugins: [react()],
    server: {
      host: true,
      proxy: {
        '/erp-api': {
          target: origin,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/erp-api/, '/ek_api'),
        },
      },
    },
  }
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The proxy forwards /api and live sockets to the backend, so the browser sees ONE origin (no CORS problems).
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // lets your phone open the app over Wi-Fi later
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
      '/socket.io': { target: 'http://localhost:4000', ws: true },
    },
  },
})
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  build: { rolldownOptions: { output: { codeSplitting: { groups: [{ name: 'vendor', test: /node_modules/, minSize: 30_000, maxSize: 240_000, priority: 1 }] } } } },
  plugins: [react(), tailwindcss(), VitePWA({
    strategies: 'injectManifest', srcDir: 'src', filename: 'sw.ts', registerType: 'autoUpdate',
    injectManifest: { globPatterns: ['**/*.{js,css,html,svg,woff2}'] },
    manifest: { name: 'Gym Progress', short_name: 'Gym Progress', description: 'Your private gym log and progressive overload coach.', theme_color: '#f5f6f2', background_color: '#f5f6f2', display: 'standalone', start_url: '/', icons: [{ src: '/app-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }] },
  })],
})

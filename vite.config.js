import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        generator: resolve(__dirname, 'generator.html'),
        input: resolve(__dirname, 'input.html'),
        scan: resolve(__dirname, 'scan.html'),
        pelaporan: resolve(__dirname, 'pelaporan.html'),
        'daftar-data': resolve(__dirname, 'daftar-data.html'),
        'history': resolve(__dirname, 'history.html'),
        'daftar-pelaporan': resolve(__dirname, 'daftar-pelaporan.html')
      }
    }
  }
})

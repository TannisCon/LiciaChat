import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: '../static/dist', // 构建目录
    emptyOutDir: true,     // (推荐) 每次构建前自动清空该目录，防止旧文件残留
  },
})
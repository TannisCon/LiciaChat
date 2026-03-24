import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      // 自定义插件，修复和清理字体预加载
      name: 'fix-and-clean-font-preload',
      transformIndexHtml(html) {
        return html
          // 删除 KaTeX 字体 preload
          .replace(
            /<link[^>]*href="[^"]*KaTeX_[^"]*\.woff2"[^>]*rel=["']preload["'][^>]*>/gi,
            ''
          )
          // 修复剩余 font preload CORS报错（别的字体）
          .replace(
            /<link\s+([^>]*rel=["']preload["'][^>]*as=["']font["'][^>]*|[^>]*as=["']font["'][^>]*rel=["']preload["'][^>]*)>/gi,
            (match, attrs) => {
              if (/crossorigin/i.test(attrs)) return match;
              return `<link ${attrs} crossorigin="anonymous">`;
            }
          );
      }
    }
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/v1': {
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
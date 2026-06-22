import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: '0.0.0.0', // 允许从外部访问
    open: false, // 禁用自动打开浏览器（在 Docker 中不需要）
    // 允许通过 Cloudflare Tunnel 的临时域名和自定义域名访问
    allowedHosts: [
      '.trycloudflare.com',
      'app.liuxingyu.fun',
      'api.liuxingyu.fun'
    ]
  }
})


import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: '0.0.0.0', // 允许从外部访问
    open: false // 禁用自动打开浏览器（在 Docker 中不需要）
  }
})


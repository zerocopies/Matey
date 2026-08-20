import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

function stripCrossorigin() {
  return {
    name: 'strip-crossorigin',
    enforce: 'post',
    transformIndexHtml(html) {
      return html.replace(/ crossorigin/g, '')
    }
  }
}

export default defineConfig({
  plugins: [tailwindcss(), react(), stripCrossorigin()],
  base: './',
  server: {
    host: '0.0.0.0',
    port: 37245,
    strictPort: true,
    watch: {
      ignored: ['**/.gradle-home/**']
    }
  }
})

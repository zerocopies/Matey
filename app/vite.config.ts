import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

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
  root: '.',
  plugins: [tailwindcss(), react(), stripCrossorigin()],
  base: './',
  server: {
    host: '0.0.0.0',
    port: 37245,
    strictPort: true,
    watch: {
      ignored: ['**/.gradle-home/**']
    }
  },
  build: {
    rollupOptions: {
      input: {
        'agent-bundle': resolve(__dirname, 'agent-entry/agent-bundle.js')
      },
      output: {
        dir: 'public',
        entryFileNames: 'matey-agent-bundle.js',
        chunkFileNames: 'web.[hash].js',
        assetFileNames: '[name].[hash].[ext]'
      }
    },
    emptyOutDir: false,
    outDir: 'public'
  }
})

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import path from 'path'

const pkgPath = fileURLToPath(new URL('./package.json', import.meta.url))
const appPackageVersion = JSON.parse(readFileSync(pkgPath, 'utf-8')).version as string

const electronVersionDefine = {
  __APP_PACKAGE_VERSION__: JSON.stringify(appPackageVersion),
}

export default defineConfig({
  base: './',
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appPackageVersion),
  },
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          define: electronVersionDefine,
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: [
                'pdf-parse',
                'pdf-parse/worker',
                '@napi-rs/canvas',
                /^@napi-rs\/canvas-.*/,
                'better-sqlite3',
                // AWS SDK + Smithy: bundling breaks tslib/__extends interop in Electron main
                /^@aws-sdk\/.*/,
                /^@smithy\/.*/,
              ],
            },
          },
        },
      },
      {
        entry: 'electron/preload.ts',
        onstart(args) {
          args.reload()
        },
        vite: {
          define: electronVersionDefine,
          build: {
            outDir: 'dist-electron',
          },
        },
      },
    ]),
    renderer(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})

import { readFileSync } from 'node:fs'
import { defineConfig } from 'vitest/config'
import path from 'node:path'

const appPackageVersion = JSON.parse(
  readFileSync(path.join(__dirname, 'package.json'), 'utf-8')
).version as string

export default defineConfig({
  define: {
    __APP_PACKAGE_VERSION__: JSON.stringify(appPackageVersion),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['**/*.{test,spec}.{ts,tsx}'],
    globals: false,
  },
})

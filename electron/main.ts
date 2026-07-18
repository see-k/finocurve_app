import { app, BrowserWindow, ipcMain, net, protocol } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'
import { registerS3Handlers } from './s3Handlers'
import { registerLocalStorageHandlers } from './localStorageHandlers'
import { registerTrackerHandlers } from './trackerHandlers'
import { registerAIHandlers } from './aiHandlers'
import { registerPriceHandlers } from './priceHandlers'
import { registerCongressHandlers } from './congressHandlers'
import { registerSECHandlers } from './secHandlers'
import { registerPluginSettingsHandlers } from './pluginSettingsHandlers'
import { registerMCPHandlers } from './mcpHandlers'
import { registerCoreDataHandlers } from './coreDataHandlers'
import { closeCoreDataDb } from './coreDataDb'
import { stopMCPServers } from './mcpServer'
import { setMainWindow } from './mainWindow'

const APP_PROTOCOL_SCHEME = 'app'
const APP_PROTOCOL_HOST = 'local'

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_PROTOCOL_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
])

process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = app.isPackaged
  ? process.env.DIST
  : path.join(process.env.DIST, '../public')

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {

let win: BrowserWindow | null

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

function registerAppProtocol() {
  protocol.handle(APP_PROTOCOL_SCHEME, (request) => {
    const requestUrl = new URL(request.url)
    const rawPath = decodeURIComponent(requestUrl.pathname || '/')
    const relativePath = rawPath === '/' ? 'index.html' : rawPath.replace(/^\/+/, '')
    const normalizedPath = path.normalize(relativePath)
    const safeRelativePath = normalizedPath.startsWith('..') ? 'index.html' : normalizedPath

    let filePath = path.join(process.env.DIST!, safeRelativePath)
    if (!fs.existsSync(filePath)) {
      filePath = path.join(process.env.DIST!, 'index.html')
    }

    return net.fetch(pathToFileURL(filePath).toString())
  })
}

function createWindow() {
  win = new BrowserWindow({
    title: `FinoCurve v${app.getVersion()}`,
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    icon: path.join(process.env.VITE_PUBLIC!, 'icon.png'),
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: !app.isPackaged,
    },
    backgroundColor: '#1A1A2E',
    show: false,
  })

  win.once('ready-to-show', () => {
    win?.show()
  })

  setMainWindow(win)
  win.on('closed', () => {
    setMainWindow(null)
    win = null
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadURL(`${APP_PROTOCOL_SCHEME}://${APP_PROTOCOL_HOST}/index.html`)
  }
}

function registerEnterpriseHandlers() {
  ipcMain.handle('enterprise-check', async (_event, payload: { url?: string }) => {
    try {
      const baseUrl = new URL(payload?.url ?? '')
      if (!['http:', 'https:'].includes(baseUrl.protocol)) return { available: false }
      baseUrl.pathname = `${baseUrl.pathname.replace(/\/+$/, '')}/healthz`
      baseUrl.search = ''
      baseUrl.hash = ''

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5000)
      try {
        const response = await net.fetch(baseUrl.toString(), { signal: controller.signal })
        if (!response.ok) return { available: false, status: response.status }
        const data = await response.json() as { status?: string }
        return { available: data.status === 'ok', status: response.status }
      } finally {
        clearTimeout(timeout)
      }
    } catch (error) {
      return { available: false, error: error instanceof Error ? error.message : 'Service unavailable' }
    }
  })

  const allowedEnterprisePaths = new Set([
    '/api/reports/balances',
    '/api/balance-history',
    '/api/health/connections',
    '/api/reports/transactions',
  ])

  ipcMain.handle('enterprise-request', async (_event, payload: { url?: string; path?: string; refresh?: boolean }) => {
    try {
      const pathName = payload?.path ?? ''
      if (!allowedEnterprisePaths.has(pathName)) {
        return { ok: false, status: 400, error: 'Enterprise API path is not allowed' }
      }

      const requestUrl = new URL(payload?.url ?? '')
      if (!['http:', 'https:'].includes(requestUrl.protocol)) {
        return { ok: false, status: 400, error: 'Enterprise service URL must use HTTP or HTTPS' }
      }
      requestUrl.pathname = `${requestUrl.pathname.replace(/\/+$/, '')}${pathName}`
      requestUrl.search = payload?.refresh ? 'refresh=1' : ''
      requestUrl.hash = ''

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 20000)
      try {
        const response = await net.fetch(requestUrl.toString(), {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        })
        const body = await response.text()
        let data: unknown
        try {
          data = body ? JSON.parse(body) : null
        } catch {
          return { ok: false, status: response.status, error: 'Service returned an invalid response' }
        }
        if (!response.ok) {
          const message = data && typeof data === 'object' && 'error' in data
            ? String((data as { error: unknown }).error)
            : `Finocurve Service returned ${response.status}`
          return { ok: false, status: response.status, error: message }
        }
        return { ok: true, status: response.status, data }
      } finally {
        clearTimeout(timeout)
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return { ok: false, error: 'Finocurve Service took too long to respond. Try again.' }
      }
      return { ok: false, error: error instanceof Error ? error.message : 'Service unavailable' }
    }
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('before-quit', () => {
  stopMCPServers().catch(() => {})
  closeCoreDataDb()
})

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(() => {
  registerAppProtocol()
  registerS3Handlers()
  registerLocalStorageHandlers()
  registerTrackerHandlers()
  registerAIHandlers()
  registerPriceHandlers()
  registerCongressHandlers()
  registerSECHandlers()
  registerPluginSettingsHandlers()
  registerMCPHandlers()
  registerCoreDataHandlers()
  registerEnterpriseHandlers()
  createWindow()
})

} // end single-instance lock guard

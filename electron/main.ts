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
import {
  fetchEnterprisePath,
  normalizeEnterpriseUrl,
  readEnterpriseServiceUrl,
  saveEnterpriseServiceUrl,
} from './enterpriseHandlers'

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
  ipcMain.handle('enterprise-get-url', async () => ({ url: readEnterpriseServiceUrl() }))

  ipcMain.handle('enterprise-set-url', async (_event, payload: { url?: string }) => {
    const normalized = normalizeEnterpriseUrl(payload?.url ?? '')
    if (normalized === null) {
      return { ok: false, error: 'Enter a valid http:// or https:// URL' }
    }
    try {
      saveEnterpriseServiceUrl(normalized)
      return { ok: true, url: normalized }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Could not save the service URL' }
    }
  })

  ipcMain.handle('enterprise-check', async (_event, payload: { url?: string }) => {
    try {
      const baseUrl = new URL(payload?.url?.trim() || readEnterpriseServiceUrl())
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

  const allowedEnterprisePaths = new Map<string, 'GET' | 'POST'>([
    ['/api/reports/balances', 'GET'],
    ['/api/balance-history', 'GET'],
    ['/api/health/connections', 'GET'],
    ['/api/reports/transactions', 'GET'],
    ['/api/balance-history/snapshot', 'POST'],
  ])

  ipcMain.handle('enterprise-request', async (_event, payload: { path?: string; refresh?: boolean; method?: string }) => {
    const pathName = payload?.path ?? ''
    const method = payload?.method === 'POST' ? 'POST' : 'GET'
    if (allowedEnterprisePaths.get(pathName) !== method) {
      return { ok: false, status: 400, error: 'Enterprise API path is not allowed' }
    }
    return fetchEnterprisePath(pathName, method, { refresh: payload?.refresh })
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

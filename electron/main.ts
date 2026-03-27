import { app, BrowserWindow, net, protocol } from 'electron'
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
import { stopMCPServers } from './mcpServer'

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

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadURL(`${APP_PROTOCOL_SCHEME}://${APP_PROTOCOL_HOST}/index.html`)
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('before-quit', () => {
  stopMCPServers().catch(() => {})
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
  createWindow()
})

} // end single-instance lock guard

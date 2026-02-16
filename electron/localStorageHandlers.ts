import { ipcMain, app, dialog, BrowserWindow } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

const CONFIG_FILENAME = 'finocurve-local-storage.json'

interface LocalStorageConfig {
  directoryPath: string
}

function getConfigPath(): string {
  return path.join(app.getPath('userData'), CONFIG_FILENAME)
}

function loadConfig(): LocalStorageConfig | null {
  try {
    const filePath = getConfigPath()
    if (!fs.existsSync(filePath)) return null
    const raw = fs.readFileSync(filePath, 'utf-8')
    const config = JSON.parse(raw) as LocalStorageConfig
    if (!config.directoryPath || !fs.existsSync(config.directoryPath)) return null
    return config
  } catch {
    return null
  }
}

function saveConfig(dirPath: string): void {
  const data: LocalStorageConfig = { directoryPath: dirPath }
  const filePath = getConfigPath()
  fs.writeFileSync(filePath, JSON.stringify(data), 'utf-8')
}

function clearConfig(): void {
  try {
    const filePath = getConfigPath()
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  } catch {
    /* ignore */
  }
}

function getFullPath(key: string): string {
  const config = loadConfig()
  if (!config) throw new Error('Local storage not configured')
  return path.join(config.directoryPath, key)
}

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

export function registerLocalStorageHandlers(): void {
  ipcMain.handle('local-storage-choose-directory', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory'],
      title: 'Choose folder for FinoCurve reports and documents',
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { path: null }
    }
    const dirPath = result.filePaths[0]
    saveConfig(dirPath)
    return { path: dirPath }
  })

  ipcMain.handle('local-storage-get-path', async () => {
    const config = loadConfig()
    return { path: config?.directoryPath ?? null }
  })

  ipcMain.handle('local-storage-clear-path', async () => {
    clearConfig()
    return { ok: true }
  })

  ipcMain.handle('local-storage-has-path', async () => {
    const config = loadConfig()
    return !!config
  })

  ipcMain.handle('local-storage-save-file', async (_event, payload: { key: string; buffer: number[] }) => {
    const { key, buffer } = payload
    const fullPath = getFullPath(key)
    const dir = path.dirname(fullPath)
    ensureDir(dir)
    fs.writeFileSync(fullPath, Buffer.from(buffer))
    return { ok: true }
  })

  ipcMain.handle('local-storage-list', async (_event, payload: { prefix: string }) => {
    const config = loadConfig()
    if (!config) return { items: [] }

    const prefix = payload.prefix || ''
    const baseDir = path.join(config.directoryPath, prefix)
    if (!fs.existsSync(baseDir)) return { items: [] }

    const items: { key: string; size: number; lastModified: string }[] = []

    function walkDir(dir: string, relPrefix: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const ent of entries) {
        const fullPath = path.join(dir, ent.name)
        const relPath = relPrefix ? `${relPrefix}${ent.name}` : ent.name
        if (ent.isDirectory()) {
          walkDir(fullPath, `${relPath}/`)
        } else {
          const stat = fs.statSync(fullPath)
          items.push({
            key: `${prefix}${relPath}`,
            size: stat.size,
            lastModified: stat.mtime.toISOString(),
          })
        }
      }
    }

    walkDir(baseDir, '')
    return { items }
  })

  ipcMain.handle('local-storage-open-file', async (_event, payload: { key: string }) => {
    const { shell } = await import('electron')
    const fullPath = getFullPath(payload.key)
    if (!fs.existsSync(fullPath)) throw new Error('File not found')
    await shell.openPath(fullPath)
    return { ok: true }
  })

  ipcMain.handle('local-storage-delete-file', async (_event, payload: { key: string }) => {
    const fullPath = getFullPath(payload.key)
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath)
    }
    return { ok: true }
  })
}

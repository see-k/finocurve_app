/**
 * MCP (Model Context Protocol) IPC handlers.
 * Manages MCP config file selection, server lifecycle, and settings persistence.
 */

import { ipcMain, dialog, BrowserWindow } from 'electron'
import { loadMCPStorageConfig, saveMCPStorageConfig } from './mcpConfigStorage'
import {
  parseMCPConfig,
  startMCPServers,
  stopMCPServers,
  getMCPServerStatuses,
  isMCPRunning,
  getAllMCPTools,
  callMCPTool,
} from './mcpServer'

export function registerMCPHandlers(): void {
  // Open a file picker to select the MCP JSON config file, validate and persist the path
  ipcMain.handle('mcp:select-config-file', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win!, {
      title: 'Select MCP Server Config File',
      filters: [{ name: 'JSON Config', extensions: ['json'] }],
      properties: ['openFile'],
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { path: null }
    }
    const filePath = result.filePaths[0]
    const { servers, error } = parseMCPConfig(filePath)
    if (error && servers.length === 0) {
      return { path: null, error }
    }
    saveMCPStorageConfig({ configFilePath: filePath })
    return { path: filePath }
  })

  ipcMain.handle('mcp:get-config-path', () => {
    const config = loadMCPStorageConfig()
    return { path: config?.configFilePath || null }
  })

  ipcMain.handle('mcp:clear-config-path', () => {
    saveMCPStorageConfig({ configFilePath: '' })
    return { ok: true }
  })

  ipcMain.handle('mcp:load-servers', () => {
    const config = loadMCPStorageConfig()
    if (!config?.configFilePath) return { servers: [], error: 'No config file selected' }
    return parseMCPConfig(config.configFilePath)
  })

  ipcMain.handle('mcp:start-servers', async () => {
    const config = loadMCPStorageConfig()
    if (!config?.configFilePath) return { ok: false, error: 'No config file selected' }
    const { servers, error } = parseMCPConfig(config.configFilePath)
    if (error && servers.length === 0) return { ok: false, error }
    const statuses = await startMCPServers(servers)
    return { ok: true, statuses }
  })

  ipcMain.handle('mcp:stop-servers', async () => {
    await stopMCPServers()
    return { ok: true }
  })

  ipcMain.handle('mcp:get-status', () => {
    return { running: isMCPRunning(), servers: getMCPServerStatuses() }
  })

  ipcMain.handle('mcp:get-settings', () => {
    const config = loadMCPStorageConfig()
    return {
      configFilePath: config?.configFilePath || null,
      autoStart: config?.autoStart ?? false,
    }
  })

  ipcMain.handle('mcp:update-settings', (_event, settings: { autoStart?: boolean }) => {
    try {
      if (settings.autoStart !== undefined) {
        saveMCPStorageConfig({ autoStart: settings.autoStart })
      }
      return { ok: true }
    } catch {
      return { ok: false, error: 'Failed to save MCP settings' }
    }
  })

  // =============================================
  // Auto-start MCP servers if configured
  // =============================================
  const storedConfig = loadMCPStorageConfig()
  if (storedConfig?.autoStart && storedConfig.configFilePath) {
    const { servers } = parseMCPConfig(storedConfig.configFilePath)
    if (servers.length > 0) {
      startMCPServers(servers).catch(() => {
        // Ignore auto-start errors
      })
    }
  }
}

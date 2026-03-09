/**
 * MCP configuration storage - persists the MCP server config file path to userData.
 * Follows the same pattern as aiConfigStorage.ts.
 */

import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

const CONFIG_FILENAME = 'finocurve-mcp-config.json'

export interface MCPStorageConfig {
  configFilePath: string
  autoStart: boolean
}

function getStoragePath(): string {
  return path.join(app.getPath('userData'), CONFIG_FILENAME)
}

export function loadMCPStorageConfig(): MCPStorageConfig | null {
  try {
    const filePath = getStoragePath()
    if (!fs.existsSync(filePath)) return null
    const raw = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(raw) as MCPStorageConfig
  } catch {
    return null
  }
}

export function saveMCPStorageConfig(update: Partial<MCPStorageConfig>): void {
  const existing = loadMCPStorageConfig() ?? { configFilePath: '', autoStart: false }
  const merged: MCPStorageConfig = { ...existing, ...update }
  fs.writeFileSync(getStoragePath(), JSON.stringify(merged, null, 2), 'utf-8')
}

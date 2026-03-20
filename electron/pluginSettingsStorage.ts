/**
 * Plugin / integration settings stored in userData (main process only).
 */

import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

export interface StoredPluginSettings {
  fmpApiKey?: string
}

const CONFIG_FILENAME = 'finocurve-plugin-settings.json'

function getConfigPath(): string {
  return path.join(app.getPath('userData'), CONFIG_FILENAME)
}

export function loadPluginSettings(): StoredPluginSettings {
  try {
    const filePath = getConfigPath()
    if (!fs.existsSync(filePath)) return {}
    const raw = fs.readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<StoredPluginSettings>
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

export function savePluginSettings(settings: StoredPluginSettings): void {
  const filePath = getConfigPath()
  fs.writeFileSync(filePath, JSON.stringify(settings, null, 2), 'utf-8')
}

/** API key for FMP congressional endpoints — never sent to renderer. */
export function getFmpApiKey(): string | null {
  const key = loadPluginSettings().fmpApiKey
  return key && key.trim() ? key.trim() : null
}

export function isFmpApiKeyConfigured(): boolean {
  return getFmpApiKey() !== null
}

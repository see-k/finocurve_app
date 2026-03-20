/**
 * IPC for plugin / integration settings (renderer configures; secrets stay in main).
 */

import { ipcMain } from 'electron'
import { loadPluginSettings, savePluginSettings, isFmpApiKeyConfigured } from './pluginSettingsStorage'

const MASK = '••••••••'

export function registerPluginSettingsHandlers(): void {
  ipcMain.handle('plugins-fmp-is-configured', async () => ({
    configured: isFmpApiKeyConfigured(),
  }))

  ipcMain.handle('plugins-settings-get', async () => {
    const s = loadPluginSettings()
    const has = !!(s.fmpApiKey && s.fmpApiKey.trim())
    return {
      fmpApiKey: has ? MASK : '',
    }
  })

  ipcMain.handle(
    'plugins-settings-save',
    async (_event, payload: { fmpApiKey: string }) => {
      const existing = loadPluginSettings()
      const incoming = (payload.fmpApiKey ?? '').trim()
      if (!incoming) {
        savePluginSettings({ ...existing, fmpApiKey: undefined })
      } else if (incoming === MASK) {
        /* unchanged masked value — keep stored key */
      } else {
        savePluginSettings({ ...existing, fmpApiKey: incoming })
      }
      return { ok: true }
    }
  )
}

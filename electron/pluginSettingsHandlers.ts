/**
 * IPC for plugin / integration settings (renderer configures; secrets stay in main).
 */

import { ipcMain } from 'electron'
import { loadPluginSettings, savePluginSettings, isFmpApiKeyConfigured } from './pluginSettingsStorage'

/** Must match `src/shared/fmpPluginMask.ts` (renderer uses that module). */
const FMP_PLUGIN_API_KEY_MASK = '••••••••' as const

export function registerPluginSettingsHandlers(): void {
  ipcMain.handle('plugins-fmp-is-configured', async () => ({
    configured: isFmpApiKeyConfigured(),
  }))

  ipcMain.handle('plugins-settings-get', async () => {
    const s = loadPluginSettings()
    const has = !!(s.fmpApiKey && s.fmpApiKey.trim())
    return {
      fmpApiKey: has ? FMP_PLUGIN_API_KEY_MASK : '',
    }
  })

  ipcMain.handle(
    'plugins-settings-save',
    async (_event, payload: { fmpApiKey: unknown }) => {
      const existing = loadPluginSettings()
      const raw = payload?.fmpApiKey
      const incoming = typeof raw === 'string' ? raw.trim() : ''
      if (!incoming) {
        savePluginSettings({ ...existing, fmpApiKey: undefined })
      } else if (incoming === FMP_PLUGIN_API_KEY_MASK) {
        /* unchanged masked value — keep stored key */
      } else {
        savePluginSettings({ ...existing, fmpApiKey: incoming })
      }
      return { ok: true }
    }
  )
}

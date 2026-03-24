/**
 * Plugin / integration settings stored in userData (main process only).
 * FMP API key is encrypted at rest via Electron safeStorage (same pattern as S3 secret).
 */

import { app, safeStorage } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

export interface StoredPluginSettings {
  fmpApiKey?: string
}

interface PersistedShape {
  fmpApiKeyEncrypted?: string
  /** Legacy plaintext — migrated to fmpApiKeyEncrypted on read */
  fmpApiKey?: string
}

const CONFIG_FILENAME = 'finocurve-plugin-settings.json'

function getConfigPath(): string {
  return path.join(app.getPath('userData'), CONFIG_FILENAME)
}

function readPersisted(): PersistedShape {
  try {
    const filePath = getConfigPath()
    if (!fs.existsSync(filePath)) return {}
    const raw = fs.readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== 'object' || parsed === null) return {}
    return parsed as PersistedShape
  } catch {
    return {}
  }
}

function writePersisted(data: PersistedShape): void {
  const filePath = getConfigPath()
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

function persistEncryptedPlaintext(plain: string | undefined): void {
  if (!plain) {
    writePersisted({})
    return
  }
  const encryptedBuffer = safeStorage.encryptString(plain)
  writePersisted({
    fmpApiKeyEncrypted: encryptedBuffer.toString('base64'),
  })
}

function decryptStoredKey(encBase64: string): string | null {
  try {
    const s = safeStorage.decryptString(Buffer.from(encBase64, 'base64'))
    return s.trim() || null
  } catch {
    return null
  }
}

export function loadPluginSettings(): StoredPluginSettings {
  const persisted = readPersisted()

  if (persisted.fmpApiKeyEncrypted) {
    const key = decryptStoredKey(persisted.fmpApiKeyEncrypted)
    return key ? { fmpApiKey: key } : {}
  }

  const legacy = persisted.fmpApiKey
  if (typeof legacy === 'string' && legacy.trim()) {
    const plain = legacy.trim()
    persistEncryptedPlaintext(plain)
    return { fmpApiKey: plain }
  }

  return {}
}

export function savePluginSettings(settings: StoredPluginSettings): void {
  const trimmed = settings.fmpApiKey?.trim()
  persistEncryptedPlaintext(trimmed || undefined)
}

/** API key for FMP congressional endpoints — never sent to renderer. */
export function getFmpApiKey(): string | null {
  const key = loadPluginSettings().fmpApiKey
  return key && key.trim() ? key.trim() : null
}

export function isFmpApiKeyConfigured(): boolean {
  return getFmpApiKey() !== null
}

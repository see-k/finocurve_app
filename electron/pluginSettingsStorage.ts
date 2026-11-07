/**
 * Plugin / integration settings stored in userData (main process only).
 * FMP API key is encrypted at rest via Electron safeStorage (same pattern as S3 secret).
 */

import { app } from 'electron'
import { decryptSecret, encryptSecret, isSecretEncryptionAvailable } from './safeSecret'
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

async function persistEncryptedPlaintext(plain: string | undefined): Promise<void> {
  if (!plain) {
    writePersisted({})
    return
  }
  if (!(await isSecretEncryptionAvailable())) {
    throw new Error('Secure storage is not available on this device.')
  }
  writePersisted({
    fmpApiKeyEncrypted: await encryptSecret(plain),
  })
}

async function decryptStoredKey(encBase64: string): Promise<{ key: string; ciphertext: string } | null> {
  try {
    const decrypted = await decryptSecret(encBase64)
    const key = decrypted.plaintext.trim()
    return key ? { key, ciphertext: decrypted.ciphertext } : null
  } catch {
    return null
  }
}

export async function loadPluginSettings(): Promise<StoredPluginSettings> {
  const persisted = readPersisted()

  if (persisted.fmpApiKeyEncrypted) {
    const decrypted = await decryptStoredKey(persisted.fmpApiKeyEncrypted)
    if (!decrypted) return {}
    if (decrypted.ciphertext !== persisted.fmpApiKeyEncrypted) {
      writePersisted({ fmpApiKeyEncrypted: decrypted.ciphertext })
    }
    return { fmpApiKey: decrypted.key }
  }

  const legacy = persisted.fmpApiKey
  if (typeof legacy === 'string' && legacy.trim()) {
    const plain = legacy.trim()
    await persistEncryptedPlaintext(plain)
    return { fmpApiKey: plain }
  }

  return {}
}

export async function savePluginSettings(settings: StoredPluginSettings): Promise<void> {
  const trimmed = settings.fmpApiKey?.trim()
  await persistEncryptedPlaintext(trimmed || undefined)
}

/** API key for FMP congressional endpoints — never sent to renderer. */
export async function getFmpApiKey(): Promise<string | null> {
  const key = (await loadPluginSettings()).fmpApiKey
  return key && key.trim() ? key.trim() : null
}

export async function isFmpApiKeyConfigured(): Promise<boolean> {
  return (await getFmpApiKey()) !== null
}

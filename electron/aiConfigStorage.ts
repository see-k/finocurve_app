/**
 * AI configuration storage - persists to userData for use by main process.
 */

import { app } from 'electron'
import { decryptSecret, encryptSecret, isSecretEncryptionAvailable } from './safeSecret'
import path from 'node:path'
import fs from 'node:fs'
import {
  decodeAIConfig,
  encodeAIConfig,
  type AIConfigSecrets,
  type PersistedAIConfig,
  type SecretCipher,
  type StoredAIConfig,
} from './aiConfigCodec'

export type { AIProviderType, StoredAIConfig } from './aiConfigCodec'

const CONFIG_FILENAME = 'finocurve-ai-config.json'
let sessionSecrets: AIConfigSecrets = {}
let sessionWarning: string | undefined
let lastStorageWarning: string | undefined

const DEFAULT_CONFIG: StoredAIConfig = {
  provider: 'ollama',
  model: 'llama3.2',
  ollamaBaseUrl: 'http://localhost:11434',
  routerProvider: 'default',
  routerModel: 'llama3.2',
  routerOllamaBaseUrl: 'http://localhost:11434',
  routerShowProvider: false,
  routerVerbose: false,
  agentShowProvider: false,
  a2aEnabled: false,
  a2aPort: 3847,
  a2aAutoStart: false,
}

function getConfigPath(): string {
  return path.join(app.getPath('userData'), CONFIG_FILENAME)
}

let reencryptStoredSecrets = false

const electronCipher: SecretCipher = {
  isAvailable: () => isSecretEncryptionAvailable(),
  encrypt: (plaintext) => encryptSecret(plaintext),
  decrypt: async (ciphertext) => {
    const decrypted = await decryptSecret(ciphertext)
    if (decrypted.ciphertext !== ciphertext) reencryptStoredSecrets = true
    return decrypted.plaintext
  },
}

function readPersistedConfig(): Partial<PersistedAIConfig> | null {
  const filePath = getConfigPath()
  if (!fs.existsSync(filePath)) return null
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  return parsed as Partial<PersistedAIConfig>
}

function writePersistedConfig(config: PersistedAIConfig): void {
  const filePath = getConfigPath()
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  try {
    fs.writeFileSync(temporaryPath, JSON.stringify(config, null, 2), { encoding: 'utf-8', mode: 0o600 })
    fs.renameSync(temporaryPath, filePath)
    try { fs.chmodSync(filePath, 0o600) } catch { /* not supported on every platform */ }
  } catch (error) {
    try { if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath) } catch { /* ignore cleanup */ }
    throw error
  }
}

export async function loadAIConfig(): Promise<StoredAIConfig> {
  reencryptStoredSecrets = false
  try {
    const persisted = readPersistedConfig()
    if (!persisted) {
      lastStorageWarning = sessionWarning
      return { ...DEFAULT_CONFIG, ...sessionSecrets }
    }
    const decoded = await decodeAIConfig(persisted, electronCipher)
    lastStorageWarning = decoded.warning ?? sessionWarning
    if (reencryptStoredSecrets && !decoded.migratedPersisted) {
      const refreshed = await encodeAIConfig(
        { ...DEFAULT_CONFIG, ...decoded.config, ...sessionSecrets },
        electronCipher,
        persisted,
      )
      if (refreshed.secretsPersisted) {
        try {
          writePersistedConfig(refreshed.persisted)
        } catch {
          lastStorageWarning = 'AI credentials were unlocked, but the rotated encryption key could not be written.'
        }
      }
    }
    if (decoded.migratedPersisted) {
      try {
        writePersistedConfig(decoded.migratedPersisted)
      } catch {
        lastStorageWarning = 'AI credentials were unlocked, but the encrypted configuration migration could not be written.'
      }
    }
    return { ...DEFAULT_CONFIG, ...decoded.config, ...sessionSecrets }
  } catch (error) {
    lastStorageWarning = error instanceof Error
      ? `AI configuration could not be read: ${error.message}`
      : 'AI configuration could not be read.'
    return { ...DEFAULT_CONFIG, ...sessionSecrets }
  }
}

export interface AIConfigSaveResult {
  secretsPersisted: boolean
  warning?: string
}

export async function saveAIConfig(config: StoredAIConfig): Promise<AIConfigSaveResult> {
  reencryptStoredSecrets = false
  let previous: Partial<PersistedAIConfig> | undefined
  try { previous = readPersistedConfig() ?? undefined } catch { /* replace unreadable config after validation */ }
  const encoded = await encodeAIConfig(config, electronCipher, previous)
  writePersistedConfig(encoded.persisted)
  sessionSecrets = encoded.sessionSecrets
  sessionWarning = encoded.warning
  lastStorageWarning = encoded.warning
  return {
    secretsPersisted: encoded.secretsPersisted,
    warning: encoded.warning,
  }
}

export async function getAIConfigStorageStatus(): Promise<{
  encryptionAvailable: boolean
  warning?: string
}> {
  let encryptionAvailable = false
  try { encryptionAvailable = await electronCipher.isAvailable() } catch { /* Electron may not have initialized safeStorage yet */ }
  return {
    encryptionAvailable,
    warning: lastStorageWarning ?? sessionWarning,
  }
}

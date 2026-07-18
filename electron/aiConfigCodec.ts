/**
 * Pure AI-config persistence codec. This module deliberately has no Electron or
 * filesystem imports so credential migration can be regression-tested in Node.
 */

export type AIProviderType = 'ollama' | 'bedrock' | 'azure'

export interface StoredAIConfig {
  provider: AIProviderType
  model: string
  ollamaBaseUrl?: string
  bedrockRegion?: string
  bedrockAccessKeyId?: string
  /** Runtime-only plaintext. Never written by encodeAIConfig. */
  bedrockSecretKey?: string
  azureEndpoint?: string
  /** Runtime-only plaintext. Never written by encodeAIConfig. */
  azureApiKey?: string
  azureDeployment?: string
  routerProvider?: 'default' | 'ollama'
  routerModel?: string
  routerOllamaBaseUrl?: string
  routerShowProvider?: boolean
  routerVerbose?: boolean
  agentShowProvider?: boolean
  a2aEnabled: boolean
  a2aPort?: number
  a2aAutoStart?: boolean
}

export interface SecretCipher {
  isAvailable(): boolean
  encrypt(plaintext: string): string
  decrypt(ciphertext: string): string
}

export interface PersistedAIConfig extends Omit<StoredAIConfig, 'bedrockSecretKey' | 'azureApiKey'> {
  storageVersion?: number
  bedrockSecretKeyEncrypted?: string
  azureApiKeyEncrypted?: string
  /** Legacy v1 plaintext fields, accepted only for migration. */
  bedrockSecretKey?: string
  azureApiKey?: string
}

export interface AIConfigSecrets {
  bedrockSecretKey?: string
  azureApiKey?: string
}

export interface EncodedAIConfig {
  persisted: PersistedAIConfig
  sessionSecrets: AIConfigSecrets
  secretsPersisted: boolean
  warning?: string
}

export interface DecodedAIConfig {
  config: Partial<StoredAIConfig>
  migratedPersisted?: PersistedAIConfig
  warning?: string
}

export const AI_CONFIG_STORAGE_VERSION = 2
export const MASKED_AI_SECRET = '••••••••'

const NON_SECRET_CONFIG_KEYS = [
  'provider',
  'model',
  'ollamaBaseUrl',
  'bedrockRegion',
  'bedrockAccessKeyId',
  'azureEndpoint',
  'azureDeployment',
  'routerProvider',
  'routerModel',
  'routerOllamaBaseUrl',
  'routerShowProvider',
  'routerVerbose',
  'agentShowProvider',
  'a2aEnabled',
  'a2aPort',
  'a2aAutoStart',
] as const satisfies readonly (keyof StoredAIConfig)[]

function pickNonSecretConfig(input: object): Partial<StoredAIConfig> {
  const source = input as Record<string, unknown>
  const picked: Record<string, unknown> = {}
  for (const key of NON_SECRET_CONFIG_KEYS) {
    if (source[key] !== undefined) picked[key] = source[key]
  }
  return picked as Partial<StoredAIConfig>
}

function cleanSecret(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function joinWarnings(warnings: string[]): string | undefined {
  const unique = [...new Set(warnings.filter(Boolean))]
  return unique.length > 0 ? unique.join(' ') : undefined
}

function encryptVerified(cipher: SecretCipher, plaintext: string): string {
  const encrypted = cipher.encrypt(plaintext)
  if (!encrypted || cipher.decrypt(encrypted) !== plaintext) {
    throw new Error('Encrypted credential verification failed.')
  }
  return encrypted
}

/** Encodes a runtime config without ever copying plaintext secrets to the persisted shape. */
export function encodeAIConfig(
  config: StoredAIConfig,
  cipher: SecretCipher,
  previous?: Partial<PersistedAIConfig>,
): EncodedAIConfig {
  const { bedrockSecretKey, azureApiKey } = config
  const persisted: PersistedAIConfig = {
    ...pickNonSecretConfig(config),
    storageVersion: AI_CONFIG_STORAGE_VERSION,
    ...(cleanSecret(previous?.bedrockSecretKeyEncrypted)
      ? { bedrockSecretKeyEncrypted: previous!.bedrockSecretKeyEncrypted }
      : {}),
    ...(cleanSecret(previous?.azureApiKeyEncrypted)
      ? { azureApiKeyEncrypted: previous!.azureApiKeyEncrypted }
      : {}),
  }
  const sessionSecrets: AIConfigSecrets = {}
  const warnings: string[] = []
  let secretsPersisted = true
  const encryptionAvailable = cipher.isAvailable()

  const storeSecret = (
    plaintext: string | undefined,
    encryptedKey: 'bedrockSecretKeyEncrypted' | 'azureApiKeyEncrypted',
    sessionKey: keyof AIConfigSecrets,
    label: string,
  ) => {
    const value = cleanSecret(plaintext)
    if (!value) {
      if (!encryptionAvailable && cleanSecret(persisted[encryptedKey])) {
        secretsPersisted = false
        warnings.push(`Existing ${label} credentials cannot be unlocked because OS credential encryption is unavailable.`)
      }
      return
    }

    if (!encryptionAvailable) {
      sessionSecrets[sessionKey] = value
      secretsPersisted = false
      warnings.push(`${label} credentials are available for this session only because OS credential encryption is unavailable.`)
      return
    }

    try {
      persisted[encryptedKey] = encryptVerified(cipher, value)
    } catch {
      sessionSecrets[sessionKey] = value
      secretsPersisted = false
      warnings.push(`${label} credentials could not be encrypted and are available for this session only.`)
    }
  }

  storeSecret(bedrockSecretKey, 'bedrockSecretKeyEncrypted', 'bedrockSecretKey', 'AWS Bedrock')
  storeSecret(azureApiKey, 'azureApiKeyEncrypted', 'azureApiKey', 'Azure OpenAI')

  return {
    persisted,
    sessionSecrets,
    secretsPersisted,
    warning: joinWarnings(warnings),
  }
}

/** Decodes v2 encrypted secrets and prepares a verified v1 plaintext migration when possible. */
export function decodeAIConfig(
  input: unknown,
  cipher: SecretCipher,
): DecodedAIConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { config: {} }

  const persisted = input as Partial<PersistedAIConfig>
  const {
    bedrockSecretKeyEncrypted,
    azureApiKeyEncrypted,
    bedrockSecretKey: legacyBedrockSecret,
    azureApiKey: legacyAzureSecret,
  } = persisted
  const config: Partial<StoredAIConfig> = pickNonSecretConfig(persisted)
  const warnings: string[] = []
  const encryptionAvailable = cipher.isAvailable()

  const readEncrypted = (
    encrypted: unknown,
    configKey: keyof AIConfigSecrets,
    label: string,
  ) => {
    const ciphertext = cleanSecret(encrypted)
    if (!ciphertext) return
    if (!encryptionAvailable) {
      warnings.push(`${label} credentials cannot be unlocked because OS credential encryption is unavailable.`)
      return
    }
    try {
      const plaintext = cleanSecret(cipher.decrypt(ciphertext))
      if (plaintext) config[configKey] = plaintext
      else warnings.push(`${label} credentials were empty after decryption.`)
    } catch {
      warnings.push(`${label} credentials could not be decrypted. Re-enter them in AI Model Configuration.`)
    }
  }

  readEncrypted(bedrockSecretKeyEncrypted, 'bedrockSecretKey', 'AWS Bedrock')
  readEncrypted(azureApiKeyEncrypted, 'azureApiKey', 'Azure OpenAI')

  const legacyBedrock = cleanSecret(legacyBedrockSecret)
  const legacyAzure = cleanSecret(legacyAzureSecret)
  if (legacyBedrock) config.bedrockSecretKey = legacyBedrock
  if (legacyAzure) config.azureApiKey = legacyAzure

  let migratedPersisted: PersistedAIConfig | undefined
  if (legacyBedrock || legacyAzure || persisted.storageVersion !== AI_CONFIG_STORAGE_VERSION) {
    if ((legacyBedrock || legacyAzure) && !encryptionAvailable) {
      warnings.push('Legacy plaintext AI credentials could not be migrated because OS credential encryption is unavailable.')
    } else {
      const completeConfig = config as StoredAIConfig
      const encoded = encodeAIConfig(completeConfig, cipher, persisted)
      if (encoded.secretsPersisted) {
        migratedPersisted = encoded.persisted
      } else if (encoded.warning) {
        warnings.push(encoded.warning)
      }
    }
  }

  return {
    config,
    migratedPersisted,
    warning: joinWarnings(warnings),
  }
}

/** Preserves stored secrets when the renderer sends masked or blank credential fields. */
export function mergeAIConfigUpdate(
  existing: StoredAIConfig,
  payload: StoredAIConfig,
): StoredAIConfig {
  return {
    ...existing,
    ...payload,
    bedrockSecretKey:
      cleanSecret(payload.bedrockSecretKey) && payload.bedrockSecretKey !== MASKED_AI_SECRET
        ? payload.bedrockSecretKey
        : existing.bedrockSecretKey,
    azureApiKey:
      cleanSecret(payload.azureApiKey) && payload.azureApiKey !== MASKED_AI_SECRET
        ? payload.azureApiKey
        : existing.azureApiKey,
  }
}

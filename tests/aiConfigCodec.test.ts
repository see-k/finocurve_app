import { describe, expect, it } from 'vitest'
import {
  AI_CONFIG_STORAGE_VERSION,
  MASKED_AI_SECRET,
  decodeAIConfig,
  encodeAIConfig,
  mergeAIConfigUpdate,
  type PersistedAIConfig,
  type SecretCipher,
  type StoredAIConfig,
} from '../electron/aiConfigCodec'

const config: StoredAIConfig = {
  provider: 'bedrock',
  model: 'anthropic.claude-3-haiku-20240307-v1:0',
  bedrockRegion: 'us-east-1',
  bedrockAccessKeyId: 'AKIA_TEST',
  bedrockSecretKey: 'bedrock-secret-value',
  azureEndpoint: 'https://example.openai.azure.com',
  azureApiKey: 'azure-secret-value',
  azureDeployment: 'gpt-4o',
  routerProvider: 'default',
  a2aEnabled: false,
}

function availableCipher(): SecretCipher {
  return {
    isAvailable: () => true,
    encrypt: (plaintext) => `encrypted:${Buffer.from(plaintext, 'utf-8').toString('base64')}`,
    decrypt: (ciphertext) => {
      if (!ciphertext.startsWith('encrypted:')) throw new Error('invalid ciphertext')
      return Buffer.from(ciphertext.slice('encrypted:'.length), 'base64').toString('utf-8')
    },
  }
}

const unavailableCipher: SecretCipher = {
  isAvailable: () => false,
  encrypt: () => { throw new Error('unavailable') },
  decrypt: () => { throw new Error('unavailable') },
}

describe('AI config credential codec', () => {
  it('encrypts cloud credentials and never emits plaintext secret properties', () => {
    const encoded = encodeAIConfig({
      ...config,
      // Renderer-only metadata must never be copied into persistence.
      secretStorageWarning: 'do not persist me',
    } as StoredAIConfig, availableCipher())
    const serialized = JSON.stringify(encoded.persisted)

    expect(encoded.secretsPersisted).toBe(true)
    expect(encoded.sessionSecrets).toEqual({})
    expect(encoded.persisted.storageVersion).toBe(AI_CONFIG_STORAGE_VERSION)
    expect(encoded.persisted.bedrockSecretKeyEncrypted).toMatch(/^encrypted:/)
    expect(encoded.persisted.azureApiKeyEncrypted).toMatch(/^encrypted:/)
    expect(encoded.persisted).not.toHaveProperty('bedrockSecretKey')
    expect(encoded.persisted).not.toHaveProperty('azureApiKey')
    expect(encoded.persisted).not.toHaveProperty('secretStorageWarning')
    expect(serialized).not.toContain('bedrock-secret-value')
    expect(serialized).not.toContain('azure-secret-value')
  })

  it('decrypts v2 credentials into runtime-only configuration', () => {
    const persisted = encodeAIConfig(config, availableCipher()).persisted
    const decoded = decodeAIConfig(persisted, availableCipher())

    expect(decoded.config.bedrockSecretKey).toBe('bedrock-secret-value')
    expect(decoded.config.azureApiKey).toBe('azure-secret-value')
    expect(decoded.config.provider).toBe('bedrock')
    expect(decoded.migratedPersisted).toBeUndefined()
    expect(decoded.warning).toBeUndefined()
  })

  it('prepares a verified one-time migration for legacy plaintext credentials', () => {
    const legacy: PersistedAIConfig = {
      provider: 'azure',
      model: 'gpt-4o',
      azureEndpoint: 'https://example.openai.azure.com',
      azureApiKey: 'legacy-azure-key',
      bedrockSecretKey: 'legacy-bedrock-key',
      a2aEnabled: false,
    }
    const decoded = decodeAIConfig(legacy, availableCipher())
    const migratedJson = JSON.stringify(decoded.migratedPersisted)

    expect(decoded.config.azureApiKey).toBe('legacy-azure-key')
    expect(decoded.config.bedrockSecretKey).toBe('legacy-bedrock-key')
    expect(decoded.migratedPersisted?.storageVersion).toBe(AI_CONFIG_STORAGE_VERSION)
    expect(decoded.migratedPersisted?.azureApiKeyEncrypted).toMatch(/^encrypted:/)
    expect(decoded.migratedPersisted?.bedrockSecretKeyEncrypted).toMatch(/^encrypted:/)
    expect(decoded.migratedPersisted).not.toHaveProperty('azureApiKey')
    expect(decoded.migratedPersisted).not.toHaveProperty('bedrockSecretKey')
    expect(migratedJson).not.toContain('legacy-azure-key')
    expect(migratedJson).not.toContain('legacy-bedrock-key')
  })

  it('uses session-only secrets instead of plaintext persistence when encryption is unavailable', () => {
    const encoded = encodeAIConfig(config, unavailableCipher)

    expect(encoded.secretsPersisted).toBe(false)
    expect(encoded.sessionSecrets).toEqual({
      bedrockSecretKey: 'bedrock-secret-value',
      azureApiKey: 'azure-secret-value',
    })
    expect(encoded.persisted).not.toHaveProperty('bedrockSecretKey')
    expect(encoded.persisted).not.toHaveProperty('azureApiKey')
    expect(encoded.persisted).not.toHaveProperty('bedrockSecretKeyEncrypted')
    expect(encoded.persisted).not.toHaveProperty('azureApiKeyEncrypted')
    expect(encoded.warning).toContain('session only')
  })

  it('does not destroy legacy plaintext until its encrypted migration can be verified', () => {
    const legacy: PersistedAIConfig = {
      provider: 'bedrock',
      model: 'model',
      bedrockSecretKey: 'legacy-secret',
      a2aEnabled: false,
    }
    const decoded = decodeAIConfig(legacy, unavailableCipher)

    expect(decoded.config.bedrockSecretKey).toBe('legacy-secret')
    expect(decoded.migratedPersisted).toBeUndefined()
    expect(decoded.warning).toContain('Legacy plaintext AI credentials could not be migrated')
  })

  it('surfaces corrupt encrypted credentials without failing the non-secret config', () => {
    const persisted: PersistedAIConfig = {
      provider: 'azure',
      model: 'gpt-4o',
      azureApiKeyEncrypted: 'corrupt-value',
      storageVersion: AI_CONFIG_STORAGE_VERSION,
      a2aEnabled: false,
    }
    const decoded = decodeAIConfig(persisted, availableCipher())

    expect(decoded.config.provider).toBe('azure')
    expect(decoded.config.azureApiKey).toBeUndefined()
    expect(decoded.warning).toContain('could not be decrypted')
  })

  it('preserves an existing encrypted secret when a save contains no replacement', () => {
    const previous = encodeAIConfig(config, availableCipher()).persisted
    const withoutRuntimeSecrets = {
      ...config,
      bedrockSecretKey: undefined,
      azureApiKey: undefined,
    }
    const encoded = encodeAIConfig(withoutRuntimeSecrets, availableCipher(), previous)

    expect(encoded.persisted.bedrockSecretKeyEncrypted).toBe(previous.bedrockSecretKeyEncrypted)
    expect(encoded.persisted.azureApiKeyEncrypted).toBe(previous.azureApiKeyEncrypted)
  })

  it('preserves existing secrets for masked or blank renderer updates', () => {
    const masked = mergeAIConfigUpdate(config, {
      ...config,
      model: 'new-model',
      bedrockSecretKey: MASKED_AI_SECRET,
      azureApiKey: '',
    })
    const replaced = mergeAIConfigUpdate(config, {
      ...config,
      bedrockSecretKey: 'new-bedrock-secret',
      azureApiKey: 'new-azure-secret',
    })

    expect(masked.model).toBe('new-model')
    expect(masked.bedrockSecretKey).toBe('bedrock-secret-value')
    expect(masked.azureApiKey).toBe('azure-secret-value')
    expect(replaced.bedrockSecretKey).toBe('new-bedrock-secret')
    expect(replaced.azureApiKey).toBe('new-azure-secret')
  })

  it('falls back to memory when encryption verification fails', () => {
    const brokenCipher: SecretCipher = {
      isAvailable: () => true,
      encrypt: () => 'encrypted-but-corrupt',
      decrypt: () => 'different-plaintext',
    }
    const encoded = encodeAIConfig(config, brokenCipher)

    expect(encoded.secretsPersisted).toBe(false)
    expect(encoded.sessionSecrets.bedrockSecretKey).toBe('bedrock-secret-value')
    expect(encoded.warning).toContain('could not be encrypted')
    expect(JSON.stringify(encoded.persisted)).not.toContain('bedrock-secret-value')
  })
})

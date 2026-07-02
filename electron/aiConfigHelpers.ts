import type { AIConfig } from '../src/ai/config'
import type { StoredAIConfig } from './aiConfigStorage'

/** Map persisted Settings > AI Models config into LocalAIService AIConfig shape. */
export function storedConfigToAIConfig(stored: StoredAIConfig): AIConfig {
  return {
    provider: 'local',
    providerType: stored.provider,
    model: stored.model,
    ollamaBaseUrl: stored.ollamaBaseUrl ?? 'http://localhost:11434',
    bedrockRegion: stored.bedrockRegion,
    bedrockAccessKeyId: stored.bedrockAccessKeyId,
    bedrockSecretKey: stored.bedrockSecretKey,
    azureEndpoint: stored.azureEndpoint,
    azureApiKey: stored.azureApiKey,
    azureDeployment: stored.azureDeployment,
  }
}

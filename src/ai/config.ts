/**
 * AI configuration - provider, model, and optional remote URL.
 * In the desktop app, the main process merges stored Settings > AI Models into `overrides`.
 */

export type AIProvider = 'local' | 'remote'
export type AIProviderType = 'ollama' | 'bedrock' | 'azure'

export interface AIConfig {
  provider: AIProvider
  providerType: AIProviderType
  model: string
  apiUrl?: string
  ollamaBaseUrl?: string
  /** AWS Bedrock */
  bedrockRegion?: string
  bedrockAccessKeyId?: string
  bedrockSecretKey?: string
  /** Azure OpenAI */
  azureEndpoint?: string
  azureApiKey?: string
  azureDeployment?: string
}

export function getAIConfig(overrides?: Partial<AIConfig>): AIConfig {
  const base: AIConfig = {
    provider: 'local',
    providerType: 'ollama',
    model: 'llama3.2',
    ollamaBaseUrl: 'http://localhost:11434',
  }
  if (!overrides) return base
  return {
    ...base,
    ...overrides,
    providerType: overrides.providerType ?? base.providerType,
  }
}

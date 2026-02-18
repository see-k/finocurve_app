/**
 * AI configuration - provider, model, and optional remote URL.
 * Values from env, stored config, or defaults.
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
  const base = {
    provider: (process.env.AI_PROVIDER as AIProvider) ?? 'local',
    providerType: 'ollama' as AIProviderType,
    model: process.env.AI_MODEL ?? 'llama3.2',
    apiUrl: process.env.AI_API_URL,
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434',
  }
  if (!overrides) return base
  return {
    ...base,
    ...overrides,
    providerType: overrides.providerType ?? base.providerType,
  }
}

import { describe, expect, it } from 'vitest'
import { storedConfigToAIConfig } from './aiConfigHelpers'
import type { StoredAIConfig } from './aiConfigStorage'

describe('storedConfigToAIConfig', () => {
  it('maps persisted provider settings into LocalAIService config', () => {
    const stored: StoredAIConfig = {
      provider: 'bedrock',
      model: 'anthropic.claude-3-haiku-20240307-v1:0',
      bedrockRegion: 'us-west-2',
      bedrockAccessKeyId: 'AKIA',
      bedrockSecretKey: 'secret',
      a2aEnabled: true,
      a2aPort: 3847,
    }

    expect(storedConfigToAIConfig(stored)).toEqual({
      provider: 'local',
      providerType: 'bedrock',
      model: 'anthropic.claude-3-haiku-20240307-v1:0',
      ollamaBaseUrl: 'http://localhost:11434',
      bedrockRegion: 'us-west-2',
      bedrockAccessKeyId: 'AKIA',
      bedrockSecretKey: 'secret',
      azureEndpoint: undefined,
      azureApiKey: undefined,
      azureDeployment: undefined,
    })
  })

  it('defaults ollamaBaseUrl when absent in stored config', () => {
    const stored: StoredAIConfig = {
      provider: 'ollama',
      model: 'llama3.2',
      a2aEnabled: false,
    }
    expect(storedConfigToAIConfig(stored).ollamaBaseUrl).toBe('http://localhost:11434')
  })

  it('passes through azure fields for Azure OpenAI provider', () => {
    const stored: StoredAIConfig = {
      provider: 'azure',
      model: 'gpt-4',
      azureEndpoint: 'https://example.openai.azure.com',
      azureApiKey: 'azure-key',
      azureDeployment: 'my-deployment',
      a2aEnabled: false,
    }
    expect(storedConfigToAIConfig(stored)).toMatchObject({
      providerType: 'azure',
      azureEndpoint: 'https://example.openai.azure.com',
      azureApiKey: 'azure-key',
      azureDeployment: 'my-deployment',
    })
  })
})

import { describe, expect, it } from 'vitest'
import { getAIConfig } from './config'

describe('getAIConfig', () => {
  it('returns ollama defaults when no overrides are provided', () => {
    expect(getAIConfig()).toEqual({
      provider: 'local',
      providerType: 'ollama',
      model: 'llama3.2',
      ollamaBaseUrl: 'http://localhost:11434',
    })
  })

  it('merges overrides while preserving providerType fallback', () => {
    expect(
      getAIConfig({
        model: 'mistral',
        bedrockRegion: 'eu-central-1',
      }),
    ).toMatchObject({
      model: 'mistral',
      providerType: 'ollama',
      bedrockRegion: 'eu-central-1',
    })
  })
})

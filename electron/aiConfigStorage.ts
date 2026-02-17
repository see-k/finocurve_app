/**
 * AI configuration storage - persists to userData for use by main process.
 */

import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

export type AIProviderType = 'ollama' | 'bedrock' | 'azure'

export interface StoredAIConfig {
  provider: AIProviderType
  model: string
  ollamaBaseUrl?: string
  bedrockRegion?: string
  bedrockAccessKeyId?: string
  bedrockSecretKey?: string
  azureEndpoint?: string
  azureApiKey?: string
  azureDeployment?: string
  a2aEnabled: boolean
}

const CONFIG_FILENAME = 'finocurve-ai-config.json'

const DEFAULT_CONFIG: StoredAIConfig = {
  provider: 'ollama',
  model: 'llama3.2',
  ollamaBaseUrl: 'http://localhost:11434',
  a2aEnabled: false,
}

function getConfigPath(): string {
  return path.join(app.getPath('userData'), CONFIG_FILENAME)
}

export function loadAIConfig(): StoredAIConfig {
  try {
    const filePath = getConfigPath()
    if (!fs.existsSync(filePath)) return { ...DEFAULT_CONFIG }
    const raw = fs.readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<StoredAIConfig>
    return { ...DEFAULT_CONFIG, ...parsed }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export function saveAIConfig(config: StoredAIConfig): void {
  const filePath = getConfigPath()
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf-8')
}

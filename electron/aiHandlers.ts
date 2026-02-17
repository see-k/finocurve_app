/**
 * AI IPC handlers - run AI in main process, expose to renderer via IPC.
 */

import { ipcMain, app } from 'electron'
import { startA2AServer, stopA2AServer } from './a2aServer'
import { loadAIConfig, saveAIConfig, type StoredAIConfig } from './aiConfigStorage'
import path from 'node:path'
import fs from 'node:fs'
import { LocalAIService } from '../src/ai/local/LocalAIService'
import type { DocumentRef, PortfolioContext, ChatMessage, ChatContext, DocumentInsight } from '../src/ai/types'

const CONFIG_FILENAME = 'finocurve-local-storage.json'
const DOCUMENTS_PREFIX = 'finocurve/documents/'

interface LocalStorageConfig {
  directoryPath: string
}

function getLocalStorageConfig(): LocalStorageConfig | null {
  try {
    const configPath = path.join(app.getPath('userData'), CONFIG_FILENAME)
    if (!fs.existsSync(configPath)) return null
    const raw = fs.readFileSync(configPath, 'utf-8')
    const config = JSON.parse(raw) as LocalStorageConfig
    if (!config.directoryPath || !fs.existsSync(config.directoryPath)) return null
    return config
  } catch {
    return null
  }
}

async function getDocumentContentFromLocal(key: string): Promise<{ buffer: Uint8Array; mimeType?: string } | null> {
  const config = getLocalStorageConfig()
  if (!config) return null
  const fullPath = path.join(config.directoryPath, key)
  if (!fs.existsSync(fullPath)) return null
  const buffer = fs.readFileSync(fullPath)
  const mime = key.toLowerCase().endsWith('.pdf') ? 'application/pdf' : undefined
  return { buffer: new Uint8Array(buffer), mimeType: mime }
}

async function getDocumentContentFromS3(key: string): Promise<{ buffer: Uint8Array; mimeType?: string } | null> {
  try {
    const { getS3FileBuffer } = await import('./s3Handlers')
    const result = await getS3FileBuffer(key)
    if (!result) return null
    return {
      buffer: new Uint8Array(result.buffer),
      mimeType: result.contentType,
    }
  } catch {
    return null
  }
}

async function getDocumentContent(key: string, source: 'cloud' | 'local'): Promise<{ buffer: Uint8Array; mimeType?: string } | null> {
  if (source === 'local') return getDocumentContentFromLocal(key)
  return getDocumentContentFromS3(key)
}

function listDocumentsFromLocal(): DocumentRef[] {
  const config = getLocalStorageConfig()
  if (!config) return []
  const baseDir = path.join(config.directoryPath, DOCUMENTS_PREFIX)
  if (!fs.existsSync(baseDir)) return []
  const items: DocumentRef[] = []
  const entries = fs.readdirSync(baseDir, { withFileTypes: true })
  for (const ent of entries) {
    if (ent.isFile()) {
      const key = DOCUMENTS_PREFIX + ent.name
      items.push({ key, fileName: ent.name, source: 'local' })
    }
  }
  return items
}


function storedConfigToAIConfig(stored: StoredAIConfig) {
  return {
    provider: 'local' as const,
    providerType: stored.provider,
    model: stored.model,
    ollamaBaseUrl: stored.ollamaBaseUrl ?? 'http://localhost:11434',
  }
}

export function registerAIHandlers(): void {
  let aiService: LocalAIService | null = null

  function getService(): LocalAIService {
    if (!aiService) {
      const stored = loadAIConfig()
      aiService = new LocalAIService({
        getDocumentContent,
        getPortfolioContext: async () => null,
        getDocumentList: async () => listDocumentsFromLocal(),
        getRiskMetrics: async () => 'Not available',
        config: storedConfigToAIConfig(stored),
      })
    }
    return aiService
  }

  function resetService() {
    aiService = null
  }

  const storedConfig = loadAIConfig()
  if (storedConfig.a2aEnabled) {
    startA2AServer(getService)
  }

  ipcMain.handle('ai-config-get', async () => {
    const config = loadAIConfig()
    return {
      ...config,
      bedrockSecretKey: config.bedrockSecretKey ? '••••••••' : '',
      azureApiKey: config.azureApiKey ? '••••••••' : '',
    }
  })

  ipcMain.handle('ai-config-save', async (_event, payload: StoredAIConfig) => {
    const existing = loadAIConfig()
    const toSave: StoredAIConfig = {
      ...payload,
      bedrockSecretKey: payload.bedrockSecretKey && payload.bedrockSecretKey !== '••••••••'
        ? payload.bedrockSecretKey
        : existing.bedrockSecretKey,
      azureApiKey: payload.azureApiKey && payload.azureApiKey !== '••••••••'
        ? payload.azureApiKey
        : existing.azureApiKey,
    }
    saveAIConfig(toSave)
    resetService()

    if (toSave.a2aEnabled) {
      stopA2AServer()
      startA2AServer(getService)
    } else {
      stopA2AServer()
    }
    return { ok: true }
  })

  ipcMain.handle('ai-check-ollama', async () => {
    try {
      const stored = loadAIConfig()
      const baseUrl = stored.ollamaBaseUrl || 'http://localhost:11434'
      const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/tags`)
      if (!res.ok) throw new Error(`Ollama returned ${res.status}`)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Ollama not available' }
    }
  })

  ipcMain.handle('ai-ollama-list-models', async (_event, baseUrl?: string) => {
    try {
      const url = (baseUrl || loadAIConfig().ollamaBaseUrl || 'http://localhost:11434').replace(/\/$/, '')
      const res = await fetch(`${url}/api/tags`)
      if (!res.ok) throw new Error(`Ollama returned ${res.status}`)
      const data = (await res.json()) as { models?: { name: string }[] }
      const names = (data.models ?? []).map((m) => m.name).filter(Boolean).sort()
      return { models: names }
    } catch (err) {
      return { models: [], error: err instanceof Error ? err.message : 'Failed to fetch models' }
    }
  })

  ipcMain.handle('ai-ollama-test-connection', async (_event, payload?: { baseUrl?: string; model?: string }) => {
    try {
      const stored = loadAIConfig()
      const baseUrl = (payload?.baseUrl || stored.ollamaBaseUrl || 'http://localhost:11434').replace(/\/$/, '')
      const res = await fetch(`${baseUrl}/api/tags`)
      if (!res.ok) throw new Error(`Connection failed: ${res.status}`)
      const data = (await res.json()) as { models?: { name: string }[] }
      const modelNames = (data.models ?? []).map((m) => m.name)
      const modelToCheck = payload?.model || stored.model
      if (modelToCheck && !modelNames.includes(modelToCheck)) {
        return { ok: false, error: `Model '${modelToCheck}' not found. Run: ollama pull ${modelToCheck}` }
      }
      return { ok: true, modelCount: modelNames.length }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Connection failed' }
    }
  })

  ipcMain.handle('ai-generate-insights', async (
    _event,
    payload: {
      documents: DocumentRef[]
      portfolioContext?: PortfolioContext
    }
  ) => {
    const service = getService()
    const insights = await service.generateDocumentInsights(
      payload.documents,
      payload.portfolioContext
    )
    return { insights }
  })

  ipcMain.handle('ai-chat-stream', async (
    _event,
    payload: {
      messages: ChatMessage[]
      context: ChatContext
    }
  ) => {
    const service = getService()
    const chunks: string[] = []
    for await (const chunk of service.chat(payload.messages, payload.context)) {
      chunks.push(chunk)
    }
    return { text: chunks.join('') }
  })
}

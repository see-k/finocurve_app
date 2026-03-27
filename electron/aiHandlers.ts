/**
 * AI IPC handlers - run AI in main process, expose to renderer via IPC.
 */

import { ipcMain, app, BrowserWindow } from 'electron'
import { startA2AServer, stopA2AServer, getA2AServerStatus, DEFAULT_PORT } from './a2aServer'
import { loadAIConfig, saveAIConfig, type StoredAIConfig } from './aiConfigStorage'
import path from 'node:path'
import fs from 'node:fs'
import { LocalAIService } from '../src/ai/local/LocalAIService'
import { extractTextFromDocument } from '../src/ai/local/documentParser'
import { getCongressCacheData } from './congressHandlers'
import { getSECSubmissionsData, getSECFilingContentData } from './secHandlers'
import { getMCPLangChainTools } from './mcpToolBridge'
import { createChatModel } from '../src/ai/createChatModel'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import type { DocumentRef, PortfolioContext, ChatMessage, ChatContext, DocumentInsight } from '../src/ai/types'
import {
  generateBrandedCustomReportPdf,
  safeReportFileSlug,
} from '../src/services/brandedCustomReportPdf'
import { buildCsvDocument, safeCsvBaseName } from '../src/services/csvDocumentExport'
import { writeLocalStorageFile } from './localStorageHandlers'
import { uploadS3IfConfigured } from './s3Handlers'
import { trackerAppendNetWorthAI, trackerGetNetWorthLogSummary } from './trackerHandlers'

const CONFIG_FILENAME = 'finocurve-local-storage.json'
const DOCUMENTS_PREFIX = 'finocurve/documents/'
const REPORTS_PREFIX = 'finocurve/reports/'
const PORTFOLIO_CACHE_FILENAME = 'finocurve-portfolio-cache.json'

interface LocalStorageConfig {
  directoryPath: string
}

// Portfolio cache for A2A and other main-process consumers (synced from renderer)
let portfolioContextCache: PortfolioContext | null = null

function getPortfolioCachePath(): string {
  return path.join(app.getPath('userData'), PORTFOLIO_CACHE_FILENAME)
}

function loadPortfolioCache(): PortfolioContext | null {
  if (portfolioContextCache) return portfolioContextCache
  try {
    const p = getPortfolioCachePath()
    if (!fs.existsSync(p)) return null
    const raw = fs.readFileSync(p, 'utf-8')
    const parsed = JSON.parse(raw) as PortfolioContext
    portfolioContextCache = parsed
    return parsed
  } catch {
    return null
  }
}

function savePortfolioCache(ctx: PortfolioContext | null): void {
  portfolioContextCache = ctx
  try {
    const p = getPortfolioCachePath()
    if (ctx) {
      fs.writeFileSync(p, JSON.stringify(ctx), 'utf-8')
    } else if (fs.existsSync(p)) {
      fs.unlinkSync(p)
    }
  } catch {
    /* ignore */
  }
}

/** Build ChatContext from main-process-available data (for A2A) */
function getAIContextForA2A(): ChatContext {
  const portfolio = loadPortfolioCache()
  const docs = listDocumentsFromLocal()
  return {
    portfolioSummary: portfolio
      ? `Portfolio: ${portfolio.portfolioName}, ~$${portfolio.totalValue.toLocaleString()}`
      : undefined,
    documentCount: docs.length,
    portfolioContext: portfolio ?? undefined,
    riskMetrics: undefined,
  }
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

function listReportsFromLocal(): DocumentRef[] {
  const config = getLocalStorageConfig()
  if (!config) return []
  const baseDir = path.join(config.directoryPath, REPORTS_PREFIX)
  if (!fs.existsSync(baseDir)) return []
  const items: DocumentRef[] = []
  const entries = fs.readdirSync(baseDir, { withFileTypes: true })
  for (const ent of entries) {
    if (ent.isFile()) {
      const key = REPORTS_PREFIX + ent.name
      items.push({ key, fileName: ent.name, source: 'local' })
    }
  }
  return items
}

function getFinocurveLogoDataUrlForMain(): string | null {
  const candidates = [
    path.join(app.getAppPath(), 'dist', 'images', 'finocurve-logo-transparent.png'),
    path.join(__dirname, '..', 'dist', 'images', 'finocurve-logo-transparent.png'),
    path.join(process.cwd(), 'public', 'images', 'finocurve-logo-transparent.png'),
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        const buf = fs.readFileSync(p)
        return `data:image/png;base64,${buf.toString('base64')}`
      } catch {
        /* try next */
      }
    }
  }
  return null
}

async function saveCustomBrandedReportForChat(payload: {
  title: string
  subtitle?: string
  sections: {
    heading: string
    body: string
    tables?: { title?: string; headers: string[]; rows: string[][] }[]
    charts?: (
      | { type: 'bar'; title?: string; labels: string[]; values: number[] }
      | { type: 'line'; title?: string; labels: string[]; values: number[] }
      | { type: 'pie'; title?: string; labels: string[]; values: number[] }
    )[]
  }[]
}): Promise<string> {
  const logo = getFinocurveLogoDataUrlForMain()
  const pdf = generateBrandedCustomReportPdf({
    title: payload.title,
    subtitle: payload.subtitle,
    sections: payload.sections,
    logoDataUrl: logo,
  })
  const dateStr = new Date().toISOString().slice(0, 10)
  const slug = safeReportFileSlug(payload.title)
  const fileName = `FinoCurve_AI_Report_${dateStr}_${slug}.pdf`
  const key = `${DOCUMENTS_PREFIX}${fileName}`

  const notes: string[] = []
  let savedAny = false
  try {
    writeLocalStorageFile(key, pdf)
    savedAny = true
    notes.push(`Saved locally: ${key}`)
  } catch (e) {
    notes.push(`Local: ${e instanceof Error ? e.message : 'failed'}`)
  }
  try {
    const uploaded = await uploadS3IfConfigured(key, pdf, 'application/pdf')
    if (uploaded) {
      savedAny = true
      notes.push(`Uploaded to cloud (S3): ${key}`)
    }
  } catch (e) {
    notes.push(`Cloud: ${e instanceof Error ? e.message : 'failed'}`)
  }

  if (!savedAny) {
    return `Could not save the PDF. ${notes.join(' ')} Ask the user to configure local storage and/or S3 under Settings > Cloud Storage.`
  }
  return [
    'Custom report PDF created with FinoCurve letterhead and branding.',
    ...notes,
    'The file is listed under finocurve/documents/ in the app.',
  ].join('\n')
}

async function saveCustomCsvForChat(payload: {
  fileBaseName: string
  headers: string[]
  rows: string[][]
}): Promise<string> {
  let csvCore: string
  try {
    csvCore = buildCsvDocument({ headers: payload.headers, rows: payload.rows })
  } catch (e) {
    return `Could not build CSV: ${e instanceof Error ? e.message : 'invalid data'}`
  }
  const csvText = `\uFEFF${csvCore}`
  const bytes = new TextEncoder().encode(csvText)
  const dateStr = new Date().toISOString().slice(0, 10)
  const slug = safeCsvBaseName(payload.fileBaseName)
  const fileName = `FinoCurve_AI_Data_${dateStr}_${slug}.csv`
  const key = `${DOCUMENTS_PREFIX}${fileName}`

  const notes: string[] = []
  let savedAny = false
  try {
    writeLocalStorageFile(key, bytes)
    savedAny = true
    notes.push(`Saved locally: ${key}`)
  } catch (e) {
    notes.push(`Local: ${e instanceof Error ? e.message : 'failed'}`)
  }
  try {
    const uploaded = await uploadS3IfConfigured(key, bytes, 'text/csv; charset=utf-8')
    if (uploaded) {
      savedAny = true
      notes.push(`Uploaded to cloud (S3): ${key}`)
    }
  } catch (e) {
    notes.push(`Cloud: ${e instanceof Error ? e.message : 'failed'}`)
  }

  if (!savedAny) {
    return `Could not save the CSV. ${notes.join(' ')} Ask the user to configure local storage and/or S3 under Settings > Cloud Storage.`
  }
  return [
    'CSV file created (UTF-8 with BOM for Excel).',
    ...notes,
    'The file is listed under finocurve/documents/ in the app; the user can open it in Excel or Google Sheets.',
  ].join('\n')
}

function storedConfigToAIConfig(stored: StoredAIConfig) {
  return {
    provider: 'local' as const,
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

export function registerAIHandlers(): void {
  let aiService: LocalAIService | null = null

  function getService(): LocalAIService {
    if (!aiService) {
      const stored = loadAIConfig()
      aiService = new LocalAIService({
        getDocumentContent,
        getPortfolioContext: async () => loadPortfolioCache(),
        getDocumentList: async () => listDocumentsFromLocal(),
        getReportList: async () => listReportsFromLocal(),
        getRiskMetrics: async () => 'Not available',
        getCongressCache: async () => getCongressCacheData(),
        getSECSubmissions: (tickerOrCik: string) => getSECSubmissionsData(tickerOrCik),
        getSECFilingContent: (tickerOrCik: string, accessionNumber: string) =>
          getSECFilingContentData(tickerOrCik, accessionNumber),
        getMCPTools: () => getMCPLangChainTools(),
        saveCustomBrandedReport: saveCustomBrandedReportForChat,
        saveCustomCsvDocument: saveCustomCsvForChat,
        appendNetWorthEntry: trackerAppendNetWorthAI,
        getNetWorthLogSummary: trackerGetNetWorthLogSummary,
        config: storedConfigToAIConfig(stored),
      })
    }
    return aiService
  }

  function resetService() {
    aiService = null
  }

  // =============================================
  // AI Config IPC Handlers
  // =============================================

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
    return { ok: true }
  })

  async function testConnection(config: {
    provider: StoredAIConfig['provider']
    model?: string
    ollamaBaseUrl?: string
    bedrockRegion?: string
    bedrockAccessKeyId?: string
    bedrockSecretKey?: string
    azureEndpoint?: string
    azureApiKey?: string
    azureDeployment?: string
  }): Promise<{ ok: boolean; error?: string; modelCount?: number }> {
    const { provider } = config
    try {
      if (provider === 'ollama') {
        const baseUrl = (config.ollamaBaseUrl || 'http://localhost:11434').replace(/\/$/, '')
        const res = await fetch(`${baseUrl}/api/tags`)
        if (!res.ok) throw new Error(`Connection failed: ${res.status}`)
        const data = (await res.json()) as { models?: { name: string }[] }
        const modelNames = (data.models ?? []).map((m) => m.name)
        const modelToCheck = config.model
        if (modelToCheck && !modelNames.includes(modelToCheck)) {
          return { ok: false, error: `Model '${modelToCheck}' not found. Run: ollama pull ${modelToCheck}` }
        }
        return { ok: true, modelCount: modelNames.length }
      }
      if (provider === 'bedrock') {
        const aiConfig = storedConfigToAIConfig({
          ...loadAIConfig(),
          provider: 'bedrock',
          model: config.model || 'anthropic.claude-3-haiku-20240307-v1:0',
          bedrockRegion: config.bedrockRegion,
          bedrockAccessKeyId: config.bedrockAccessKeyId,
          bedrockSecretKey: config.bedrockSecretKey,
        })
        const model = createChatModel(aiConfig)
        await model.invoke([new HumanMessage('Say OK')])
        return { ok: true }
      }
      if (provider === 'azure') {
        const aiConfig = storedConfigToAIConfig({
          ...loadAIConfig(),
          provider: 'azure',
          model: config.model || 'gpt-4',
          azureEndpoint: config.azureEndpoint,
          azureApiKey: config.azureApiKey,
          azureDeployment: config.azureDeployment,
        })
        const model = createChatModel(aiConfig)
        await model.invoke([new HumanMessage('Say OK')])
        return { ok: true }
      }
      return { ok: false, error: `Unknown provider: ${provider}` }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Connection failed' }
    }
  }

  ipcMain.handle('ai-check-ollama', async () => {
    const stored = loadAIConfig()
    if (stored.provider !== 'ollama') {
      return testConnection({ ...stored, provider: stored.provider })
    }
    return testConnection({
      provider: 'ollama',
      model: stored.model,
      ollamaBaseUrl: stored.ollamaBaseUrl,
    })
  })

  ipcMain.handle('ai-check-connection', async () => {
    const stored = loadAIConfig()
    return testConnection({
      provider: stored.provider,
      model: stored.model,
      ollamaBaseUrl: stored.ollamaBaseUrl,
      bedrockRegion: stored.bedrockRegion,
      bedrockAccessKeyId: stored.bedrockAccessKeyId,
      bedrockSecretKey: stored.bedrockSecretKey,
      azureEndpoint: stored.azureEndpoint,
      azureApiKey: stored.azureApiKey,
      azureDeployment: stored.azureDeployment,
    })
  })

  ipcMain.handle('ai-test-connection', async (
    _event,
    payload: {
      provider: StoredAIConfig['provider']
      model?: string
      ollamaBaseUrl?: string
      bedrockRegion?: string
      bedrockAccessKeyId?: string
      bedrockSecretKey?: string
      azureEndpoint?: string
      azureApiKey?: string
      azureDeployment?: string
    }
  ) => {
    const existing = loadAIConfig()
    const merged = {
      ...payload,
      bedrockSecretKey: payload.bedrockSecretKey && payload.bedrockSecretKey !== '••••••••'
        ? payload.bedrockSecretKey
        : existing.bedrockSecretKey,
      azureApiKey: payload.azureApiKey && payload.azureApiKey !== '••••••••'
        ? payload.azureApiKey
        : existing.azureApiKey,
    }
    return testConnection(merged)
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
    event,
    payload: {
      messages: ChatMessage[]
      context: ChatContext
    }
  ) => {
    const service = getService()
    const sender = event.sender
    let reasoning = ''
    let answer = ''
    for await (const chunk of service.chat(payload.messages, payload.context)) {
      if (chunk.type === 'reasoning') {
        reasoning += chunk.content
        sender.send('ai-chat-chunk', { type: 'reasoning', content: chunk.content })
      } else {
        answer += chunk.content
        sender.send('ai-chat-chunk', { type: 'answer', content: chunk.content })
      }
    }
    return { text: answer, reasoning: reasoning || undefined }
  })

  ipcMain.handle('ai-generate-advanced-analysis', async (
    _event,
    payload: {
      riskSummary: string
      portfolioSummary: string
      document?: { key: string; fileName: string; source: 'cloud' | 'local' }
    }
  ) => {
    const service = getService()
    let documentContent: { fileName: string; text: string } | undefined
    if (payload.document) {
      const content = await getDocumentContent(payload.document.key, payload.document.source)
      if (content) {
        const text = await extractTextFromDocument(content.buffer, content.mimeType, payload.document.fileName)
        if (text && text.trim().length > 10) {
          documentContent = { fileName: payload.document.fileName, text }
        }
      }
    }
    return service.generateAdvancedAnalysis({
      riskSummary: payload.riskSummary,
      portfolioSummary: payload.portfolioSummary,
      documentContent,
    })
  })

  // =============================================
  // A2A Server IPC Handlers
  // =============================================

  const getA2AVerboseCallback = () => (event: { type: string; timestamp: string; data: Record<string, unknown> }) => {
    BrowserWindow.getAllWindows()[0]?.webContents?.send('a2a:verbose', event)
  }

  // Portfolio sync from renderer (for A2A and main-process tool context)
  ipcMain.handle('portfolio-sync', async (_event, payload: PortfolioContext | null) => {
    savePortfolioCache(payload)
    return { ok: true }
  })

  // Start A2A server
  ipcMain.handle('a2a:start', async (_event, options?: { port?: number }) => {
    try {
      const config = loadAIConfig()
      const port = options?.port ?? config.a2aPort ?? DEFAULT_PORT
      const result = await startA2AServer(getService, {
        port,
        onVerbose: getA2AVerboseCallback(),
        getAIContext: getAIContextForA2A,
      })
      return result
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to start A2A server' }
    }
  })

  // Stop A2A server
  ipcMain.handle('a2a:stop', async () => {
    try {
      const result = await stopA2AServer()
      return result
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to stop A2A server' }
    }
  })

  // Get A2A server status
  ipcMain.handle('a2a:getStatus', async () => {
    try {
      const status = getA2AServerStatus()
      return { success: true, data: status }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to get A2A status' }
    }
  })

  // Get A2A settings (port, autoStart)
  ipcMain.handle('a2a:getSettings', async () => {
    try {
      const config = loadAIConfig()
      return {
        success: true,
        data: {
          port: config.a2aPort ?? DEFAULT_PORT,
          autoStart: config.a2aAutoStart ?? false,
        },
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to get A2A settings' }
    }
  })

  // Update A2A settings
  ipcMain.handle('a2a:updateSettings', async (_event, settings: { port?: number; autoStart?: boolean }) => {
    try {
      const config = loadAIConfig()
      if (settings.port !== undefined) {
        config.a2aPort = settings.port
      }
      if (settings.autoStart !== undefined) {
        config.a2aAutoStart = settings.autoStart
      }
      saveAIConfig(config)
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to update A2A settings' }
    }
  })

  // =============================================
  // Auto-start A2A server if configured
  // =============================================
  const storedConfig = loadAIConfig()
  if (storedConfig.a2aAutoStart || storedConfig.a2aEnabled) {
    const port = storedConfig.a2aPort ?? DEFAULT_PORT
    startA2AServer(getService, {
      port,
      onVerbose: getA2AVerboseCallback(),
      getAIContext: getAIContextForA2A,
    })
  }
}

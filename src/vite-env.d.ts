/// <reference types="vite/client" />

declare module '*.json' {
  const value: unknown
  export default value
}

interface AIConfigFromMain {
  provider: 'ollama' | 'bedrock' | 'azure'
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

interface AIConfigPayload extends AIConfigFromMain { }

interface ElectronAPI {
  platform: string
  versions: {
    node: string
    chrome: string
    electron: string
  }
  send: (channel: string, data: unknown) => void
  receive: (channel: string, func: (...args: unknown[]) => void) => void
  // S3 cloud storage (user-owned bucket)
  s3SaveCredentials?: (payload: { bucket: string; region: string; accessKeyId: string; secret: string }) => Promise<{ ok: boolean }>
  s3ClearCredentials?: () => Promise<{ ok: boolean }>
  s3HasCredentials?: () => Promise<boolean>
  s3Upload?: (payload: { key: string; buffer: number[]; contentType?: string }) => Promise<{ ok: boolean }>
  s3List?: (payload: { prefix: string }) => Promise<{ items: { key: string; size: number; lastModified: string }[] }>
  s3GetDownloadUrl?: (payload: { key: string }) => Promise<{ url: string }>
  s3GetFileBuffer?: (payload: { key: string }) => Promise<{ buffer: number[]; contentType?: string }>
  s3Delete?: (payload: { key: string }) => Promise<{ ok: boolean }>
  // Local storage (device directory)
  localStorageChooseDirectory?: () => Promise<{ path: string | null }>
  localStorageGetPath?: () => Promise<{ path: string | null }>
  localStorageClearPath?: () => Promise<{ ok: boolean }>
  localStorageHasPath?: () => Promise<boolean>
  localStorageSaveFile?: (payload: { key: string; buffer: number[] }) => Promise<{ ok: boolean }>
  localStorageList?: (payload: { prefix: string }) => Promise<{ items: { key: string; size: number; lastModified: string }[] }>
  localStorageOpenFile?: (payload: { key: string }) => Promise<{ ok: boolean }>
  localStorageReadFile?: (payload: { key: string }) => Promise<{ base64: string }>
  localStorageDeleteFile?: (payload: { key: string }) => Promise<{ ok: boolean }>
  localStorageOpenDocumentsFolder?: () => Promise<
    { ok: true } | { ok: false; error?: 'not_configured'; message?: string }
  >
  // Portfolio sync (for A2A / main process)
  portfolioSync?: (payload: {
    portfolioName: string
    totalValue: number
    totalGainLossPercent: number
    assetCount: number
    riskScore?: number
    riskLevel?: string
    topHoldings?: Array<{ symbol?: string; name: string; value: number; percent?: number }>
    loans?: Array<{
      name: string
      loanType?: string
      balance: number
      principal?: number
      interestRate?: number
      monthlyPayment?: number
      termMonths?: number
      startDate?: string
      extraMonthlyPayment?: number
    }>
  } | null) => Promise<{ ok: boolean }>
  // AI
  aiConfigGet?: () => Promise<AIConfigFromMain>
  aiConfigSave?: (payload: AIConfigPayload) => Promise<{ ok: boolean }>
  aiCheckOllama?: () => Promise<{ ok: boolean; error?: string }>
  aiCheckConnection?: () => Promise<{ ok: boolean; error?: string; modelCount?: number }>
  aiOllamaListModels?: (baseUrl?: string) => Promise<{ models: string[]; error?: string }>
  aiTestConnection?: (payload: {
    provider: 'ollama' | 'bedrock' | 'azure'
    model?: string
    ollamaBaseUrl?: string
    bedrockRegion?: string
    bedrockAccessKeyId?: string
    bedrockSecretKey?: string
    azureEndpoint?: string
    azureApiKey?: string
    azureDeployment?: string
  }) => Promise<{ ok: boolean; error?: string; modelCount?: number }>
  aiGenerateInsights?: (payload: { documents: { key: string; fileName: string; source: 'cloud' | 'local' }[]; portfolioContext?: unknown }) => Promise<{ insights: { documentKey: string; documentName: string; summary: string; riskRelevantPoints: string[]; recommendations: string[] }[] }>
  aiChatStream?: (payload: { messages: { role: string; content: string }[]; context: unknown }) => Promise<{ text: string; reasoning?: string }>
  onAiChatChunk?: (callback: (chunk: { type: 'reasoning' | 'answer'; content: string }) => void) => () => void
  aiGenerateAdvancedAnalysis?: (payload: {
    riskSummary: string
    portfolioSummary: string
    document?: { key: string; fileName: string; source: 'cloud' | 'local' }
  }) => Promise<{ sections: { title: string; content: string }[] }>
  priceHistorical?: (payload: {
    assets: { symbol: string; quantity: number; type: string; currentValue: number }[]
    period: '1D' | '1W' | '1M' | '1Y'
    otherAssetsValue: number
  }) => Promise<{ data: { date: string; value: number }[]; error: string | null }>
  priceSearch?: (payload: { query: string }) => Promise<{
    results: Array<{ symbol: string; name: string; type: string; price: number; sector: string }>
    error: string | null
  }>
  congressSenate?: (payload?: { page?: number; limit?: number }) => Promise<{ data: Record<string, unknown>[]; error: string | null }>
  congressHouse?: (payload?: { page?: number; limit?: number }) => Promise<{ data: Record<string, unknown>[]; error: string | null }>
  congressCacheGet?: () => Promise<{ data: { senate: Record<string, unknown>[]; house: Record<string, unknown>[]; senateFetchedAt?: string; houseFetchedAt?: string }; error: string | null }>
  congressPullLatest?: () => Promise<{ data: { senate: Record<string, unknown>[]; house: Record<string, unknown>[]; senateFetchedAt?: string; houseFetchedAt?: string }; error: string | null }>
  pluginsFmpIsConfigured?: () => Promise<{ configured: boolean }>
  pluginsSettingsGet?: () => Promise<{ fmpApiKey: string }>
  pluginsSettingsSave?: (payload: { fmpApiKey: string }) => Promise<{ ok: boolean }>
  secSubmissions?: (payload: { tickerOrCik: string }) => Promise<{ data: unknown; error: string | null }>
  secCompanyFacts?: (payload: { tickerOrCik: string }) => Promise<{ data: unknown; error: string | null }>
  secFilingContent?: (payload: {
    tickerOrCik: string
    accessionNumber: string
  }) => Promise<{ content: string | null; error: string | null }>
}

interface MCPServerDefinition {
  name: string
  command: string
  args: string[]
  env?: Record<string, string>
}

interface MCPServerStatusInfo {
  name: string
  status: 'running' | 'stopped' | 'error'
  pid?: number
  error?: string
}

interface Window {
  electronAPI: ElectronAPI
  mcpAPI?: {
    selectConfigFile: () => Promise<{ path: string | null; error?: string }>
    getConfigPath: () => Promise<{ path: string | null }>
    clearConfigPath: () => Promise<{ ok: boolean }>
    loadServers: () => Promise<{ servers: MCPServerDefinition[]; error?: string }>
    startServers: () => Promise<{ ok: boolean; error?: string; statuses?: MCPServerStatusInfo[] }>
    stopServers: () => Promise<{ ok: boolean }>
    getStatus: () => Promise<{ running: boolean; servers: MCPServerStatusInfo[] }>
    getSettings: () => Promise<{ configFilePath: string | null; autoStart: boolean }>
    updateSettings: (settings: { autoStart?: boolean }) => Promise<{ ok: boolean; error?: string }>
  }
  a2aAPI?: {
    start: (options?: { port?: number }) => Promise<{ success: boolean; port?: number; url?: string; wellKnownUrl?: string; error?: string }>
    stop: () => Promise<{ success: boolean; error?: string }>
    getStatus: () => Promise<{ success: boolean; data?: { running: boolean; port: number; url: string | null; wellKnownUrl: string | null }; error?: string }>
    getSettings: () => Promise<{ success: boolean; data?: { port: number; autoStart: boolean }; error?: string }>
    updateSettings: (settings: { port?: number; autoStart?: boolean }) => Promise<{ success: boolean; error?: string }>
    onVerbose?: (callback: (event: { type: string; timestamp: string; data: Record<string, unknown> }) => void) => () => void
  }
}

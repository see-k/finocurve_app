import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },
  send: (channel: string, data: unknown) => {
    const validChannels = ['toMain']
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data)
    }
  },
  receive: (channel: string, func: (...args: unknown[]) => void) => {
    const validChannels = ['fromMain']
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (_event, ...args) => func(...args))
    }
  },
  s3SaveCredentials: (payload: { bucket: string; region: string; accessKeyId: string; secret: string }) =>
    ipcRenderer.invoke('s3-save-credentials', payload),
  s3ClearCredentials: () => ipcRenderer.invoke('s3-clear-credentials'),
  s3HasCredentials: () => ipcRenderer.invoke('s3-has-credentials'),
  s3Upload: (payload: { key: string; buffer: number[]; contentType?: string }) =>
    ipcRenderer.invoke('s3-upload', payload),
  s3List: (payload: { prefix: string }) => ipcRenderer.invoke('s3-list', payload),
  s3GetDownloadUrl: (payload: { key: string }) => ipcRenderer.invoke('s3-get-download-url', payload),
  s3GetFileBuffer: (payload: { key: string }) => ipcRenderer.invoke('s3-get-file-buffer', payload),
  s3Delete: (payload: { key: string }) => ipcRenderer.invoke('s3-delete', payload),
  // Local storage (device directory)
  localStorageChooseDirectory: () => ipcRenderer.invoke('local-storage-choose-directory'),
  localStorageGetPath: () => ipcRenderer.invoke('local-storage-get-path'),
  localStorageClearPath: () => ipcRenderer.invoke('local-storage-clear-path'),
  localStorageHasPath: () => ipcRenderer.invoke('local-storage-has-path'),
  localStorageSaveFile: (payload: { key: string; buffer: number[] }) =>
    ipcRenderer.invoke('local-storage-save-file', payload),
  localStorageList: (payload: { prefix: string }) => ipcRenderer.invoke('local-storage-list', payload),
  localStorageOpenFile: (payload: { key: string }) => ipcRenderer.invoke('local-storage-open-file', payload),
  localStorageReadFile: (payload: { key: string }) => ipcRenderer.invoke('local-storage-read-file', payload),
  localStorageDeleteFile: (payload: { key: string }) => ipcRenderer.invoke('local-storage-delete-file', payload),
  localStorageOpenDocumentsFolder: () => ipcRenderer.invoke('local-storage-open-documents-folder'),
  portfolioSync: (
    payload: {
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
    } | null
  ) => ipcRenderer.invoke('portfolio-sync', payload),
  aiConfigGet: () => ipcRenderer.invoke('ai-config-get'),
  aiConfigSave: (payload: unknown) => ipcRenderer.invoke('ai-config-save', payload),
  aiCheckOllama: () => ipcRenderer.invoke('ai-check-ollama'),
  aiCheckConnection: () => ipcRenderer.invoke('ai-check-connection'),
  aiOllamaListModels: (baseUrl?: string) => ipcRenderer.invoke('ai-ollama-list-models', baseUrl),
  aiTestConnection: (payload: {
    provider: 'ollama' | 'bedrock' | 'azure'
    model?: string
    ollamaBaseUrl?: string
    bedrockRegion?: string
    bedrockAccessKeyId?: string
    bedrockSecretKey?: string
    azureEndpoint?: string
    azureApiKey?: string
    azureDeployment?: string
  }) => ipcRenderer.invoke('ai-test-connection', payload),
  aiGenerateInsights: (payload: { documents: unknown[]; portfolioContext?: unknown }) =>
    ipcRenderer.invoke('ai-generate-insights', payload),
  aiChatStream: (payload: { messages: unknown[]; context: unknown }) =>
    ipcRenderer.invoke('ai-chat-stream', payload),
  onAiChatChunk: (callback: (chunk: { type: 'reasoning' | 'answer'; content: string }) => void) => {
    const handler = (_: unknown, chunk: { type: 'reasoning' | 'answer'; content: string }) => callback(chunk)
    ipcRenderer.on('ai-chat-chunk', handler)
    return () => ipcRenderer.removeListener('ai-chat-chunk', handler)
  },
  aiGenerateAdvancedAnalysis: (payload: {
    riskSummary: string
    portfolioSummary: string
    document?: { key: string; fileName: string; source: 'cloud' | 'local' }
  }) => ipcRenderer.invoke('ai-generate-advanced-analysis', payload),
  priceHistorical: (payload: {
    assets: { symbol: string; quantity: number; type: string; currentValue: number }[]
    period: '1D' | '1W' | '1M' | '1Y'
    otherAssetsValue: number
  }) => ipcRenderer.invoke('price-historical', payload),
  priceSearch: (payload: { query: string }) =>
    ipcRenderer.invoke('price-search', payload),
  congressSenate: (payload?: { page?: number; limit?: number }) =>
    ipcRenderer.invoke('congress-senate', payload ?? {}),
  congressHouse: (payload?: { page?: number; limit?: number }) =>
    ipcRenderer.invoke('congress-house', payload ?? {}),
  congressCacheGet: () => ipcRenderer.invoke('congress-cache-get'),
  congressPullLatest: () =>
    ipcRenderer.invoke('congress-pull-latest'),
  pluginsFmpIsConfigured: () => ipcRenderer.invoke('plugins-fmp-is-configured'),
  pluginsSettingsGet: () => ipcRenderer.invoke('plugins-settings-get'),
  pluginsSettingsSave: (payload: { fmpApiKey: string }) =>
    ipcRenderer.invoke('plugins-settings-save', payload),
  secSubmissions: (payload: { tickerOrCik: string }) =>
    ipcRenderer.invoke('sec-submissions', payload),
  secCompanyFacts: (payload: { tickerOrCik: string }) =>
    ipcRenderer.invoke('sec-company-facts', payload),
  secFilingContent: (payload: { tickerOrCik: string; accessionNumber: string }) =>
    ipcRenderer.invoke('sec-filing-content', payload),
})

// Expose MCP API for Model Context Protocol server management
contextBridge.exposeInMainWorld('mcpAPI', {
  selectConfigFile: () => ipcRenderer.invoke('mcp:select-config-file'),
  getConfigPath: () => ipcRenderer.invoke('mcp:get-config-path'),
  clearConfigPath: () => ipcRenderer.invoke('mcp:clear-config-path'),
  loadServers: () => ipcRenderer.invoke('mcp:load-servers'),
  startServers: () => ipcRenderer.invoke('mcp:start-servers'),
  stopServers: () => ipcRenderer.invoke('mcp:stop-servers'),
  getStatus: () => ipcRenderer.invoke('mcp:get-status'),
  getSettings: () => ipcRenderer.invoke('mcp:get-settings'),
  updateSettings: (settings: { autoStart?: boolean }) => ipcRenderer.invoke('mcp:update-settings', settings),
})

// Expose A2A Server API for Agent-to-Agent protocol support
contextBridge.exposeInMainWorld('a2aAPI', {
  start: (options?: { port?: number }) => ipcRenderer.invoke('a2a:start', options),
  stop: () => ipcRenderer.invoke('a2a:stop'),
  getStatus: () => ipcRenderer.invoke('a2a:getStatus'),
  getSettings: () => ipcRenderer.invoke('a2a:getSettings'),
  updateSettings: (settings: { port?: number; autoStart?: boolean }) =>
    ipcRenderer.invoke('a2a:updateSettings', settings),
  onVerbose: (callback: (event: unknown) => void) => {
    const handler = (_: unknown, data: unknown) => callback(data)
    ipcRenderer.on('a2a:verbose', handler)
    return () => ipcRenderer.removeListener('a2a:verbose', handler)
  },
})

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
  portfolioSync: (payload: { portfolioName: string; totalValue: number; totalGainLossPercent: number; assetCount: number; riskScore?: number; riskLevel?: string } | null) =>
    ipcRenderer.invoke('portfolio-sync', payload),
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

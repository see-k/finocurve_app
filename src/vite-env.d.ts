/// <reference types="vite/client" />

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
  aiChatStream?: (payload: { messages: { role: string; content: string }[]; context: unknown }) => Promise<{ text: string }>
}

interface Window {
  electronAPI: ElectronAPI
  a2aAPI?: {
    start: (options?: { port?: number }) => Promise<{ success: boolean; port?: number; url?: string; wellKnownUrl?: string; error?: string }>
    stop: () => Promise<{ success: boolean; error?: string }>
    getStatus: () => Promise<{ success: boolean; data?: { running: boolean; port: number; url: string | null; wellKnownUrl: string | null }; error?: string }>
    getSettings: () => Promise<{ success: boolean; data?: { port: number; autoStart: boolean }; error?: string }>
    updateSettings: (settings: { port?: number; autoStart?: boolean }) => Promise<{ success: boolean; error?: string }>
    onVerbose?: (callback: (event: { type: string; timestamp: string; data: Record<string, unknown> }) => void) => () => void
  }
}

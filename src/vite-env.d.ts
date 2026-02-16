/// <reference types="vite/client" />

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
  localStorageDeleteFile?: (payload: { key: string }) => Promise<{ ok: boolean }>
}

interface Window {
  electronAPI: ElectronAPI
}

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
})

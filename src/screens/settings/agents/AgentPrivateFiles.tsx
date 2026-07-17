import { useCallback, useEffect, useRef, useState } from 'react'
import { File, FolderLock, FolderOpen, HardDrive, RefreshCw, Trash2, Upload } from 'lucide-react'
import GlassButton from '../../../components/glass/GlassButton'

const MAX_FILE_SIZE = 20 * 1024 * 1024

interface LocalFile { key: string; size: number; lastModified: string }

function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200)
}

function fileName(key: string): string {
  return key.split('/').pop() || key
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function AgentPrivateFiles({ agentId }: { agentId?: string }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const prefix = agentId ? `finocurve/agents/${agentId}/files/` : ''
  const [files, setFiles] = useState<LocalFile[]>([])
  const [localPath, setLocalPath] = useState<string | null>(null)
  const [loading, setLoading] = useState(!!agentId)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadFiles = useCallback(async () => {
    if (!prefix || !window.electronAPI?.localStorageList) return
    setLoading(true)
    setError(null)
    try {
      const { items } = await window.electronAPI.localStorageList({ prefix })
      setFiles(items.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load private files.')
    } finally {
      setLoading(false)
    }
  }, [prefix])

  useEffect(() => {
    let active = true
    void window.electronAPI?.localStorageGetPath?.().then(({ path }) => {
      if (!active) return
      setLocalPath(path)
      if (path && prefix) void loadFiles()
      else setLoading(false)
    })
    return () => { active = false }
  }, [prefix, loadFiles])

  const uploadFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files || [])
    event.target.value = ''
    if (!prefix || selected.length === 0 || !window.electronAPI?.localStorageSaveFile) return
    const oversized = selected.find((item) => item.size > MAX_FILE_SIZE)
    if (oversized) {
      setError(`${oversized.name} is larger than the 20 MB limit.`)
      return
    }
    setUploading(true)
    setError(null)
    try {
      for (const item of selected) {
        const buffer = Array.from(new Uint8Array(await item.arrayBuffer()))
        await window.electronAPI.localStorageSaveFile({ key: prefix + safeFileName(item.name), buffer })
      }
      await loadFiles()
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Could not save the selected files.')
    } finally {
      setUploading(false)
    }
  }

  const deleteFile = async (item: LocalFile) => {
    if (!window.electronAPI?.localStorageDeleteFile || !confirm(`Delete ${fileName(item.key)}?`)) return
    try {
      await window.electronAPI.localStorageDeleteFile({ key: item.key })
      await loadFiles()
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Could not delete the file.')
    }
  }

  if (!agentId) {
    return (
      <section className="agent-private-files agent-private-files--empty">
        <FolderLock size={20} />
        <span><strong>Private files</strong><small>Create this expert first to activate its private local folder.</small></span>
      </section>
    )
  }

  return (
    <section className="agent-private-files" aria-labelledby="agent-private-files-heading">
      <input ref={inputRef} type="file" multiple onChange={uploadFiles} hidden />
      <div className="agent-private-files__heading">
        <span className="agent-section-heading__icon"><FolderLock size={16} /></span>
        <span><strong id="agent-private-files-heading">Private files</strong><small>Local files scoped to this expert. They are not uploaded to cloud storage.</small></span>
        <span className="agent-private-files__count">{files.length}</span>
      </div>

      {!localPath ? (
        <div className="agent-private-files__setup"><HardDrive size={18} /><span>Choose a local storage folder in Settings → Storage before adding files.</span></div>
      ) : (
        <>
          <div className="agent-private-files__actions">
            <GlassButton text={uploading ? 'Adding files…' : 'Add files'} icon={<Upload size={15} />} onClick={() => inputRef.current?.click()} disabled={uploading} width="auto" />
            <button type="button" onClick={() => void window.electronAPI?.localStorageOpenFolder?.({ prefix })}><FolderOpen size={15} /> Open folder</button>
            <button type="button" onClick={() => void loadFiles()} aria-label="Refresh private files"><RefreshCw size={15} /> Refresh</button>
          </div>
          {error && <p className="agent-private-files__error">{error}</p>}
          {loading ? (
            <p className="agent-private-files__message">Loading private files…</p>
          ) : files.length === 0 ? (
            <div className="agent-private-files__blank"><FolderOpen size={23} /><strong>No private files yet</strong><small>Add reference material that belongs only to this expert.</small></div>
          ) : (
            <div className="agent-private-files__list">
              {files.map((item) => (
                <div key={item.key} className="agent-private-files__row">
                  <File size={17} />
                  <span><strong>{fileName(item.key)}</strong><small>{formatSize(item.size)} · {new Date(item.lastModified).toLocaleDateString()}</small></span>
                  <button type="button" onClick={() => void window.electronAPI?.localStorageOpenFile?.({ key: item.key })} aria-label={`Open ${fileName(item.key)}`}><FolderOpen size={15} /></button>
                  <button type="button" className="agent-private-files__delete" onClick={() => void deleteFile(item)} aria-label={`Delete ${fileName(item.key)}`}><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}

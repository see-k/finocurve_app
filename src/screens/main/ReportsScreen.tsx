import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Upload, Download, Trash2, Shield, ChevronRight, Cloud, HardDrive } from 'lucide-react'
import GlassContainer from '../../components/glass/GlassContainer'
import GlassButton from '../../components/glass/GlassButton'
import GlassIconButton from '../../components/glass/GlassIconButton'
import './ReportsScreen.css'

const REPORTS_BG = 'https://images.unsplash.com/photo-1515266591878-f93e32bc5937?q=80&w=1287&auto=format&fit=crop'
const REPORTS_PREFIX = 'finocurve/reports/'
const DOCUMENTS_PREFIX = 'finocurve/documents/'
const MAX_FILE_SIZE_MB = 20

interface FileItem {
  key: string
  size: number
  lastModified: string
  source: 'cloud' | 'local'
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fileNameFromKey(key: string): string {
  const parts = key.split('/')
  return parts[parts.length - 1] || key
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200)
}

export default function ReportsScreen() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [subTab, setSubTab] = useState<'reports' | 'documents'>('reports')
  const [sourceFilter, setSourceFilter] = useState<'all' | 'cloud' | 'local'>('all')
  const [s3Connected, setS3Connected] = useState<boolean | null>(null)
  const [reports, setReports] = useState<FileItem[]>([])
  const [documents, setDocuments] = useState<FileItem[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasElectronS3 = typeof window !== 'undefined' && window.electronAPI?.s3List
  const hasElectronLocal = typeof window !== 'undefined' && window.electronAPI?.localStorageList
  const [localConnected, setLocalConnected] = useState<boolean | null>(null)

  const loadAll = useCallback(async () => {
    setError(null)
    try {
      const reportsFromCloud: FileItem[] = []
      const docsFromCloud: FileItem[] = []
      const reportsFromLocal: FileItem[] = []
      const docsFromLocal: FileItem[] = []

      if (hasElectronS3 && s3Connected && window.electronAPI?.s3List) {
        const [reportsRes, docsRes] = await Promise.all([
          window.electronAPI.s3List({ prefix: REPORTS_PREFIX }),
          window.electronAPI.s3List({ prefix: DOCUMENTS_PREFIX }),
        ])
        reportsFromCloud.push(...reportsRes.items.map((i) => ({ ...i, source: 'cloud' as const })))
        docsFromCloud.push(...docsRes.items.map((i) => ({ ...i, source: 'cloud' as const })))
      }

      if (hasElectronLocal && localConnected && window.electronAPI?.localStorageList) {
        const [reportsRes, docsRes] = await Promise.all([
          window.electronAPI.localStorageList({ prefix: REPORTS_PREFIX }),
          window.electronAPI.localStorageList({ prefix: DOCUMENTS_PREFIX }),
        ])
        reportsFromLocal.push(...reportsRes.items.map((i) => ({ ...i, source: 'local' as const })))
        docsFromLocal.push(...docsRes.items.map((i) => ({ ...i, source: 'local' as const })))
      }

      setReports([...reportsFromCloud, ...reportsFromLocal])
      setDocuments([...docsFromCloud, ...docsFromLocal])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load files')
    }
  }, [hasElectronS3, hasElectronLocal, s3Connected, localConnected])

  useEffect(() => {
    if (!hasElectronS3 && !hasElectronLocal) {
      setS3Connected(false)
      setLocalConnected(false)
      setLoading(false)
      return
    }
    const promises: Promise<void>[] = []
    if (hasElectronS3 && window.electronAPI?.s3HasCredentials) {
      promises.push(
        window.electronAPI.s3HasCredentials()
          .then(setS3Connected)
          .catch(() => setS3Connected(false))
      )
    } else {
      setS3Connected(false)
    }
    if (hasElectronLocal && window.electronAPI?.localStorageHasPath) {
      promises.push(
        window.electronAPI.localStorageHasPath()
          .then(setLocalConnected)
          .catch(() => setLocalConnected(false))
      )
    } else {
      setLocalConnected(false)
    }
    Promise.all(promises).finally(() => setLoading(false))
  }, [hasElectronS3, hasElectronLocal])

  useEffect(() => {
    if (s3Connected || localConnected) loadAll()
  }, [s3Connected, localConnected, loadAll])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || (!window.electronAPI?.s3Upload && !window.electronAPI?.localStorageSaveFile)) return
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setError(`File too large. Max ${MAX_FILE_SIZE_MB} MB.`)
      return
    }
    setError(null)
    setUploading(true)
    try {
      const buffer = Array.from(new Uint8Array(await file.arrayBuffer()))
      const key = DOCUMENTS_PREFIX + sanitizeFileName(file.name)
      const errors: string[] = []
      if (s3Connected && window.electronAPI?.s3Upload) {
        try {
          await window.electronAPI.s3Upload({ key, buffer, contentType: file.type || 'application/octet-stream' })
        } catch (e) {
          errors.push(e instanceof Error ? e.message : 'S3 upload failed')
        }
      }
      if (localConnected && window.electronAPI?.localStorageSaveFile) {
        try {
          await window.electronAPI.localStorageSaveFile({ key, buffer })
        } catch (e) {
          errors.push(e instanceof Error ? e.message : 'Local save failed')
        }
      }
      if (errors.length > 0 && !(s3Connected && localConnected)) {
        throw new Error(errors[0])
      }
      if (errors.length === 2) throw new Error(errors.join('; '))
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload')
    } finally {
      setUploading(false)
    }
  }

  const filterItems = <T extends FileItem>(items: T[]): T[] =>
    sourceFilter === 'all' ? items : items.filter((i) => i.source === sourceFilter)

  const filteredReports = filterItems(reports)
  const filteredDocuments = filterItems(documents)

  const showSourceFilter = s3Connected && localConnected

  const handleDownload = async (item: FileItem) => {
    try {
      if (item.source === 'cloud' && window.electronAPI?.s3GetDownloadUrl) {
        const { url } = await window.electronAPI.s3GetDownloadUrl({ key: item.key })
        window.open(url, '_blank')
      } else if (item.source === 'local' && window.electronAPI?.localStorageOpenFile) {
        await window.electronAPI.localStorageOpenFile({ key: item.key })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to open file')
    }
  }

  const handleDelete = async (item: FileItem) => {
    if (!confirm(`Delete ${fileNameFromKey(item.key)}?`)) return
    setError(null)
    try {
      if (item.source === 'cloud' && window.electronAPI?.s3Delete) {
        await window.electronAPI.s3Delete({ key: item.key })
      } else if (item.source === 'local' && window.electronAPI?.localStorageDeleteFile) {
        await window.electronAPI.localStorageDeleteFile({ key: item.key })
      }
      await loadAll()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete')
    }
  }

  const FileRow = ({ item }: { item: FileItem }) => (
    <div className={`reports-file-row reports-file-row--${item.source}`}>
      <div className="reports-file-row__info">
        {item.source === 'cloud' ? (
          <Cloud size={20} className="reports-file-row__icon reports-file-row__icon--cloud" />
        ) : (
          <HardDrive size={20} className="reports-file-row__icon reports-file-row__icon--local" />
        )}
        <div className="reports-file-row__meta">
          <div className="reports-file-row__name-row">
            <span className="reports-file-row__name">{fileNameFromKey(item.key)}</span>
            <span className={`reports-file-row__badge reports-file-row__badge--${item.source}`}>
              {item.source === 'cloud' ? 'Cloud' : 'Device'}
            </span>
          </div>
          <span className="reports-file-row__detail">
            {formatSize(item.size)} · {item.lastModified ? new Date(item.lastModified).toLocaleDateString() : ''}
          </span>
        </div>
      </div>
      <div className="reports-file-row__actions">
        <GlassIconButton icon={<Download size={16} />} onClick={() => handleDownload(item)} size={36} />
        <GlassIconButton icon={<Trash2 size={16} />} onClick={() => handleDelete(item)} size={36} />
      </div>
    </div>
  )

  const emptyState = (
    <div className="reports-page">
      <div className="reports-bg">
        <img src={REPORTS_BG} alt="" className="reports-bg__img" />
        <div className="reports-bg__overlay" />
      </div>
      <div className="reports-content">
        <div className="reports-header">
          <h1 className="reports-title"><FileText size={24} /> Reports & Documents</h1>
        </div>
        <GlassContainer padding="32px" borderRadius={20} className="reports-empty">
          <FileText size={48} style={{ color: 'var(--text-tertiary)', marginBottom: 16 }} />
          <h2>Storage in desktop app</h2>
          <p>Reports and documents are available when you run FinoCurve in the desktop app. Configure an S3 bucket or choose a local folder in Settings.</p>
        </GlassContainer>
      </div>
    </div>
  )

  if (!hasElectronS3 && !hasElectronLocal) return emptyState

  const connectState = (
    <div className="reports-page">
      <div className="reports-bg">
        <img src={REPORTS_BG} alt="" className="reports-bg__img" />
        <div className="reports-bg__overlay" />
      </div>
      <div className="reports-content">
        <div className="reports-header">
          <h1 className="reports-title"><FileText size={24} /> Reports & Documents</h1>
        </div>
        <GlassContainer padding="32px" borderRadius={20} className="reports-empty">
          <FileText size={48} style={{ color: 'var(--text-tertiary)', marginBottom: 16 }} />
          <h2>Connect storage</h2>
          <p style={{ marginBottom: 20 }}>Configure an S3 bucket or choose a local folder in Settings to store risk reports and upload documents (tax files, financial statements).</p>
          <GlassButton text="Open Storage Settings" onClick={() => navigate('/settings/cloud-storage')} isPrimary />
        </GlassContainer>
      </div>
    </div>
  )

  if (!s3Connected && !localConnected) return connectState

  return (
    <div className="reports-page">
      <div className="reports-bg">
        <img src={REPORTS_BG} alt="" className="reports-bg__img" />
        <div className="reports-bg__overlay" />
      </div>
      <div className="reports-content">
        <div className="reports-header">
          <h1 className="reports-title"><FileText size={24} /> Reports & Documents</h1>
        </div>

        {/* Sub-page menu */}
        <div className="reports-tabs">
          <button className={`reports-tab ${subTab === 'reports' ? 'reports-tab--active' : ''}`} onClick={() => setSubTab('reports')}>
            <Shield size={16} /> Reports
          </button>
          <button className={`reports-tab ${subTab === 'documents' ? 'reports-tab--active' : ''}`} onClick={() => setSubTab('documents')}>
            <FileText size={16} /> Documents
          </button>
        </div>

        {showSourceFilter && (
          <div className="reports-source-filter">
            <span className="reports-source-filter__label">Show:</span>
            <div className="reports-source-filter__pills">
              <button
                className={`reports-source-filter__pill ${sourceFilter === 'all' ? 'reports-source-filter__pill--active' : ''}`}
                onClick={() => setSourceFilter('all')}
              >
                All
              </button>
              <button
                className={`reports-source-filter__pill ${sourceFilter === 'cloud' ? 'reports-source-filter__pill--active' : ''}`}
                onClick={() => setSourceFilter('cloud')}
              >
                <Cloud size={12} /> Cloud
              </button>
              <button
                className={`reports-source-filter__pill ${sourceFilter === 'local' ? 'reports-source-filter__pill--active' : ''}`}
                onClick={() => setSourceFilter('local')}
              >
                <HardDrive size={12} /> Device
              </button>
            </div>
          </div>
        )}

        {error && <p className="reports-error">{error}</p>}

        {/* Reports sub-page */}
        {subTab === 'reports' && (
          <div className="reports-section">
            <div className="reports-section__header">
              <h2 className="reports-section__title"><Shield size={18} /> Risk Reports</h2>
              <GlassButton text="Generate Report" onClick={() => navigate('/risk-analysis')} icon={<ChevronRight size={16} />} width="auto" />
            </div>
            <GlassContainer padding="16px" borderRadius={16}>
              {loading ? (
                <p className="reports-loading">Loading...</p>
              ) : filteredReports.length === 0 ? (
                <div className="reports-empty-list">
                  <FileText size={32} style={{ opacity: 0.5 }} />
                  <p>
                    {reports.length === 0
                      ? 'No reports yet. Generate one from Risk Analysis.'
                      : `No ${sourceFilter === 'cloud' ? 'cloud' : 'device'} reports. Try a different filter.`}
                  </p>
                  {reports.length === 0 ? (
                    <GlassButton text="Go to Risk Analysis" onClick={() => navigate('/risk-analysis')} width="auto" />
                  ) : (
                    <GlassButton text="Show all" onClick={() => setSourceFilter('all')} width="auto" />
                  )}
                </div>
              ) : (
                <div className="reports-list">
                  {filteredReports.map((item) => <FileRow key={item.key} item={item} />)}
                </div>
              )}
            </GlassContainer>
          </div>
        )}

        {/* Documents sub-page */}
        {subTab === 'documents' && (
          <div className="reports-section">
            <div className="reports-section__header">
              <h2 className="reports-section__title"><FileText size={18} /> Documents</h2>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  ref={fileInputRef}
                  type="file"
                  style={{ display: 'none' }}
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.txt"
                  onChange={handleUpload}
                />
                <GlassButton
                  text={uploading ? 'Uploading...' : 'Upload'}
                  onClick={() => fileInputRef.current?.click()}
                  icon={<Upload size={16} />}
                  isPrimary
                  disabled={uploading}
                  width="auto"
                />
                <GlassButton text="Refresh" onClick={loadAll} disabled={loading} width="auto" />
              </div>
            </div>
            <GlassContainer padding="16px" borderRadius={16}>
              {loading ? (
                <p className="reports-loading">Loading...</p>
              ) : filteredDocuments.length === 0 ? (
                <div className="reports-empty-list">
                  <FileText size={32} style={{ opacity: 0.5 }} />
                  <p>
                    {documents.length === 0
                      ? `No documents yet. Upload tax files, financial statements, etc. Max ${MAX_FILE_SIZE_MB} MB per file.`
                      : `No ${sourceFilter === 'cloud' ? 'cloud' : 'device'} documents. Try a different filter.`}
                  </p>
                  {documents.length > 0 && (
                    <GlassButton text="Show all" onClick={() => setSourceFilter('all')} width="auto" />
                  )}
                </div>
              ) : (
                <div className="reports-list">
                  {filteredDocuments.map((item) => <FileRow key={item.key} item={item} />)}
                </div>
              )}
            </GlassContainer>
          </div>
        )}
      </div>
    </div>
  )
}

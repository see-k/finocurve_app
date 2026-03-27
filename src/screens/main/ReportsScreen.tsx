import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Upload, Download, Trash2, Shield, Cloud, HardDrive, Eye, X, FolderOpen, RefreshCw, Loader2, FileChartColumnIncreasing, Calendar, ArrowDownAZ, Search, Pencil } from 'lucide-react'
import GlassContainer from '../../components/glass/GlassContainer'
import GlassButton from '../../components/glass/GlassButton'
import GlassIconButton from '../../components/glass/GlassIconButton'
import GlassTextField from '../../components/glass/GlassTextField'
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

function fileItemId(item: FileItem): string {
  return `${item.source}:${item.key}`
}

function isDocumentKey(key: string): boolean {
  return key.startsWith(DOCUMENTS_PREFIX)
}

/** Parent path including trailing slash (e.g. finocurve/documents/ or …/subfolder/). */
function documentParentPrefix(key: string): string {
  const lastSlash = key.lastIndexOf('/')
  if (lastSlash < 0) return DOCUMENTS_PREFIX
  return key.slice(0, lastSlash + 1)
}

type SortBy = 'date' | 'name'

function sortFileItems(items: FileItem[], sortBy: SortBy): FileItem[] {
  const out = [...items]
  if (sortBy === 'name') {
    out.sort((a, b) =>
      fileNameFromKey(a.key).localeCompare(fileNameFromKey(b.key), undefined, { sensitivity: 'base' }),
    )
  } else {
    out.sort((a, b) => {
      const ta = a.lastModified ? new Date(a.lastModified).getTime() : 0
      const tb = b.lastModified ? new Date(b.lastModified).getTime() : 0
      return tb - ta
    })
  }
  return out
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200)
}

const VIEWABLE_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg']
function isViewable(key: string): boolean {
  const lower = key.toLowerCase()
  return VIEWABLE_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

function mimeFromKey(key: string): string {
  const lower = key.toLowerCase()
  if (lower.endsWith('.pdf')) return 'application/pdf'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  return 'application/octet-stream'
}

export default function ReportsScreen() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [subTab, setSubTab] = useState<'reports' | 'documents'>('reports')
  const [sourceFilter, setSourceFilter] = useState<'all' | 'cloud' | 'local'>('all')
  const [sortBy, setSortBy] = useState<SortBy>('date')
  const [searchQuery, setSearchQuery] = useState('')
  const [s3Connected, setS3Connected] = useState<boolean | null>(null)
  const [reports, setReports] = useState<FileItem[]>([])
  const [documents, setDocuments] = useState<FileItem[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewItem, setViewItem] = useState<FileItem | null>(null)
  const [viewUrl, setViewUrl] = useState<string | null>(null)
  const [viewLoading, setViewLoading] = useState(false)
  const [viewError, setViewError] = useState<string | null>(null)
  const [selectedReportIds, setSelectedReportIds] = useState<string[]>([])
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([])
  const [deletingBulk, setDeletingBulk] = useState(false)
  const [renameItem, setRenameItem] = useState<FileItem | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [renameBusy, setRenameBusy] = useState(false)
  const selectAllReportsRef = useRef<HTMLInputElement>(null)
  const selectAllDocumentsRef = useRef<HTMLInputElement>(null)

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

  const reportIdSet = useMemo(() => new Set(reports.map((i) => fileItemId(i))), [reports])
  const documentIdSet = useMemo(() => new Set(documents.map((i) => fileItemId(i))), [documents])

  useEffect(() => {
    setSelectedReportIds((prev) => prev.filter((id) => reportIdSet.has(id)))
  }, [reportIdSet])

  useEffect(() => {
    setSelectedDocumentIds((prev) => prev.filter((id) => documentIdSet.has(id)))
  }, [documentIdSet])

  const setSubTabAndClearSelection = useCallback((tab: 'reports' | 'documents') => {
    setSelectedReportIds([])
    setSelectedDocumentIds([])
    setSubTab(tab)
  }, [])

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

  const searchNeedle = searchQuery.trim().toLowerCase()
  const reportsMatchingSearch = useMemo(() => {
    if (!searchNeedle) return filteredReports
    return filteredReports.filter((i) => fileNameFromKey(i.key).toLowerCase().includes(searchNeedle))
  }, [filteredReports, searchNeedle])
  const documentsMatchingSearch = useMemo(() => {
    if (!searchNeedle) return filteredDocuments
    return filteredDocuments.filter((i) => fileNameFromKey(i.key).toLowerCase().includes(searchNeedle))
  }, [filteredDocuments, searchNeedle])

  const sortedReports = useMemo(() => sortFileItems(reportsMatchingSearch, sortBy), [reportsMatchingSearch, sortBy])
  const sortedDocuments = useMemo(() => sortFileItems(documentsMatchingSearch, sortBy), [documentsMatchingSearch, sortBy])

  const visibleReportIds = useMemo(() => sortedReports.map((i) => fileItemId(i)), [sortedReports])
  const visibleDocumentIds = useMemo(() => sortedDocuments.map((i) => fileItemId(i)), [sortedDocuments])
  const allReportsVisibleSelected =
    visibleReportIds.length > 0 && visibleReportIds.every((id) => selectedReportIds.includes(id))
  const someReportsVisibleSelected = visibleReportIds.some((id) => selectedReportIds.includes(id))
  const allDocumentsVisibleSelected =
    visibleDocumentIds.length > 0 && visibleDocumentIds.every((id) => selectedDocumentIds.includes(id))
  const someDocumentsVisibleSelected = visibleDocumentIds.some((id) => selectedDocumentIds.includes(id))

  useEffect(() => {
    const el = selectAllReportsRef.current
    if (el) el.indeterminate = someReportsVisibleSelected && !allReportsVisibleSelected
  }, [someReportsVisibleSelected, allReportsVisibleSelected, sortedReports])

  useEffect(() => {
    const el = selectAllDocumentsRef.current
    if (el) el.indeterminate = someDocumentsVisibleSelected && !allDocumentsVisibleSelected
  }, [someDocumentsVisibleSelected, allDocumentsVisibleSelected, sortedDocuments])

  const toggleSelectAllReports = useCallback(() => {
    setSelectedReportIds((prev) => {
      if (visibleReportIds.length === 0) return prev
      if (visibleReportIds.every((id) => prev.includes(id))) {
        return prev.filter((id) => !visibleReportIds.includes(id))
      }
      return Array.from(new Set([...prev, ...visibleReportIds]))
    })
  }, [visibleReportIds])

  const toggleSelectAllDocuments = useCallback(() => {
    setSelectedDocumentIds((prev) => {
      if (visibleDocumentIds.length === 0) return prev
      if (visibleDocumentIds.every((id) => prev.includes(id))) {
        return prev.filter((id) => !visibleDocumentIds.includes(id))
      }
      return Array.from(new Set([...prev, ...visibleDocumentIds]))
    })
  }, [visibleDocumentIds])

  const toggleReportSelection = useCallback((id: string) => {
    setSelectedReportIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }, [])

  const toggleDocumentSelection = useCallback((id: string) => {
    setSelectedDocumentIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }, [])

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

  const scrollContainerRef = useRef<HTMLElement | null>(null)

  const lockScroll = useCallback(() => {
    const el = document.querySelector<HTMLElement>('.main-content__inner')
    if (el) {
      scrollContainerRef.current = el
      el.style.overflow = 'hidden'
    }
  }, [])

  const unlockScroll = useCallback(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.style.overflow = ''
      scrollContainerRef.current = null
    }
  }, [])

  useEffect(() => () => unlockScroll(), [unlockScroll])

  const handleView = async (item: FileItem) => {
    if (!isViewable(item.key)) return
    lockScroll()
    setViewItem(item)
    setViewUrl(null)
    setViewError(null)
    setViewLoading(true)
    try {
      if (item.source === 'cloud' && window.electronAPI?.s3GetDownloadUrl) {
        const { url } = await window.electronAPI.s3GetDownloadUrl({ key: item.key })
        setViewUrl(url)
      } else if (item.source === 'local' && window.electronAPI?.localStorageReadFile) {
        const { base64 } = await window.electronAPI.localStorageReadFile({ key: item.key })
        const mime = mimeFromKey(item.key)
        const binary = atob(base64)
        const len = binary.length
        const bytes = new Uint8Array(len)
        for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i)
        setViewUrl(URL.createObjectURL(new Blob([bytes], { type: mime })))
      } else {
        setViewError('Cannot load file for preview')
      }
    } catch (e) {
      setViewError(e instanceof Error ? e.message : 'Failed to load file')
    } finally {
      setViewLoading(false)
    }
  }

  const closeViewer = () => {
    if (viewUrl && viewUrl.startsWith('blob:')) URL.revokeObjectURL(viewUrl)
    unlockScroll()
    setViewItem(null)
    setViewUrl(null)
    setViewError(null)
  }

  const handleOpenLocalDocumentsFolder = async () => {
    if (!window.electronAPI?.localStorageOpenDocumentsFolder) return
    setError(null)
    try {
      const res = await window.electronAPI.localStorageOpenDocumentsFolder()
      if (!res.ok) {
        if ('error' in res && res.error === 'not_configured') {
          setError('Choose a local folder in Settings → Cloud Storage first.')
        } else if ('message' in res && res.message) {
          setError(res.message)
        } else {
          setError('Could not open the documents folder.')
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open folder')
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
      const id = fileItemId(item)
      setSelectedReportIds((p) => p.filter((x) => x !== id))
      setSelectedDocumentIds((p) => p.filter((x) => x !== id))
      await loadAll()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete')
    }
  }

  const handleBulkDeleteReports = useCallback(async () => {
    const byId = new Map(reports.map((i) => [fileItemId(i), i]))
    const items = selectedReportIds.map((id) => byId.get(id)).filter((x): x is FileItem => !!x)
    if (items.length === 0) return
    if (!confirm(`Delete ${items.length} file(s)? This cannot be undone.`)) return
    setDeletingBulk(true)
    setError(null)
    try {
      for (const item of items) {
        if (item.source === 'cloud' && window.electronAPI?.s3Delete) {
          await window.electronAPI.s3Delete({ key: item.key })
        } else if (item.source === 'local' && window.electronAPI?.localStorageDeleteFile) {
          await window.electronAPI.localStorageDeleteFile({ key: item.key })
        }
      }
      setSelectedReportIds([])
      await loadAll()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete some files')
    } finally {
      setDeletingBulk(false)
    }
  }, [reports, selectedReportIds, loadAll])

  const handleBulkDeleteDocuments = useCallback(async () => {
    const byId = new Map(documents.map((i) => [fileItemId(i), i]))
    const items = selectedDocumentIds.map((id) => byId.get(id)).filter((x): x is FileItem => !!x)
    if (items.length === 0) return
    if (!confirm(`Delete ${items.length} file(s)? This cannot be undone.`)) return
    setDeletingBulk(true)
    setError(null)
    try {
      for (const item of items) {
        if (item.source === 'cloud' && window.electronAPI?.s3Delete) {
          await window.electronAPI.s3Delete({ key: item.key })
        } else if (item.source === 'local' && window.electronAPI?.localStorageDeleteFile) {
          await window.electronAPI.localStorageDeleteFile({ key: item.key })
        }
      }
      setSelectedDocumentIds([])
      await loadAll()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete some files')
    } finally {
      setDeletingBulk(false)
    }
  }, [documents, selectedDocumentIds, loadAll])

  const performRenameDocument = useCallback(async () => {
    if (!renameItem || !isDocumentKey(renameItem.key)) return
    const trimmed = renameDraft.trim()
    if (!trimmed) {
      setError('Enter a file name.')
      return
    }
    const safe = sanitizeFileName(trimmed)
    if (!safe) {
      setError('Use letters, numbers, dots, dashes, and underscores in the file name.')
      return
    }
    const parentPrefix = documentParentPrefix(renameItem.key)
    const newKey = parentPrefix + safe
    if (newKey === renameItem.key) {
      setRenameItem(null)
      return
    }
    const taken = documents.some(
      (d) => d.source === renameItem.source && d.key === newKey && fileItemId(d) !== fileItemId(renameItem),
    )
    if (taken) {
      setError('A file with that name already exists in this location.')
      return
    }
    setRenameBusy(true)
    setError(null)
    try {
      if (renameItem.source === 'cloud') {
        if (!window.electronAPI?.s3GetFileBuffer || !window.electronAPI?.s3Upload || !window.electronAPI?.s3Delete) {
          throw new Error('Cloud rename is not available.')
        }
        const { buffer, contentType } = await window.electronAPI.s3GetFileBuffer({ key: renameItem.key })
        await window.electronAPI.s3Upload({
          key: newKey,
          buffer,
          contentType: contentType || mimeFromKey(newKey),
        })
        await window.electronAPI.s3Delete({ key: renameItem.key })
      } else {
        if (
          !window.electronAPI?.localStorageReadFile ||
          !window.electronAPI?.localStorageSaveFile ||
          !window.electronAPI?.localStorageDeleteFile
        ) {
          throw new Error('Local rename is not available.')
        }
        const { base64 } = await window.electronAPI.localStorageReadFile({ key: renameItem.key })
        const binary = atob(base64)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
        await window.electronAPI.localStorageSaveFile({ key: newKey, buffer: Array.from(bytes) })
        await window.electronAPI.localStorageDeleteFile({ key: renameItem.key })
      }
      const oldId = fileItemId(renameItem)
      setSelectedDocumentIds((prev) => prev.filter((id) => id !== oldId))
      if (viewItem && fileItemId(viewItem) === oldId) {
        if (viewUrl && viewUrl.startsWith('blob:')) URL.revokeObjectURL(viewUrl)
        unlockScroll()
        setViewItem(null)
        setViewUrl(null)
        setViewError(null)
      }
      setRenameItem(null)
      await loadAll()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to rename file')
    } finally {
      setRenameBusy(false)
    }
  }, [renameItem, renameDraft, documents, viewItem, viewUrl, loadAll, unlockScroll])

  const openRenameDocument = (item: FileItem) => {
    if (!isDocumentKey(item.key)) return
    setRenameDraft(fileNameFromKey(item.key))
    setRenameItem(item)
    setError(null)
  }

  const FileRow = ({
    item,
    listKind,
    selected,
    onToggleSelect,
  }: {
    item: FileItem
    listKind: 'reports' | 'documents'
    selected: boolean
    onToggleSelect: () => void
  }) => (
    <div
      className={`reports-file-row reports-file-row--${item.source}${selected ? ' reports-file-row--selected' : ''}`}
    >
      <label className="reports-file-row__check">
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => {
            e.stopPropagation()
            onToggleSelect()
          }}
          aria-label={`Select ${fileNameFromKey(item.key)}`}
        />
      </label>
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
        {listKind === 'documents' && (
          <GlassIconButton
            icon={<Pencil size={16} aria-hidden />}
            onClick={() => openRenameDocument(item)}
            size={36}
            title="Rename"
          />
        )}
        {isViewable(item.key) && (
          <GlassIconButton icon={<Eye size={16} />} onClick={() => handleView(item)} size={36} title="View" />
        )}
        <GlassIconButton icon={<Download size={16} />} onClick={() => handleDownload(item)} size={36} title="Open / Download" />
        <GlassIconButton icon={<Trash2 size={16} />} onClick={() => handleDelete(item)} size={36} title="Delete" />
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
          {hasElectronLocal && localConnected && window.electronAPI?.localStorageOpenDocumentsFolder && (
            <GlassIconButton
              icon={<FolderOpen size={18} aria-hidden />}
              onClick={() => void handleOpenLocalDocumentsFolder()}
              title="Open documents folder"
              size={40}
            />
          )}
        </div>

        {/* Sub-page menu */}
        <div className="reports-tabs">
          <button
            type="button"
            className={`reports-tab ${subTab === 'reports' ? 'reports-tab--active' : ''}`}
            onClick={() => setSubTabAndClearSelection('reports')}
          >
            <Shield size={16} /> Reports
          </button>
          <button
            type="button"
            className={`reports-tab ${subTab === 'documents' ? 'reports-tab--active' : ''}`}
            onClick={() => setSubTabAndClearSelection('documents')}
          >
            <FileText size={16} /> Documents
          </button>
        </div>

        <div className="reports-layout">
          <div className="reports-layout__main">
            {error && <p className="reports-error">{error}</p>}

            {/* Reports sub-page */}
        {subTab === 'reports' && (
          <div className="reports-section">
            <div className="reports-section__header">
              <h2 className="reports-section__title"><Shield size={18} /> Risk Reports</h2>
              <GlassIconButton
                icon={<FileChartColumnIncreasing size={18} aria-hidden />}
                onClick={() => navigate('/risk-analysis')}
                title="Generate report"
                size={40}
              />
            </div>
            <GlassContainer padding="16px" borderRadius={16}>
              {loading ? (
                <p className="reports-loading">Loading...</p>
              ) : reportsMatchingSearch.length === 0 ? (
                <div className="reports-empty-list">
                  <FileText size={32} style={{ opacity: 0.5 }} />
                  <p>
                    {reports.length === 0
                      ? 'No reports yet. Generate one from Risk Analysis.'
                      : filteredReports.length === 0
                        ? `No ${sourceFilter === 'cloud' ? 'cloud' : 'device'} reports. Try a different filter.`
                        : `No files match “${searchQuery.trim()}”.`}
                  </p>
                  {reports.length === 0 ? (
                    <GlassButton text="Go to Risk Analysis" onClick={() => navigate('/risk-analysis')} width="auto" />
                  ) : filteredReports.length === 0 ? (
                    <GlassButton text="Show all" onClick={() => setSourceFilter('all')} width="auto" />
                  ) : searchNeedle ? (
                    <GlassButton text="Clear search" onClick={() => setSearchQuery('')} width="auto" />
                  ) : null}
                </div>
              ) : (
                <>
                  {selectedReportIds.length > 0 && (
                    <div className="reports-bulk-bar">
                      <span className="reports-bulk-bar__count">{selectedReportIds.length} selected</span>
                      <div className="reports-bulk-bar__actions">
                        <GlassButton
                          text="Clear"
                          onClick={() => setSelectedReportIds([])}
                          width="auto"
                          disabled={deletingBulk}
                        />
                        <GlassButton
                          text={`Delete (${selectedReportIds.length})`}
                          onClick={() => void handleBulkDeleteReports()}
                          width="auto"
                          icon={<Trash2 size={16} aria-hidden />}
                          disabled={deletingBulk}
                          isLoading={deletingBulk}
                        />
                      </div>
                    </div>
                  )}
                  <label className="reports-select-all">
                    <input
                      ref={selectAllReportsRef}
                      type="checkbox"
                      checked={allReportsVisibleSelected}
                      onChange={toggleSelectAllReports}
                      aria-label="Select all reports in this list"
                    />
                    <span>Select all</span>
                  </label>
                  <div className="reports-list">
                    {sortedReports.map((item) => {
                      const id = fileItemId(item)
                      return (
                        <FileRow
                          key={id}
                          item={item}
                          listKind="reports"
                          selected={selectedReportIds.includes(id)}
                          onToggleSelect={() => toggleReportSelection(id)}
                        />
                      )
                    })}
                  </div>
                </>
              )}
            </GlassContainer>
          </div>
        )}

            {/* Documents sub-page */}
        {subTab === 'documents' && (
          <div className="reports-section">
            <div className="reports-section__header">
              <h2 className="reports-section__title"><FileText size={18} /> Documents</h2>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input
                  ref={fileInputRef}
                  type="file"
                  style={{ display: 'none' }}
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.txt"
                  onChange={handleUpload}
                />
                <GlassIconButton
                  icon={
                    uploading ? (
                      <Loader2 size={18} className="reports-toolbar-icon--spin" aria-hidden />
                    ) : (
                      <Upload size={18} aria-hidden />
                    )
                  }
                  onClick={() => fileInputRef.current?.click()}
                  title={uploading ? 'Uploading…' : 'Upload document'}
                  disabled={uploading}
                  size={40}
                />
                <GlassIconButton
                  icon={<RefreshCw size={18} aria-hidden />}
                  onClick={() => void loadAll()}
                  title="Refresh list"
                  disabled={loading}
                  size={40}
                />
              </div>
            </div>
            <GlassContainer padding="16px" borderRadius={16}>
              {loading ? (
                <p className="reports-loading">Loading...</p>
              ) : documentsMatchingSearch.length === 0 ? (
                <div className="reports-empty-list">
                  <FileText size={32} style={{ opacity: 0.5 }} />
                  <p>
                    {documents.length === 0
                      ? `No documents yet. Upload tax files, financial statements, etc. Max ${MAX_FILE_SIZE_MB} MB per file.`
                      : filteredDocuments.length === 0
                        ? `No ${sourceFilter === 'cloud' ? 'cloud' : 'device'} documents. Try a different filter.`
                        : `No files match “${searchQuery.trim()}”.`}
                  </p>
                  {documents.length > 0 && filteredDocuments.length === 0 && (
                    <GlassButton text="Show all" onClick={() => setSourceFilter('all')} width="auto" />
                  )}
                  {documents.length > 0 && filteredDocuments.length > 0 && searchNeedle && (
                    <GlassButton text="Clear search" onClick={() => setSearchQuery('')} width="auto" />
                  )}
                </div>
              ) : (
                <>
                  {selectedDocumentIds.length > 0 && (
                    <div className="reports-bulk-bar">
                      <span className="reports-bulk-bar__count">{selectedDocumentIds.length} selected</span>
                      <div className="reports-bulk-bar__actions">
                        <GlassButton
                          text="Clear"
                          onClick={() => setSelectedDocumentIds([])}
                          width="auto"
                          disabled={deletingBulk}
                        />
                        <GlassButton
                          text={`Delete (${selectedDocumentIds.length})`}
                          onClick={() => void handleBulkDeleteDocuments()}
                          width="auto"
                          icon={<Trash2 size={16} aria-hidden />}
                          disabled={deletingBulk}
                          isLoading={deletingBulk}
                        />
                      </div>
                    </div>
                  )}
                  <label className="reports-select-all">
                    <input
                      ref={selectAllDocumentsRef}
                      type="checkbox"
                      checked={allDocumentsVisibleSelected}
                      onChange={toggleSelectAllDocuments}
                      aria-label="Select all documents in this list"
                    />
                    <span>Select all</span>
                  </label>
                  <div className="reports-list">
                    {sortedDocuments.map((item) => {
                      const id = fileItemId(item)
                      return (
                        <FileRow
                          key={id}
                          item={item}
                          listKind="documents"
                          selected={selectedDocumentIds.includes(id)}
                          onToggleSelect={() => toggleDocumentSelection(id)}
                        />
                      )
                    })}
                  </div>
                </>
              )}
            </GlassContainer>
          </div>
        )}
          </div>

          <aside className="reports-layout__side" aria-label="Search and filters">
            <div className="reports-controls-panel">
              <div className="reports-toolbar-row">
                <div className="reports-search">
                  <GlassTextField
                    value={searchQuery}
                    onChange={setSearchQuery}
                    placeholder="Search by file name…"
                    prefixIcon={<Search size={18} aria-hidden />}
                    suffixIcon={
                      searchQuery ? (
                        <button
                          type="button"
                          className="reports-search__clear"
                          onClick={() => setSearchQuery('')}
                          aria-label="Clear search"
                        >
                          <X size={16} aria-hidden />
                        </button>
                      ) : undefined
                    }
                  />
                </div>
                {showSourceFilter && (
                  <div className="reports-source-filter">
                    <span className="reports-source-filter__label">Show:</span>
                    <div className="reports-source-filter__pills">
                      <button
                        type="button"
                        className={`reports-source-filter__pill ${sourceFilter === 'all' ? 'reports-source-filter__pill--active' : ''}`}
                        onClick={() => setSourceFilter('all')}
                      >
                        All
                      </button>
                      <button
                        type="button"
                        className={`reports-source-filter__pill ${sourceFilter === 'cloud' ? 'reports-source-filter__pill--active' : ''}`}
                        onClick={() => setSourceFilter('cloud')}
                      >
                        <Cloud size={12} /> Cloud
                      </button>
                      <button
                        type="button"
                        className={`reports-source-filter__pill ${sourceFilter === 'local' ? 'reports-source-filter__pill--active' : ''}`}
                        onClick={() => setSourceFilter('local')}
                      >
                        <HardDrive size={12} /> Device
                      </button>
                    </div>
                  </div>
                )}
                <div className="reports-sort">
                  <span className="reports-sort__label">Sort:</span>
                  <div className="reports-sort__pills">
                    <button
                      type="button"
                      className={`reports-sort__pill ${sortBy === 'date' ? 'reports-sort__pill--active' : ''}`}
                      onClick={() => setSortBy('date')}
                      title="Newest first"
                    >
                      <Calendar size={12} aria-hidden /> Date
                    </button>
                    <button
                      type="button"
                      className={`reports-sort__pill ${sortBy === 'name' ? 'reports-sort__pill--active' : ''}`}
                      onClick={() => setSortBy('name')}
                      title="Alphabetical by file name"
                    >
                      <ArrowDownAZ size={12} aria-hidden /> A–Z
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {renameItem && (
        <div
          className="reports-rename-overlay"
          onClick={() => {
            if (!renameBusy) setRenameItem(null)
          }}
          role="presentation"
        >
          <div
            className="reports-rename-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="reports-rename-title"
            aria-modal="true"
          >
            <h3 id="reports-rename-title" className="reports-rename-title">
              Rename document
            </h3>
            <p className="reports-rename-hint">
              Include the extension (e.g. <code className="reports-rename-code">.pdf</code>). Only letters, numbers, dots,
              dashes, and underscores are kept.
            </p>
            <GlassTextField value={renameDraft} onChange={setRenameDraft} placeholder="File name" />
            <div className="reports-rename-actions">
              <GlassButton
                text="Cancel"
                onClick={() => {
                  if (!renameBusy) setRenameItem(null)
                }}
                width="auto"
                disabled={renameBusy}
              />
              <GlassButton
                text="Save"
                onClick={() => void performRenameDocument()}
                width="auto"
                isPrimary
                isLoading={renameBusy}
                disabled={renameBusy}
              />
            </div>
          </div>
        </div>
      )}

      {/* Viewer modal */}
      {viewItem && (
        <div className="reports-viewer-overlay" onClick={closeViewer}>
          <div className="reports-viewer-modal" onClick={(e) => e.stopPropagation()}>
            <div className="reports-viewer-header">
              <h3 className="reports-viewer-title">{fileNameFromKey(viewItem.key)}</h3>
              <button className="reports-viewer-close" onClick={closeViewer} aria-label="Close">
                <X size={24} />
              </button>
            </div>
            <div className={`reports-viewer-body${viewLoading || viewError ? ' reports-viewer-body--centered' : ''}`}>
              {viewLoading && <p className="reports-viewer-loading">Loading...</p>}
              {viewError && <p className="reports-viewer-error">{viewError}</p>}
              {viewUrl && !viewLoading && !viewError && (
                <>
                  {viewItem.key.toLowerCase().endsWith('.pdf') ? (
                    <div className="reports-viewer-iframe-wrap">
                      <iframe
                        src={viewUrl}
                        title={fileNameFromKey(viewItem.key)}
                        className="reports-viewer-iframe"
                      />
                    </div>
                  ) : (
                    <img
                      src={viewUrl}
                      alt={fileNameFromKey(viewItem.key)}
                      className="reports-viewer-img"
                    />
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

import { useState, useEffect, useRef, useCallback, useMemo, type ReactNode, type RefObject } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Upload, Download, Trash2, Shield, Cloud, HardDrive, Eye, X, FolderOpen, RefreshCw, FileChartColumnIncreasing, Search, Pencil, ChevronDown, ChevronUp } from 'lucide-react'
import PageGround from '../../components/financial/PageGround'
import Panel from '../../components/financial/Panel'
import KeyFigures from '../../components/financial/KeyFigures'
import Segmented from '../../components/financial/Segmented'
import { Notice, StatusChip } from '../../components/financial/Status'
import './ReportsScreen.css'

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

function formatModified(value: string): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
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

type SortKey = 'name' | 'source' | 'size' | 'modified'

function compareFileItems(a: FileItem, b: FileItem, sortKey: SortKey): number {
  if (sortKey === 'name') {
    return fileNameFromKey(a.key).localeCompare(fileNameFromKey(b.key), undefined, { sensitivity: 'base', numeric: true })
  }
  if (sortKey === 'source') return a.source.localeCompare(b.source)
  if (sortKey === 'size') return a.size - b.size
  const ta = a.lastModified ? new Date(a.lastModified).getTime() : 0
  const tb = b.lastModified ? new Date(b.lastModified).getTime() : 0
  return ta - tb
}

function sortFileItems(items: FileItem[], sortKey: SortKey, descending: boolean): FileItem[] {
  return [...items].sort((a, b) => {
    const compared = compareFileItems(a, b, sortKey)
    return descending ? -compared : compared
  })
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
  const [sortKey, setSortKey] = useState<SortKey>('modified')
  const [sortDescending, setSortDescending] = useState(true)
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

  const sortedReports = useMemo(
    () => sortFileItems(reportsMatchingSearch, sortKey, sortDescending),
    [reportsMatchingSearch, sortKey, sortDescending],
  )
  const sortedDocuments = useMemo(
    () => sortFileItems(documentsMatchingSearch, sortKey, sortDescending),
    [documentsMatchingSearch, sortKey, sortDescending],
  )

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDescending((descending) => !descending)
    } else {
      setSortKey(key)
      setSortDescending(key === 'size' || key === 'modified')
    }
  }

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

  const cloudCount = [...reports, ...documents].filter((item) => item.source === 'cloud').length
  const deviceCount = [...reports, ...documents].filter((item) => item.source === 'local').length

  const renderFileTable = ({
    items,
    listKind,
    selectedIds,
    onToggle,
    selectAllRef,
    allSelected,
    onToggleAll,
  }: {
    items: FileItem[]
    listKind: 'reports' | 'documents'
    selectedIds: string[]
    onToggle: (id: string) => void
    selectAllRef: RefObject<HTMLInputElement | null>
    allSelected: boolean
    onToggleAll: () => void
  }) => (
    <div className="fin-table-wrap">
      <table className="fin-table">
        <thead>
          <tr>
            <th className="reports-check">
              <input
                ref={selectAllRef}
                type="checkbox"
                checked={allSelected}
                onChange={onToggleAll}
                aria-label={listKind === 'reports' ? 'Select all reports in this list' : 'Select all documents in this list'}
              />
            </th>
            {([
              ['name', 'File', false],
              ['source', 'Source', false],
              ['size', 'Size', true],
              ['modified', 'Modified', true],
            ] as const).map(([key, label, numeric]) => (
              <th
                key={key}
                scope="col"
                className={numeric ? 'fin-table__num' : undefined}
                aria-sort={sortKey === key ? (sortDescending ? 'descending' : 'ascending') : 'none'}
              >
                <button
                  type="button"
                  className={`fin-table__sort ${sortKey === key ? 'fin-table__sort--active' : ''}`.trim()}
                  onClick={() => toggleSort(key)}
                >
                  {label}
                  {sortKey === key && (sortDescending
                    ? <ChevronDown size={11} aria-hidden />
                    : <ChevronUp size={11} aria-hidden />)}
                </button>
              </th>
            ))}
            <th className="reports-actions-head">
              <span className="reports-sr">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const id = fileItemId(item)
            const selected = selectedIds.includes(id)
            const name = fileNameFromKey(item.key)
            return (
              <tr key={id} className={selected ? 'reports-row--selected' : undefined}>
                <td className="reports-check">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => onToggle(id)}
                    aria-label={`Select ${name}`}
                  />
                </td>
                <td>
                  <span className="fin-table__identity">
                    <span className="fin-mark" aria-hidden>
                      {item.source === 'cloud' ? <Cloud size={14} /> : <HardDrive size={14} />}
                    </span>
                    <span className="fin-table__identity-text">
                      <span className="fin-table__primary">{name}</span>
                    </span>
                  </span>
                </td>
                <td>
                  <StatusChip tone={item.source === 'cloud' ? 'ok' : 'neutral'} label={item.source === 'cloud' ? 'Cloud' : 'Device'} />
                </td>
                <td className="fin-table__num">
                  <span className="fin-table__value">{formatSize(item.size)}</span>
                </td>
                <td className="fin-table__num">
                  <span className="fin-num">{formatModified(item.lastModified)}</span>
                </td>
                <td>
                  <div className="reports-row__actions">
                    {listKind === 'documents' && (
                      <button type="button" className="fin-btn fin-btn--icon" onClick={() => openRenameDocument(item)} title="Rename" aria-label={`Rename ${name}`}>
                        <Pencil size={14} aria-hidden />
                      </button>
                    )}
                    {isViewable(item.key) && (
                      <button type="button" className="fin-btn fin-btn--icon" onClick={() => handleView(item)} title="View" aria-label={`View ${name}`}>
                        <Eye size={14} aria-hidden />
                      </button>
                    )}
                    <button type="button" className="fin-btn fin-btn--icon" onClick={() => handleDownload(item)} title="Download" aria-label={`Download ${name}`}>
                      <Download size={14} aria-hidden />
                    </button>
                    <button type="button" className="fin-btn fin-btn--icon" onClick={() => handleDelete(item)} title="Delete" aria-label={`Delete ${name}`}>
                      <Trash2 size={14} aria-hidden />
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )

  const masthead = (actions?: ReactNode) => (
    <header className="fin-masthead">
      <div className="fin-masthead__id">
        <div className="fin-masthead__eyebrow">
          <strong>FinoCurve</strong>
          <span className="fin-masthead__sep">/</span>
          <span>Library</span>
        </div>
        <h1 className="fin-masthead__title">Reports & documents</h1>
        <p className="fin-masthead__sub">
          Risk reports and files kept on this device or in S3.
        </p>
      </div>
      {actions ? <div className="fin-masthead__actions">{actions}</div> : null}
    </header>
  )

  const frame = (body: ReactNode, actions?: ReactNode) => (
    <div className="fin-page reports">
      <PageGround />
      {masthead(actions)}
      <div className="fin-stack reports__stack">{body}</div>
    </div>
  )

  if (!hasElectronS3 && !hasElectronLocal) {
    return frame(
      <Panel title="Storage" icon={<FileText size={14} aria-hidden />}>
        <div className="fin-empty">
          <FileText size={28} aria-hidden />
          <span className="fin-empty__title">Storage is in the desktop app</span>
          <span className="fin-empty__body">
            Reports and documents are available when you run FinoCurve on the desktop. Configure an S3 bucket or choose a local folder in Settings.
          </span>
        </div>
      </Panel>,
    )
  }

  if (!s3Connected && !localConnected) {
    return frame(
      <Panel title="Storage" icon={<FileText size={14} aria-hidden />} note="Nothing is filed until a store is connected.">
        <div className="fin-empty">
          <FileText size={28} aria-hidden />
          <span className="fin-empty__title">Connect storage</span>
          <span className="fin-empty__body">
            Configure an S3 bucket or choose a local folder to keep risk reports and documents such as tax files and financial statements.
          </span>
          <button type="button" className="fin-btn fin-btn--accent" onClick={() => navigate('/settings/cloud-storage')}>
            Storage settings
          </button>
        </div>
      </Panel>,
    )
  }

  const activeItems = subTab === 'reports' ? sortedReports : sortedDocuments
  const activeTotal = subTab === 'reports' ? reports.length : documents.length
  const activeFiltered = subTab === 'reports' ? filteredReports.length : filteredDocuments.length
  const selectedIds = subTab === 'reports' ? selectedReportIds : selectedDocumentIds
  const clearSelection = () => (subTab === 'reports' ? setSelectedReportIds([]) : setSelectedDocumentIds([]))
  const bulkDelete = () => void (subTab === 'reports' ? handleBulkDeleteReports() : handleBulkDeleteDocuments())

  const emptyCopy = subTab === 'reports'
    ? (reports.length === 0
      ? 'No reports yet. Generate one from Risk analysis.'
      : filteredReports.length === 0
        ? `No ${sourceFilter === 'cloud' ? 'cloud' : 'device'} reports. Try a different filter.`
        : `No files match “${searchQuery.trim()}”.`)
    : (documents.length === 0
      ? `No documents yet. Upload tax files, financial statements, and similar records. ${MAX_FILE_SIZE_MB} MB per file.`
      : filteredDocuments.length === 0
        ? `No ${sourceFilter === 'cloud' ? 'cloud' : 'device'} documents. Try a different filter.`
        : `No files match “${searchQuery.trim()}”.`)

  return (
    <>
      {frame(
        <>
          <KeyFigures
            figures={[
              { label: 'Risk reports', value: loading ? '—' : String(reports.length), meta: 'Generated analyses' },
              { label: 'Documents', value: loading ? '—' : String(documents.length), meta: `Up to ${MAX_FILE_SIZE_MB} MB each` },
              {
                label: 'In the cloud',
                value: s3Connected ? (loading ? '—' : String(cloudCount)) : '—',
                meta: s3Connected ? 'S3' : 'Not connected',
              },
              {
                label: 'On this device',
                value: localConnected ? (loading ? '—' : String(deviceCount)) : '—',
                meta: localConnected ? 'Local folder' : 'Not connected',
              },
            ]}
          />

          {error && <Notice tone="bad">{error}</Notice>}

          <div className="reports-toolbar">
            <label className="reports-search">
              <Search size={14} aria-hidden />
              <input
                className="fin-input"
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search by file name"
                aria-label="Search by file name"
              />
              {searchQuery && (
                <button type="button" className="reports-search__clear" onClick={() => setSearchQuery('')} aria-label="Clear search">
                  <X size={14} aria-hidden />
                </button>
              )}
            </label>
            <Segmented
              options={['reports', 'documents'] as const}
              value={subTab}
              onChange={setSubTabAndClearSelection}
              labelFor={(tab) => (tab === 'reports' ? 'Reports' : 'Documents')}
              ariaLabel="Library section"
            />
            {showSourceFilter && (
              <Segmented
                options={['all', 'cloud', 'local'] as const}
                value={sourceFilter}
                onChange={setSourceFilter}
                labelFor={(source) => (source === 'all' ? 'All' : source === 'cloud' ? 'Cloud' : 'Device')}
                ariaLabel="File source"
              />
            )}
          </div>

          <Panel
            title={subTab === 'reports' ? 'Risk reports' : 'Documents'}
            icon={subTab === 'reports' ? <Shield size={14} aria-hidden /> : <FileText size={14} aria-hidden />}
            count={loading ? undefined : String(activeItems.length)}
            note={subTab === 'reports'
              ? 'Produced from Risk analysis and stored with the connected library.'
              : 'Tax files, statements, and other records you upload.'}
            flushBody={activeItems.length > 0}
            actions={
              <>
                {selectedIds.length > 0 && (
                  <>
                    <button type="button" className="fin-btn fin-btn--icon" onClick={clearSelection} disabled={deletingBulk} title="Clear selection" aria-label="Clear selection">
                      <X size={14} aria-hidden />
                    </button>
                    <button type="button" className="fin-btn" onClick={bulkDelete} disabled={deletingBulk}>
                      <Trash2 size={13} aria-hidden className={deletingBulk ? 'reports-spin' : undefined} />
                      Delete {selectedIds.length}
                    </button>
                  </>
                )}
                {subTab === 'reports' ? (
                  <button type="button" className="fin-btn fin-btn--icon" onClick={() => navigate('/risk-analysis')} title="Generate report" aria-label="Generate report">
                    <FileChartColumnIncreasing size={15} aria-hidden />
                  </button>
                ) : (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      hidden
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.txt"
                      onChange={handleUpload}
                    />
                    <button
                      type="button"
                      className="fin-btn fin-btn--icon"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      title={uploading ? 'Uploading' : 'Upload document'}
                      aria-label={uploading ? 'Uploading' : 'Upload document'}
                    >
                      <Upload size={15} aria-hidden className={uploading ? 'reports-spin' : undefined} />
                    </button>
                  </>
                )}
                <button type="button" className="fin-btn fin-btn--icon" onClick={() => void loadAll()} disabled={loading} title="Refresh list" aria-label="Refresh list">
                  <RefreshCw size={15} aria-hidden className={loading ? 'reports-spin' : undefined} />
                </button>
                {hasElectronLocal && localConnected && window.electronAPI?.localStorageOpenDocumentsFolder && (
                  <button type="button" className="fin-btn fin-btn--icon" onClick={() => void handleOpenLocalDocumentsFolder()} title="Open documents folder" aria-label="Open documents folder">
                    <FolderOpen size={15} aria-hidden />
                  </button>
                )}
              </>
            }
            footer={
              <span className="fin-footnote">
                A file stays in the store it was saved to. Cloud copies use S3. Device copies use the local folder.
              </span>
            }
          >
            {loading ? (
              <div className="fin-empty">
                <RefreshCw size={22} className="reports-spin" aria-hidden />
                <span className="fin-empty__body">Loading the library…</span>
              </div>
            ) : activeItems.length === 0 ? (
              <div className="fin-empty">
                <FileText size={28} aria-hidden />
                <span className="fin-empty__title">{activeTotal === 0 ? (subTab === 'reports' ? 'No reports on file' : 'No documents on file') : 'Nothing matches'}</span>
                <span className="fin-empty__body">{emptyCopy}</span>
                {subTab === 'reports' && reports.length === 0 && (
                  <button type="button" className="fin-btn" onClick={() => navigate('/risk-analysis')}>Risk analysis</button>
                )}
                {activeTotal > 0 && activeFiltered === 0 && (
                  <button type="button" className="fin-btn" onClick={() => setSourceFilter('all')}>Show all</button>
                )}
                {activeTotal > 0 && activeFiltered > 0 && searchNeedle && (
                  <button type="button" className="fin-btn" onClick={() => setSearchQuery('')}>Clear search</button>
                )}
              </div>
            ) : subTab === 'reports' ? (
              renderFileTable({
                items: sortedReports,
                listKind: 'reports',
                selectedIds: selectedReportIds,
                onToggle: toggleReportSelection,
                selectAllRef: selectAllReportsRef,
                allSelected: allReportsVisibleSelected,
                onToggleAll: toggleSelectAllReports,
              })
            ) : (
              renderFileTable({
                items: sortedDocuments,
                listKind: 'documents',
                selectedIds: selectedDocumentIds,
                onToggle: toggleDocumentSelection,
                selectAllRef: selectAllDocumentsRef,
                allSelected: allDocumentsVisibleSelected,
                onToggleAll: toggleSelectAllDocuments,
              })
            )}
          </Panel>
        </>,
        null,
      )}

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
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-labelledby="reports-rename-title"
            aria-modal="true"
          >
            <h2 id="reports-rename-title" className="reports-rename-title">Rename document</h2>
            <p className="reports-rename-hint">
              Include the extension, for example <span className="fin-mono">.pdf</span>. Only letters, numbers, dots, dashes, and underscores are kept.
            </p>
            <input
              className="fin-input"
              value={renameDraft}
              onChange={(event) => setRenameDraft(event.target.value)}
              placeholder="File name"
              aria-label="File name"
              disabled={renameBusy}
            />
            <div className="reports-rename-actions">
              <button type="button" className="fin-btn" onClick={() => { if (!renameBusy) setRenameItem(null) }} disabled={renameBusy}>
                Cancel
              </button>
              <button type="button" className="fin-btn fin-btn--accent" onClick={() => void performRenameDocument()} disabled={renameBusy}>
                {renameBusy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {viewItem && (
        <div className="reports-viewer-overlay" onClick={closeViewer}>
          <div className="reports-viewer-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={fileNameFromKey(viewItem.key)}>
            <div className="reports-viewer-header">
              <h2 className="reports-viewer-title">{fileNameFromKey(viewItem.key)}</h2>
              <button type="button" className="fin-btn fin-btn--icon" onClick={closeViewer} aria-label="Close">
                <X size={15} aria-hidden />
              </button>
            </div>
            <div className={`reports-viewer-body${viewLoading || viewError ? ' reports-viewer-body--centered' : ''}`}>
              {viewLoading && <p className="reports-viewer-loading">Loading…</p>}
              {viewError && <p className="reports-viewer-error">{viewError}</p>}
              {viewUrl && !viewLoading && !viewError && (
                viewItem.key.toLowerCase().endsWith('.pdf') ? (
                  <div className="reports-viewer-iframe-wrap">
                    <iframe src={viewUrl} title={fileNameFromKey(viewItem.key)} className="reports-viewer-iframe" />
                  </div>
                ) : (
                  <img src={viewUrl} alt={fileNameFromKey(viewItem.key)} className="reports-viewer-img" />
                )
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/**
 * Synchronous renderer cache backed by the versioned Electron SQLite repository.
 * localStorage is deliberately retained as a rollback-compatible cache during the
 * staged migration. A small write-ahead journal repairs interrupted IPC writes.
 */

export const PORTFOLIO_STORAGE_KEY = 'finocurve-portfolio'
export const AGENTS_STORAGE_KEY = 'finocurve-agents'
export const CONVERSATIONS_STORAGE_KEY = 'finocurve-conversations'

const STATIC_CORE_KEYS = [
  PORTFOLIO_STORAGE_KEY,
  AGENTS_STORAGE_KEY,
  CONVERSATIONS_STORAGE_KEY,
] as const

const META_STORAGE_KEY = 'finocurve-core-data-sync-v1'
const JOURNAL_PREFIX = 'finocurve-core-data-journal-v2:'
const LEGACY_JOURNAL_PREFIX = 'finocurve-core-data-journal-v1:'

interface SyncMetadataEntry {
  revision: number
  deleted: boolean
}

type SyncMetadata = Record<string, SyncMetadataEntry>

interface JournalEntry {
  storageKey: string
  value: string | null
  revision: number
}

interface PersistedJournalEntry {
  storageKey: string
  revision: number
  deleted: boolean
}

export function isCoreDataStorageKey(storageKey: string): boolean {
  return STATIC_CORE_KEYS.includes(storageKey as (typeof STATIC_CORE_KEYS)[number]) ||
    storageKey.startsWith('finocurve-portfolio:user:') ||
    storageKey.startsWith('finocurve-ai-chat-messages-')
}

function journalKey(storageKey: string): string {
  return `${JOURNAL_PREFIX}${encodeURIComponent(storageKey)}`
}

function readMetadata(): SyncMetadata {
  try {
    const raw = localStorage.getItem(META_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const result: SyncMetadata = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!isCoreDataStorageKey(key) || !value || typeof value !== 'object') continue
      const revision = (value as Partial<SyncMetadataEntry>).revision
      const deleted = (value as Partial<SyncMetadataEntry>).deleted
      if (Number.isSafeInteger(revision) && (revision as number) >= 0 && typeof deleted === 'boolean') {
        result[key] = { revision: revision as number, deleted }
      }
    }
    return result
  } catch {
    return {}
  }
}

function writeMetadata(metadata: SyncMetadata): void {
  localStorage.setItem(META_STORAGE_KEY, JSON.stringify(metadata))
}

function updateMetadata(storageKey: string, revision: number, deleted: boolean): void {
  const metadata = readMetadata()
  metadata[storageKey] = { revision, deleted }
  writeMetadata(metadata)
}

function readJournal(storageKey: string): JournalEntry | null {
  try {
    const raw = localStorage.getItem(journalKey(storageKey))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PersistedJournalEntry>
    if (parsed.storageKey !== storageKey || !Number.isSafeInteger(parsed.revision) || (parsed.revision ?? -1) < 1) {
      return null
    }
    if (typeof parsed.deleted !== 'boolean') return null
    return {
      storageKey,
      revision: parsed.revision as number,
      value: parsed.deleted ? null : currentLocalValue(storageKey),
    }
  } catch {
    return null
  }
}

function writeJournal(storageKey: string, revision: number, deleted: boolean): boolean {
  try {
    const persisted: PersistedJournalEntry = {
      storageKey,
      revision,
      deleted,
    }
    localStorage.setItem(journalKey(storageKey), JSON.stringify(persisted))
    return true
  } catch {
    return false
  }
}

function clearJournalIfCurrent(storageKey: string, revision: number): void {
  const journal = readJournal(storageKey)
  if (!journal || journal.revision > revision) return
  try { localStorage.removeItem(journalKey(storageKey)) } catch { /* retain if storage is unavailable */ }
}

function currentLocalValue(storageKey: string): string | null {
  try { return localStorage.getItem(storageKey) } catch { return null }
}

function mirrorWrite(entry: JournalEntry): void {
  const write = window.electronAPI?.coreDataWrite
  if (!write) {
    clearJournalIfCurrent(entry.storageKey, entry.revision)
    return
  }

  void write(entry).then((stored) => {
    const metadata = readMetadata()
    const current = metadata[entry.storageKey]
    if (!current || current.revision !== entry.revision) {
      clearJournalIfCurrent(entry.storageKey, stored.revision)
      return
    }

    const localValue = currentLocalValue(entry.storageKey)
    if (stored.value !== localValue) {
      // SQLite is newer than this renderer write. Preserve the current local
      // value by advancing beyond the repository revision and retrying.
      const retry: JournalEntry = {
        storageKey: entry.storageKey,
        value: localValue,
        revision: stored.revision + 1,
      }
      writeJournal(retry.storageKey, retry.revision, retry.value === null)
      try { updateMetadata(retry.storageKey, retry.revision, retry.value === null) } catch { /* journal remains */ }
      mirrorWrite(retry)
      return
    }

    try { updateMetadata(entry.storageKey, stored.revision, stored.deleted) } catch { /* repaired next startup */ }
    clearJournalIfCurrent(entry.storageKey, stored.revision)
  }).catch(() => {
    // Keep the journal and local value. Startup reconciliation will retry.
  })
}

function nextRevision(storageKey: string): number {
  return (readMetadata()[storageKey]?.revision ?? 0) + 1
}

export function getCoreDataItem(storageKey: string): string | null {
  return localStorage.getItem(storageKey)
}

export function setCoreDataItem(storageKey: string, value: string): void {
  if (!isCoreDataStorageKey(storageKey)) {
    localStorage.setItem(storageKey, value)
    return
  }

  const entry: JournalEntry = { storageKey, value, revision: nextRevision(storageKey) }
  writeJournal(storageKey, entry.revision, false)
  let storageError: unknown
  try {
    localStorage.setItem(storageKey, value)
    updateMetadata(storageKey, entry.revision, false)
  } catch (error) {
    storageError = error
  }
  mirrorWrite(entry)
  if (storageError) throw storageError
}

export function removeCoreDataItem(storageKey: string): void {
  if (!isCoreDataStorageKey(storageKey)) {
    localStorage.removeItem(storageKey)
    return
  }

  const entry: JournalEntry = { storageKey, value: null, revision: nextRevision(storageKey) }
  writeJournal(storageKey, entry.revision, true)
  let storageError: unknown
  try {
    localStorage.removeItem(storageKey)
    updateMetadata(storageKey, entry.revision, true)
  } catch (error) {
    storageError = error
  }
  mirrorWrite(entry)
  if (storageError) throw storageError
}

function recoverJournals(): void {
  const keys: string[] = []
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index)
    if (key?.startsWith(JOURNAL_PREFIX) || key?.startsWith(LEGACY_JOURNAL_PREFIX)) keys.push(key)
  }

  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key)
      if (!raw) continue
      const parsed = JSON.parse(raw) as Partial<JournalEntry & PersistedJournalEntry>
      const isLegacy = key.startsWith(LEGACY_JOURNAL_PREFIX)
      const entry: JournalEntry = {
        storageKey: parsed.storageKey ?? '',
        revision: parsed.revision ?? -1,
        value: isLegacy
          ? (parsed.value ?? null)
          : parsed.deleted
            ? null
            : currentLocalValue(parsed.storageKey ?? ''),
      }
      if (!isCoreDataStorageKey(entry.storageKey) || !Number.isSafeInteger(entry.revision) || entry.revision < 1) continue
      if (entry.value === null) localStorage.removeItem(entry.storageKey)
      else if (typeof entry.value !== 'string') continue
      else if (isLegacy) localStorage.setItem(entry.storageKey, entry.value)
      updateMetadata(entry.storageKey, entry.revision, entry.value === null)
      if (isLegacy) localStorage.removeItem(key)
    } catch {
      // Leave an unreadable journal untouched for manual recovery.
    }
  }
}

function collectBootstrapRecords(): JournalEntry[] {
  const metadata = readMetadata()
  const keys = new Set<string>(STATIC_CORE_KEYS)
  for (const key of Object.keys(metadata)) keys.add(key)
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index)
    if (key && isCoreDataStorageKey(key)) keys.add(key)
  }
  return [...keys].map((storageKey) => ({
    storageKey,
    value: currentLocalValue(storageKey),
    revision: metadata[storageKey]?.revision ?? 0,
  }))
}

let initialization: Promise<void> | null = null

export function initializeCoreDataStorage(): Promise<void> {
  if (initialization) return initialization
  initialization = (async () => {
    const bootstrap = window.electronAPI?.coreDataBootstrap
    if (!bootstrap) return

    recoverJournals()
    const response = await bootstrap({ records: collectBootstrapRecords() })
    for (const record of response.records) {
      if (!isCoreDataStorageKey(record.storageKey)) continue
      if (record.deleted || record.value === null) localStorage.removeItem(record.storageKey)
      else localStorage.setItem(record.storageKey, record.value)
      updateMetadata(record.storageKey, record.revision, record.deleted)
      clearJournalIfCurrent(record.storageKey, record.revision)
    }
  })().catch(() => {
    // SQLite/bootstrap failure must never prevent startup or alter legacy data.
  })
  return initialization
}

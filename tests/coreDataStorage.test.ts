import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

class MemoryStorage implements Storage {
  private values = new Map<string, string>()

  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, String(value)) }
}

function storedRecord(storageKey: string, value: string | null, revision: number) {
  return {
    storageKey,
    value,
    revision,
    kind: storageKey === 'finocurve-portfolio' ? 'portfolio' as const : 'agents' as const,
    checksum: value ? 'checksum' : null,
    deleted: value === null,
    validationStatus: value === null ? 'deleted' as const : 'valid' as const,
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

let storage: MemoryStorage

beforeEach(() => {
  vi.resetModules()
  storage = new MemoryStorage()
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true })
})

afterEach(() => {
  vi.restoreAllMocks()
  Reflect.deleteProperty(globalThis, 'window')
  Reflect.deleteProperty(globalThis, 'localStorage')
})

describe('core data renderer compatibility cache', () => {
  it('copies legacy localStorage to bootstrap without deleting it', async () => {
    const portfolio = JSON.stringify({ id: 'legacy', assets: [] })
    storage.setItem('finocurve-portfolio', portfolio)
    const coreDataBootstrap = vi.fn(async (payload: { records: Array<{ storageKey: string; value: string | null; revision: number }> }) => {
      expect(payload.records).toContainEqual({
        storageKey: 'finocurve-portfolio', value: portfolio, revision: 0,
      })
      return {
        records: [storedRecord('finocurve-portfolio', portfolio, 1)],
        importedCount: 1,
        verifiedCount: 1,
      }
    })
    Object.defineProperty(globalThis, 'window', {
      value: { electronAPI: { coreDataBootstrap } }, configurable: true,
    })

    const { initializeCoreDataStorage } = await import('../src/lib/coreDataStorage')
    await initializeCoreDataStorage()

    expect(coreDataBootstrap).toHaveBeenCalledOnce()
    expect(storage.getItem('finocurve-portfolio')).toBe(portfolio)
    expect([...Array(storage.length)].map((_, index) => storage.key(index)))
      .toContain('finocurve-core-data-sync-v1')
  })

  it('keeps legacy data untouched when SQLite bootstrap fails', async () => {
    const portfolio = JSON.stringify({ id: 'safe-copy', assets: [] })
    storage.setItem('finocurve-portfolio', portfolio)
    Object.defineProperty(globalThis, 'window', {
      value: { electronAPI: { coreDataBootstrap: vi.fn().mockRejectedValue(new Error('database unavailable')) } },
      configurable: true,
    })

    const { initializeCoreDataStorage } = await import('../src/lib/coreDataStorage')
    await expect(initializeCoreDataStorage()).resolves.toBeUndefined()
    expect(storage.getItem('finocurve-portfolio')).toBe(portfolio)
  })

  it('journals writes until SQLite acknowledges them and persists deletions as tombstones', async () => {
    const coreDataWrite = vi.fn(async (entry: { storageKey: string; value: string | null; revision: number }) =>
      storedRecord(entry.storageKey, entry.value, entry.revision))
    Object.defineProperty(globalThis, 'window', {
      value: { electronAPI: { coreDataWrite } }, configurable: true,
    })
    const {
      PORTFOLIO_STORAGE_KEY,
      removeCoreDataItem,
      setCoreDataItem,
    } = await import('../src/lib/coreDataStorage')
    const portfolio = JSON.stringify({ id: 'p1', assets: [] })

    setCoreDataItem(PORTFOLIO_STORAGE_KEY, portfolio)
    await vi.waitFor(() => expect(coreDataWrite).toHaveBeenCalledTimes(1))
    expect(storage.getItem(PORTFOLIO_STORAGE_KEY)).toBe(portfolio)
    await vi.waitFor(() => {
      const keys = [...Array(storage.length)].map((_, index) => storage.key(index) ?? '')
      expect(keys.some((key) => key.startsWith('finocurve-core-data-journal-v1:'))).toBe(false)
    })

    removeCoreDataItem(PORTFOLIO_STORAGE_KEY)
    await vi.waitFor(() => expect(coreDataWrite).toHaveBeenCalledTimes(2))
    expect(coreDataWrite.mock.calls[1][0]).toMatchObject({ value: null, revision: 2 })
    expect(storage.getItem(PORTFOLIO_STORAGE_KEY)).toBeNull()
  })

  it('supports browser fallback and passes non-core settings through unchanged', async () => {
    Object.defineProperty(globalThis, 'window', {
      value: { electronAPI: {} }, configurable: true,
    })
    const {
      PORTFOLIO_STORAGE_KEY,
      getCoreDataItem,
      isCoreDataStorageKey,
      removeCoreDataItem,
      setCoreDataItem,
    } = await import('../src/lib/coreDataStorage')

    expect(isCoreDataStorageKey(PORTFOLIO_STORAGE_KEY)).toBe(true)
    expect(isCoreDataStorageKey('finocurve-portfolio:user:a@example.com')).toBe(true)
    expect(isCoreDataStorageKey('finocurve-ai-chat-messages-a@example.com')).toBe(true)
    expect(isCoreDataStorageKey('finocurve-preferences')).toBe(false)
    setCoreDataItem('finocurve-preferences', '{"theme":"dark"}')
    expect(getCoreDataItem('finocurve-preferences')).toBe('{"theme":"dark"}')
    removeCoreDataItem('finocurve-preferences')
    expect(getCoreDataItem('finocurve-preferences')).toBeNull()

    setCoreDataItem(PORTFOLIO_STORAGE_KEY, '{"assets":[]}')
    await vi.waitFor(() => {
      const keys = [...Array(storage.length)].map((_, index) => storage.key(index) ?? '')
      expect(keys.some((key) => key.startsWith('finocurve-core-data-journal-v1:'))).toBe(false)
    })
  })

  it('replays interrupted journals before startup reconciliation', async () => {
    const portfolio = JSON.stringify({ id: 'journal-copy', assets: [] })
    const portfolioJournalKey = `finocurve-core-data-journal-v1:${encodeURIComponent('finocurve-portfolio')}`
    const agentsJournalKey = `finocurve-core-data-journal-v1:${encodeURIComponent('finocurve-agents')}`
    storage.setItem(portfolioJournalKey, JSON.stringify({
      storageKey: 'finocurve-portfolio', value: portfolio, revision: 7,
    }))
    storage.setItem('finocurve-agents', '[{"id":"old"}]')
    storage.setItem(agentsJournalKey, JSON.stringify({
      storageKey: 'finocurve-agents', value: null, revision: 4,
    }))
    const coreDataBootstrap = vi.fn(async () => ({
      records: [
        storedRecord('finocurve-portfolio', portfolio, 7),
        storedRecord('finocurve-agents', null, 4),
      ],
      importedCount: 2,
      verifiedCount: 2,
    }))
    Object.defineProperty(globalThis, 'window', {
      value: { electronAPI: { coreDataBootstrap } }, configurable: true,
    })

    const { initializeCoreDataStorage } = await import('../src/lib/coreDataStorage')
    await initializeCoreDataStorage()

    expect(storage.getItem('finocurve-portfolio')).toBe(portfolio)
    expect(storage.getItem('finocurve-agents')).toBeNull()
    expect(storage.getItem(portfolioJournalKey)).toBeNull()
    expect(storage.getItem(agentsJournalKey)).toBeNull()
  })

  it('retries above a newer SQLite revision without losing the local value', async () => {
    const portfolio = JSON.stringify({ id: 'local-wins', assets: [] })
    const coreDataWrite = vi.fn(async (entry: { storageKey: string; value: string | null; revision: number }) => {
      if (entry.revision === 1) return storedRecord(entry.storageKey, '{"id":"other","assets":[]}', 5)
      return storedRecord(entry.storageKey, entry.value, entry.revision)
    })
    Object.defineProperty(globalThis, 'window', {
      value: { electronAPI: { coreDataWrite } }, configurable: true,
    })

    const { PORTFOLIO_STORAGE_KEY, setCoreDataItem } = await import('../src/lib/coreDataStorage')
    setCoreDataItem(PORTFOLIO_STORAGE_KEY, portfolio)

    await vi.waitFor(() => expect(coreDataWrite).toHaveBeenCalledTimes(2))
    expect(coreDataWrite.mock.calls[1][0]).toMatchObject({ value: portfolio, revision: 6 })
    expect(storage.getItem(PORTFOLIO_STORAGE_KEY)).toBe(portfolio)
  })

  it('retains the journal when an asynchronous SQLite write fails', async () => {
    const coreDataWrite = vi.fn().mockRejectedValue(new Error('disk unavailable'))
    Object.defineProperty(globalThis, 'window', {
      value: { electronAPI: { coreDataWrite } }, configurable: true,
    })
    const { PORTFOLIO_STORAGE_KEY, setCoreDataItem } = await import('../src/lib/coreDataStorage')

    setCoreDataItem(PORTFOLIO_STORAGE_KEY, '{"id":"safe","assets":[]}')
    await vi.waitFor(() => expect(coreDataWrite).toHaveBeenCalledOnce())
    await new Promise((resolve) => setTimeout(resolve, 0))

    const keys = [...Array(storage.length)].map((_, index) => storage.key(index) ?? '')
    expect(keys.some((key) => key.startsWith('finocurve-core-data-journal-v1:'))).toBe(true)
    expect(storage.getItem(PORTFOLIO_STORAGE_KEY)).toContain('safe')
  })
})

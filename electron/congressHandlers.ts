/**
 * IPC handlers for Congressional financial disclosures (FMP Senate/House APIs).
 * Uses FMP_API_KEY from .env - never exposed to renderer.
 * Caches data locally to conserve API calls; user pulls latest manually.
 */
import { ipcMain, app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

const FMP_BASE = 'https://financialmodelingprep.com/stable'
// FMP free tier: max 25 records per request (402 error if exceeded)
const MAX_LIMIT = 25
const CACHE_FILENAME = 'finocurve-congress-cache.json'

export interface CongressCache {
  senate: CongressDisclosure[]
  house: CongressDisclosure[]
  senateFetchedAt?: string
  houseFetchedAt?: string
}

function getApiKey(): string | null {
  const key = process.env.FMP_API_KEY
  return key && key.trim() ? key.trim() : null
}

export interface CongressDisclosure {
  [key: string]: unknown
}

export interface CongressListResult {
  data: CongressDisclosure[]
  error: string | null
}

async function fetchFMP<T>(path: string, params: Record<string, string> = {}): Promise<{ data: T | null; error: string | null }> {
  const apiKey = getApiKey()
  if (!apiKey) {
    return { data: null, error: 'FMP_API_KEY not configured. Add it to your .env file.' }
  }

  const searchParams = new URLSearchParams({ ...params, apikey: apiKey })
  const url = `${FMP_BASE}${path}?${searchParams.toString()}`

  try {
    const res = await fetch(url)
    if (!res.ok) {
      const text = await res.text()
      return { data: null, error: `FMP API error ${res.status}: ${text.slice(0, 200)}` }
    }
    const json = (await res.json()) as T
    return { data: json, error: null }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { data: null, error: `Network error: ${msg}` }
  }
}

function getCachePath(): string {
  return path.join(app.getPath('userData'), CACHE_FILENAME)
}

function loadCache(): CongressCache | null {
  try {
    const p = getCachePath()
    if (!fs.existsSync(p)) return null
    const raw = fs.readFileSync(p, 'utf-8')
    return JSON.parse(raw) as CongressCache
  } catch {
    return null
  }
}

/** Exported for AI tools - returns cached congressional disclosure data. */
export function getCongressCacheData(): CongressCache | null {
  return loadCache()
}

function saveCache(cache: CongressCache): void {
  try {
    const p = getCachePath()
    fs.writeFileSync(p, JSON.stringify(cache), 'utf-8')
  } catch {
    /* ignore */
  }
}

export function registerCongressHandlers(): void {
  ipcMain.handle('congress-cache-get', async (): Promise<{ data: CongressCache; error: string | null }> => {
    const cache = loadCache()
    if (!cache) return { data: { senate: [], house: [] }, error: null }
    return { data: cache, error: null }
  })

  ipcMain.handle('congress-pull-latest', async (): Promise<{ data: CongressCache; error: string | null }> => {
    const [senateResult, houseResult] = await Promise.all([
      fetchFMP<CongressDisclosure[]>('/senate-latest', { page: '0', limit: String(MAX_LIMIT) }),
      fetchFMP<CongressDisclosure[]>('/house-latest', { page: '0', limit: String(MAX_LIMIT) }),
    ])
    const senateError = senateResult.error
    const houseError = houseResult.error
    if (senateError || houseError) {
      return {
        data: loadCache() ?? { senate: [], house: [] },
        error: senateError || houseError || null,
      }
    }
    const now = new Date().toISOString()
    const cache: CongressCache = {
      senate: Array.isArray(senateResult.data) ? senateResult.data : [],
      house: Array.isArray(houseResult.data) ? houseResult.data : [],
      senateFetchedAt: now,
      houseFetchedAt: now,
    }
    saveCache(cache)
    return { data: cache, error: null }
  })

  ipcMain.handle(
    'congress-senate',
    async (
      _event,
      payload: { page?: number; limit?: number }
    ): Promise<CongressListResult> => {
      const page = Math.max(0, payload.page ?? 0)
      const limit = Math.min(MAX_LIMIT, Math.max(1, payload.limit ?? MAX_LIMIT))
      const { data, error } = await fetchFMP<CongressDisclosure[]>('/senate-latest', {
        page: String(page),
        limit: String(limit),
      })
      if (error) return { data: [], error }
      const list = Array.isArray(data) ? data : []
      return { data: list, error: null }
    }
  )

  ipcMain.handle(
    'congress-house',
    async (
      _event,
      payload: { page?: number; limit?: number }
    ): Promise<CongressListResult> => {
      const page = Math.max(0, payload.page ?? 0)
      const limit = Math.min(MAX_LIMIT, Math.max(1, payload.limit ?? MAX_LIMIT))
      const { data, error } = await fetchFMP<CongressDisclosure[]>('/house-latest', {
        page: String(page),
        limit: String(limit),
      })
      if (error) return { data: [], error }
      const list = Array.isArray(data) ? data : []
      return { data: list, error: null }
    }
  )
}

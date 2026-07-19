// The service URL lives in the app's SQLite database (Settings → Enterprise
// service). Browser dev builds without Electron fall back to localStorage.
const BROWSER_URL_STORAGE_KEY = 'finocurve-enterprise-service-url'

let cachedServiceUrl: string | null = null

function normalizeUrl(raw: string): string {
  return (raw ?? '').trim().replace(/\/+$/, '')
}

/** Load the configured service URL (IPC or localStorage) into the module cache. */
export async function loadEnterpriseServiceUrl(): Promise<string> {
  if (window.electronAPI?.enterpriseGetUrl) {
    const result = await window.electronAPI.enterpriseGetUrl()
    cachedServiceUrl = normalizeUrl(result.url ?? '')
  } else {
    cachedServiceUrl = normalizeUrl(localStorage.getItem(BROWSER_URL_STORAGE_KEY) ?? '')
  }
  return cachedServiceUrl
}

/** Last loaded service URL; '' until loadEnterpriseServiceUrl resolves or when unconfigured. */
export function getEnterpriseServiceUrl(): string {
  return cachedServiceUrl ?? ''
}

export async function saveEnterpriseServiceUrl(url: string): Promise<{ ok: boolean; url?: string; error?: string }> {
  if (window.electronAPI?.enterpriseSetUrl) {
    const result = await window.electronAPI.enterpriseSetUrl({ url })
    if (result.ok) cachedServiceUrl = result.url ?? ''
    return result
  }
  const normalized = normalizeUrl(url)
  if (normalized) {
    try {
      const parsed = new URL(normalized)
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error()
    } catch {
      return { ok: false, error: 'Enter a valid http:// or https:// URL' }
    }
    localStorage.setItem(BROWSER_URL_STORAGE_KEY, normalized)
  } else {
    localStorage.removeItem(BROWSER_URL_STORAGE_KEY)
  }
  cachedServiceUrl = normalized
  return { ok: true, url: normalized }
}

export type EnterpriseConnection = {
  product: string
  label: string
  status: 'connected' | 'error' | 'not_configured'
  last_sync?: string | null
  institution_name?: string
  error?: string
}

export type EnterpriseBalanceProduct = {
  product: string
  institution_name?: string
  total_usd: number
  balances: Array<Record<string, unknown>>
  crypto?: Array<{ asset: string; amount: number; product: string }>
  error?: unknown
}

export type EnterpriseBalances = {
  by_product: EnterpriseBalanceProduct[]
  aggregate: { total_usd: number; crypto: Array<{ asset: string; amount: number; product: string }> }
}

export type EnterpriseTransaction = {
  id: string
  date: string
  description: string
  amount: string | number
  type: string
  status: string
  category: string
  counterparty: string
  product: string
  institution: string
  account: string
}

export type BalanceSnapshot = {
  id: number
  total_usd: number
  snapshot_date: string
  source: string
}

export async function enterpriseFetch<T>(path: string, options: { force?: boolean; signal?: AbortSignal; method?: 'GET' | 'POST' } = {}): Promise<T> {
  const { force = false, signal, method = 'GET' } = options
  if (window.electronAPI?.enterpriseRequest) {
    const result = await window.electronAPI.enterpriseRequest<T>({ path, refresh: force, method })
    if (!result.ok) throw new Error(result.error || `Finocurve Service returned ${result.status ?? 'an error'}`)
    return result.data as T
  }

  const serviceUrl = getEnterpriseServiceUrl() || await loadEnterpriseServiceUrl()
  if (!serviceUrl) throw new Error('Finocurve Service is not configured. Add its URL in Settings → Enterprise service.')
  const response = await fetch(`${serviceUrl}${path}${force ? '?refresh=1' : ''}`, {
    method,
    signal,
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`Finocurve Service returned ${response.status}`)
  return response.json() as Promise<T>
}

export function getEnterpriseSource(path: string, label: string) {
  return { label, href: `${getEnterpriseServiceUrl()}${path}` }
}

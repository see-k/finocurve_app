import { maskEnterpriseApiToken } from '../lib/enterpriseToken'

// The service URL lives in the app's SQLite database (Settings → Enterprise
// service). Browser dev builds without Electron fall back to localStorage for
// the URL; the API token is session-only in the browser.
const BROWSER_URL_STORAGE_KEY = 'finocurve-enterprise-service-url'
const BROWSER_TOKEN_STORAGE_KEY = 'finocurve-enterprise-api-token'

function readBrowserToken(): string {
  try {
    // Legacy builds wrote the bearer token to localStorage. Drop it so it
    // cannot survive the session or be read by other scripts later.
    localStorage.removeItem(BROWSER_TOKEN_STORAGE_KEY)
  } catch {
    /* ignore */
  }
  try {
    return (sessionStorage.getItem(BROWSER_TOKEN_STORAGE_KEY) ?? '').trim()
  } catch {
    return ''
  }
}

function writeBrowserToken(token: string): void {
  try {
    localStorage.removeItem(BROWSER_TOKEN_STORAGE_KEY)
  } catch {
    /* ignore */
  }
  if (token) sessionStorage.setItem(BROWSER_TOKEN_STORAGE_KEY, token)
  else sessionStorage.removeItem(BROWSER_TOKEN_STORAGE_KEY)
}

let cachedServiceUrl: string | null = null
let cachedApiToken: string | null = null

function normalizeUrl(raw: string): string {
  return (raw ?? '').trim().replace(/\/+$/, '')
}

/**
 * Absolute http(s) URLs only. Used before writing a service address into `href`
 * so a `javascript:` / `data:` value from the settings field cannot run as HTML.
 */
export function safeHttpHref(raw: string): string {
  try {
    const url = new URL(raw)
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url.href.replace(/\/+$/, '')
    }
  } catch {
    /* not an absolute http(s) URL */
  }
  return ''
}

/** Load the configured service URL (IPC or localStorage) into the module cache. */
export async function loadEnterpriseServiceUrl(): Promise<string> {
  if (window.electronAPI?.enterpriseGetUrl) {
    const result = await window.electronAPI.enterpriseGetUrl()
    cachedServiceUrl = safeHttpHref(normalizeUrl(result.url ?? ''))
  } else {
    cachedServiceUrl = safeHttpHref(normalizeUrl(localStorage.getItem(BROWSER_URL_STORAGE_KEY) ?? ''))
  }
  return cachedServiceUrl
}

/** Last loaded service URL; '' until loadEnterpriseServiceUrl resolves or when unconfigured. */
export function getEnterpriseServiceUrl(): string {
  return cachedServiceUrl ?? ''
}

/**
 * Load the API token for the browser fallback path.
 *
 * Under Electron the token lives in the main process and is never returned to
 * the window, so this resolves to '' there and the main process attaches the
 * header itself.
 */
export async function loadEnterpriseApiToken(): Promise<string> {
  if (window.electronAPI?.enterpriseGetToken) {
    cachedApiToken = ''
    return ''
  }
  cachedApiToken = readBrowserToken()
  return cachedApiToken
}

/** Whether a token is installed, and a masked hint for the UI. */
export async function getEnterpriseApiTokenStatus(): Promise<{ configured: boolean; hint: string }> {
  if (window.electronAPI?.enterpriseGetToken) {
    return window.electronAPI.enterpriseGetToken()
  }
  const token = await loadEnterpriseApiToken()
  if (!token) return { configured: false, hint: '' }
  return { configured: true, hint: maskEnterpriseApiToken(token) }
}

export async function saveEnterpriseApiToken(
  token: string,
): Promise<{ ok: boolean; configured?: boolean; hint?: string; error?: string }> {
  const trimmed = (token ?? '').trim()
  if (trimmed && /\s/.test(trimmed)) {
    return { ok: false, error: 'API tokens cannot contain spaces' }
  }
  if (window.electronAPI?.enterpriseSetToken) {
    return window.electronAPI.enterpriseSetToken({ token: trimmed })
  }
  try {
    writeBrowserToken(trimmed)
  } catch {
    return { ok: false, error: 'Could not save the API token in this browser' }
  }
  cachedApiToken = trimmed
  return {
    ok: true,
    configured: Boolean(trimmed),
    hint: maskEnterpriseApiToken(trimmed),
  }
}

export async function saveEnterpriseServiceUrl(url: string): Promise<{ ok: boolean; url?: string; error?: string }> {
  if (window.electronAPI?.enterpriseSetUrl) {
    const result = await window.electronAPI.enterpriseSetUrl({ url })
    if (result.ok) cachedServiceUrl = result.url ? safeHttpHref(result.url) : ''
    return result
  }
  const normalized = normalizeUrl(url)
  if (normalized) {
    const href = safeHttpHref(normalized)
    if (!href) return { ok: false, error: 'Enter a valid http:// or https:// URL' }
    localStorage.setItem(BROWSER_URL_STORAGE_KEY, href)
    cachedServiceUrl = href
    return { ok: true, url: href }
  }
  localStorage.removeItem(BROWSER_URL_STORAGE_KEY)
  cachedServiceUrl = ''
  return { ok: true, url: '' }
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
  /** When true, product is shown but omitted from aggregate.total_usd. */
  exclude_from_totals?: boolean
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

export async function enterpriseFetch<T>(path: string, options: { force?: boolean; signal?: AbortSignal; method?: 'GET' | 'POST'; baseUrl?: string } = {}): Promise<T> {
  const { force = false, signal, method = 'GET', baseUrl } = options
  if (window.electronAPI?.enterpriseRequest) {
    const result = await window.electronAPI.enterpriseRequest<T>({ path, refresh: force, method })
    if (!result.ok) throw new Error(result.error || `Finocurve Service returned ${result.status ?? 'an error'}`)
    return result.data as T
  }

  const serviceUrl = normalizeUrl(baseUrl ?? '') || getEnterpriseServiceUrl() || await loadEnterpriseServiceUrl()
  if (!serviceUrl) throw new Error('Finocurve Service is not configured. Add its URL in Settings → Enterprise service.')

  const token = cachedApiToken ?? await loadEnterpriseApiToken()
  const headers: Record<string, string> = { Accept: 'application/json' }
  // Every /api/* route on the service requires a bearer token.
  if (token) headers.Authorization = `Bearer ${token}`

  const response = await fetch(`${serviceUrl}${path}${force ? '?refresh=1' : ''}`, {
    method,
    signal,
    headers,
  })
  if (response.status === 401 || response.status === 403) {
    throw new Error(
      token
        ? 'Finocurve Service rejected the API token. Check it in Settings → Enterprise service.'
        : 'Finocurve Service requires an API token. Add one in Settings → Enterprise service.',
    )
  }
  if (!response.ok) throw new Error(`Finocurve Service returned ${response.status}`)
  return response.json() as Promise<T>
}

export function getEnterpriseSource(path: string, label: string): { label: string; href: string } {
  const base = safeHttpHref(getEnterpriseServiceUrl())
  if (!base) return { label, href: '' }
  try {
    return { label, href: safeHttpHref(`${base}/${path.replace(/^\/+/, '')}`) }
  } catch {
    return { label, href: '' }
  }
}

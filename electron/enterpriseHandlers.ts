/**
 * Finocurve Service integration: service URL storage, a shared authenticated
 * fetch helper, and AI-tool summary formatters consumed by LocalAIService.
 */

import { net } from 'electron'
import { getCoreDataDb } from './coreDataDb'

const ENTERPRISE_URL_SETTING_KEY = 'enterprise_service_url'
const REQUEST_TIMEOUT_MS = 20000

export function readEnterpriseServiceUrl(): string {
  try {
    const row = getCoreDataDb()
      .prepare('SELECT value FROM app_settings WHERE key = ?')
      .get(ENTERPRISE_URL_SETTING_KEY) as { value?: string } | undefined
    return (row?.value ?? '').trim()
  } catch {
    return ''
  }
}

/** Normalize to a trailing-slash-free http(s) origin+path; '' clears, null = invalid. */
export function normalizeEnterpriseUrl(raw: string): string | null {
  const trimmed = (raw ?? '').trim().replace(/\/+$/, '')
  if (!trimmed) return ''
  try {
    const url = new URL(trimmed)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    return trimmed
  } catch {
    return null
  }
}

export function saveEnterpriseServiceUrl(normalized: string): void {
  const db = getCoreDataDb()
  if (!normalized) {
    db.prepare('DELETE FROM app_settings WHERE key = ?').run(ENTERPRISE_URL_SETTING_KEY)
  } else {
    db.prepare(`
      INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(ENTERPRISE_URL_SETTING_KEY, normalized, new Date().toISOString())
  }
}

export type EnterpriseFetchResult =
  | { ok: true; status: number; data: unknown }
  | { ok: false; status?: number; error: string }

/** Fetch a Finocurve Service API path using the configured service URL. Callers are responsible for path allowlisting. */
export async function fetchEnterprisePath(
  pathName: string,
  method: 'GET' | 'POST' = 'GET',
  options?: { refresh?: boolean },
): Promise<EnterpriseFetchResult> {
  try {
    const baseUrl = readEnterpriseServiceUrl()
    if (!baseUrl) {
      return { ok: false, status: 503, error: 'Finocurve Service is not configured. Add its URL in Settings → Enterprise service.' }
    }
    const requestUrl = new URL(baseUrl)
    if (!['http:', 'https:'].includes(requestUrl.protocol)) {
      return { ok: false, status: 400, error: 'Enterprise service URL must use HTTP or HTTPS' }
    }
    requestUrl.pathname = `${requestUrl.pathname.replace(/\/+$/, '')}${pathName}`
    requestUrl.search = options?.refresh ? 'refresh=1' : ''
    requestUrl.hash = ''

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const response = await net.fetch(requestUrl.toString(), {
        method,
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      })
      const body = await response.text()
      let data: unknown
      try {
        data = body ? JSON.parse(body) : null
      } catch {
        return { ok: false, status: response.status, error: 'Service returned an invalid response' }
      }
      if (!response.ok) {
        const message = data && typeof data === 'object' && 'error' in data
          ? String((data as { error: unknown }).error)
          : `Finocurve Service returned ${response.status}`
        return { ok: false, status: response.status, error: message }
      }
      return { ok: true, status: response.status, data }
    } finally {
      clearTimeout(timeout)
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { ok: false, error: 'Finocurve Service took too long to respond. Try again.' }
    }
    return { ok: false, error: error instanceof Error ? error.message : 'Service unavailable' }
  }
}

function formatMoney(n: number): string {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}

const NOT_CONFIGURED_MESSAGE =
  'Enterprise mode is not configured. Ask the user to add the Finocurve Service URL in Settings → Enterprise service.'

function clampMaxResults(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(500, Math.max(1, Math.round(value)))
}

/** AI tool: summarize consolidated balances by source. */
export async function enterpriseGetBalancesSummary(maxResults?: number): Promise<string> {
  if (!readEnterpriseServiceUrl()) return NOT_CONFIGURED_MESSAGE
  const limit = clampMaxResults(maxResults, 50)
  const result = await fetchEnterprisePath('/api/reports/balances', 'GET')
  if (!result.ok) {
    return `[Source: Finocurve Service — balances]\nError: ${result.error}`
  }
  const data = result.data as {
    by_product?: Array<{ product: string; institution_name?: string; total_usd?: number; error?: unknown }>
    aggregate?: { total_usd?: number }
  }
  const byProduct = data.by_product ?? []
  const shown = byProduct.slice(0, limit)
  const lines = shown.map((p) => {
    const label = p.institution_name || p.product
    return p.error
      ? `- ${label} (${p.product}): error — ${String(p.error)}`
      : `- ${label} (${p.product}): ${formatMoney(p.total_usd ?? 0)}`
  })
  const truncated = byProduct.length > shown.length
    ? `\nShowing ${shown.length} of ${byProduct.length} sources (expert max ${limit}).`
    : ''
  return `[Source: Finocurve Service — consolidated balances]\nConsolidated total: ${formatMoney(data.aggregate?.total_usd ?? 0)}\nBy source:\n${lines.join('\n') || 'No sources reporting.'}${truncated}`
}

/** AI tool: summarize the most recent institutional transactions. */
export async function enterpriseGetTransactionsSummary(maxResults?: number): Promise<string> {
  if (!readEnterpriseServiceUrl()) return NOT_CONFIGURED_MESSAGE
  const limit = clampMaxResults(maxResults, 25)
  const result = await fetchEnterprisePath('/api/reports/transactions', 'GET')
  if (!result.ok) {
    return `[Source: Finocurve Service — institutional activity]\nError: ${result.error}`
  }
  const data = result.data as {
    by_product?: Array<{
      product: string
      institution_name?: string
      transactions?: Array<{ date?: string; description?: string; counterparty?: string; amount?: string | number; category?: string }>
      error?: unknown
    }>
  }
  const groups = data.by_product ?? []
  const errorNotes = groups.filter((g) => g.error).map((g) => `${g.institution_name || g.product}: ${String(g.error)}`)
  const flattened = groups.flatMap((g) => (g.transactions ?? []).map((t) => ({ ...t, institution: g.institution_name || g.product })))
  flattened.sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')))
  const recent = flattened.slice(0, limit)
  const lines = recent.map((t) =>
    `- ${t.date ?? '—'} · ${t.institution} · ${t.description || t.counterparty || 'Transaction'} · ${t.category || 'uncategorized'} · ${formatMoney(Number(t.amount) || 0)}`)
  const header = `[Source: Finocurve Service — institutional activity]\n${flattened.length} transactions across ${groups.length} accounts.`
  const errorLine = errorNotes.length ? `\nCould not load activity for: ${errorNotes.join('; ')}` : ''
  return `${header}${errorLine}\nMost recent (up to ${limit}):\n${lines.join('\n') || 'No transactions reported.'}`
}

/** AI tool: summarize live connection health per provider. */
export async function enterpriseGetConnectionHealthSummary(maxResults?: number): Promise<string> {
  if (!readEnterpriseServiceUrl()) return NOT_CONFIGURED_MESSAGE
  const limit = clampMaxResults(maxResults, 50)
  const result = await fetchEnterprisePath('/api/health/connections', 'GET')
  if (!result.ok) {
    return `[Source: Finocurve Service — connection health]\nError: ${result.error}`
  }
  const data = result.data as {
    products?: Array<{ product: string; label?: string; status: string; institution_name?: string; last_sync?: string | null; error?: string }>
  }
  const products = data.products ?? []
  const shown = products.slice(0, limit)
  const lines = shown.map((p) => {
    const label = p.institution_name || p.label || p.product
    const detail = p.error ? `(${p.error})` : p.last_sync ? `(last checked ${p.last_sync})` : ''
    return `- ${label}: ${p.status} ${detail}`.trimEnd()
  })
  const truncated = products.length > shown.length
    ? `\nShowing ${shown.length} of ${products.length} providers (expert max ${limit}).`
    : ''
  return `[Source: Finocurve Service — connection health]\n${lines.join('\n') || 'No providers configured.'}${truncated}`
}

/** AI tool: summarize recorded consolidated balance snapshots over time. */
export async function enterpriseGetBalanceHistorySummary(maxResults?: number): Promise<string> {
  if (!readEnterpriseServiceUrl()) return NOT_CONFIGURED_MESSAGE
  const limit = clampMaxResults(maxResults, 30)
  const result = await fetchEnterprisePath('/api/balance-history', 'GET')
  if (!result.ok) {
    return `[Source: Finocurve Service — balance history]\nError: ${result.error}`
  }
  const data = result.data as { history?: Array<{ snapshot_date: string; total_usd: number; source: string }> }
  const history = (data.history ?? []).slice(-limit)
  const lines = history.map((h) => `- ${h.snapshot_date}: ${formatMoney(h.total_usd)} (${h.source})`)
  return `[Source: Finocurve Service — balance history]\nRecorded snapshots (up to ${limit} most recent):\n${lines.join('\n') || 'No snapshots recorded yet.'}`
}

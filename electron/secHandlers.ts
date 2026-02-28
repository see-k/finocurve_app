/**
 * IPC handlers for SEC EDGAR filings.
 * Free, no API key. Requires User-Agent header per SEC policy.
 */
import { ipcMain } from 'electron'

const SEC_BASE = 'https://data.sec.gov'
const SEC_TICKERS = 'https://www.sec.gov/files/company_tickers.json'

// SEC requires "CompanyName ContactEmail" format - 403 if missing or malformed
const USER_AGENT = 'FinoCurve support@finocurve.com'

// Fallback map for common tickers (used when SEC tickers fetch fails or returns unexpected format)
const FALLBACK_TICKER_TO_CIK: Record<string, string> = {
  AAPL: '0000320193',
  MSFT: '0000789019',
  GOOGL: '0001652044',
  AMZN: '0001018724',
  NVDA: '0001045810',
  TSLA: '0001318605',
  META: '0001326801',
  BRK_B: '0001067983',
  JPM: '0000019617',
  V: '0001403161',
}

interface SecCompanyTickers {
  [key: string]: { cik_str?: number; cik?: number; ticker?: string; title?: string }
}

let tickerToCikCache: Map<string, string> | null = null

async function fetchSEC<T>(url: string): Promise<{ data: T | null; error: string | null }> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
      },
    })
    if (!res.ok) {
      const text = await res.text()
      return { data: null, error: `SEC API error ${res.status}: ${text.slice(0, 150)}` }
    }
    const json = (await res.json()) as T
    return { data: json, error: null }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { data: null, error: `Network error: ${msg}` }
  }
}

async function resolveCik(tickerOrCik: string): Promise<string | null> {
  const trimmed = String(tickerOrCik).trim().toUpperCase()
  if (!trimmed) return null

  if (/^\d+$/.test(trimmed)) {
    return trimmed.padStart(10, '0')
  }

  // Check fallback first (handles fetch failures and common tickers)
  const fallback = FALLBACK_TICKER_TO_CIK[trimmed]
  if (fallback) return fallback

  if (tickerToCikCache) {
    const cik = tickerToCikCache.get(trimmed)
    if (cik) return cik
  }

  const { data, error } = await fetchSEC<SecCompanyTickers>(SEC_TICKERS)
  if (error || !data) return null

  const map = new Map<string, string>()
  for (const entry of Object.values(data)) {
    const cikNum = entry.cik_str ?? entry.cik
    const ticker = entry.ticker
    if (cikNum != null && typeof ticker === 'string') {
      const cik = String(cikNum).padStart(10, '0')
      map.set(ticker.toUpperCase(), cik)
    }
  }
  tickerToCikCache = map
  return map.get(trimmed) ?? null
}

export interface SecSubmissionsResult {
  data: unknown
  error: string | null
}

export interface SecCompanyFactsResult {
  data: unknown
  error: string | null
}

export interface SecFilingContentResult {
  content: string | null
  error: string | null
}

const MAX_FILING_TEXT_LENGTH = 80_000

/** Convert SEC filing HTML to plain text for AI consumption. */
function htmlToPlainText(html: string): string {
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
  // Block elements -> newline
  text = text.replace(/<\/?(div|p|br|tr|li|h[1-6]|section|article)[^>]*>/gi, '\n')
  text = text.replace(/<[^>]+>/g, ' ')
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
  text = text.replace(/\s+/g, ' ').replace(/\n\s*\n/g, '\n').trim()
  return text
}

/** Exported for AI tools - fetches full text content of an SEC filing by ticker/CIK and accession number. */
export async function getSECFilingContentData(
  tickerOrCik: string,
  accessionNumber: string
): Promise<SecFilingContentResult> {
  const accNo = String(accessionNumber).trim()
  if (!accNo) {
    return { content: null, error: 'Accession number is required.' }
  }
  const cik = await resolveCik(tickerOrCik)
  if (!cik) {
    return {
      content: null,
      error: `Could not resolve CIK for "${tickerOrCik}". Use a valid ticker (e.g. AAPL) or 10-digit CIK.`,
    }
  }
  const { data: subData } = await fetchSEC<{
    filings?: { recent?: { accessionNumber?: string[]; primaryDocument?: string[] } }
  }>(`${SEC_BASE}/submissions/CIK${cik}.json`)
  if (!subData?.filings?.recent) {
    return { content: null, error: 'Could not load company filings.' }
  }
  const accNos = subData.filings.recent.accessionNumber ?? []
  const primaryDocs = subData.filings.recent.primaryDocument ?? []
  const idx = accNos.findIndex((a) => a === accNo)
  if (idx < 0) {
    return {
      content: null,
      error: `Accession number ${accNo} not found in recent filings. Use get_sec_filings first to get valid accession numbers.`,
    }
  }
  const primaryDoc = primaryDocs[idx] ?? accNo.replace(/-/g, '') + '.htm'
  const cleanAcc = accNo.replace(/-/g, '')
  const docUrl = `https://www.sec.gov/Archives/edgar/data/${cik}/${cleanAcc}/${primaryDoc}`

  try {
    const res = await fetch(docUrl, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
    })
    if (!res.ok) {
      return { content: null, error: `SEC returned ${res.status} for document.` }
    }
    const html = await res.text()
    const text = htmlToPlainText(html)
    const truncated =
      text.length > MAX_FILING_TEXT_LENGTH
        ? text.slice(0, MAX_FILING_TEXT_LENGTH) +
          `\n\n[... truncated - original length ${text.length} chars. Full filing at ${docUrl}]`
        : text
    return { content: truncated, error: null }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { content: null, error: `Failed to fetch filing: ${msg}` }
  }
}

/** Exported for AI tools - fetches SEC submissions for a ticker or CIK. */
export async function getSECSubmissionsData(tickerOrCik: string): Promise<SecSubmissionsResult> {
  const cik = await resolveCik(tickerOrCik)
  if (!cik) {
    return { data: null, error: `Could not resolve CIK for "${tickerOrCik}". Use a valid ticker (e.g. AAPL) or 10-digit CIK.` }
  }
  const url = `${SEC_BASE}/submissions/CIK${cik}.json`
  const { data, error } = await fetchSEC<unknown>(url)
  return { data, error }
}

export function registerSECHandlers(): void {
  ipcMain.handle(
    'sec-submissions',
    async (_event, payload: { tickerOrCik: string }): Promise<SecSubmissionsResult> => {
      const cik = await resolveCik(payload.tickerOrCik)
      if (!cik) {
        return { data: null, error: `Could not resolve CIK for "${payload.tickerOrCik}". Use a valid ticker (e.g. AAPL) or 10-digit CIK.` }
      }
      const url = `${SEC_BASE}/submissions/CIK${cik}.json`
      const { data, error } = await fetchSEC<unknown>(url)
      return { data, error }
    }
  )

  ipcMain.handle(
    'sec-filing-content',
    async (
      _event,
      payload: { tickerOrCik: string; accessionNumber: string }
    ): Promise<SecFilingContentResult> => {
      return getSECFilingContentData(payload.tickerOrCik, payload.accessionNumber)
    }
  )

  ipcMain.handle(
    'sec-company-facts',
    async (_event, payload: { tickerOrCik: string }): Promise<SecCompanyFactsResult> => {
      const cik = await resolveCik(payload.tickerOrCik)
      if (!cik) {
        return { data: null, error: `Could not resolve CIK for "${payload.tickerOrCik}". Use a valid ticker (e.g. AAPL) or 10-digit CIK.` }
      }
      const url = `${SEC_BASE}/api/xbrl/companyfacts/CIK${cik}.json`
      const { data, error } = await fetchSEC<unknown>(url)
      return { data, error }
    }
  )
}

/**
 * Build ticker→CIK lookup map from SEC company_tickers.json payload.
 */

export interface SecCompanyTickerEntry {
  cik_str?: number
  cik?: number
  ticker?: string
  title?: string
}

export function buildTickerToCikMap(data: Record<string, SecCompanyTickerEntry>): Map<string, string> {
  const map = new Map<string, string>()
  for (const entry of Object.values(data)) {
    const cikNum = entry.cik_str ?? entry.cik
    const ticker = entry.ticker
    if (cikNum != null && typeof ticker === 'string') {
      map.set(ticker.toUpperCase(), String(cikNum).padStart(10, '0'))
    }
  }
  return map
}

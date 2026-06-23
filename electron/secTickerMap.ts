export interface SecCompanyTickerEntry {
  cik_str?: number
  cik?: number
  ticker?: string
  title?: string
}

export type SecCompanyTickers = Record<string, SecCompanyTickerEntry>

/** Build a ticker→zero-padded CIK map from SEC company_tickers.json. */
export function buildTickerToCikMap(data: SecCompanyTickers): Map<string, string> {
  const map = new Map<string, string>()
  for (const entry of Object.values(data)) {
    const cikNum = entry.cik_str ?? entry.cik
    const ticker = entry.ticker
    if (cikNum != null && typeof ticker === 'string') {
      const cik = String(cikNum).padStart(10, '0')
      map.set(ticker.toUpperCase(), cik)
    }
  }
  return map
}

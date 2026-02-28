import { useState } from 'react'
import { Search, Loader2, ExternalLink, AlertCircle, FileText } from 'lucide-react'
import GlassContainer from '../glass/GlassContainer'
import GlassTextField from '../glass/GlassTextField'
import './SECFilingsView.css'

interface SecSubmissions {
  cik?: string
  name?: string
  tickers?: string[]
  filings?: {
    recent?: {
      accessionNumber?: string[]
      form?: string[]
      primaryDocument?: string[]
      filingDate?: string[]
      primaryDocDescription?: string[]
    }
  }
}

export default function SECFilingsView() {
  const [query, setQuery] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [data, setData] = useState<SecSubmissions | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSearch = async () => {
    const q = query.trim()
    if (!q) return
    if (!window.electronAPI?.secSubmissions) {
      setError('SEC filings are only available in the desktop app.')
      return
    }
    setSubmittedQuery(q)
    setLoading(true)
    setError(null)
    setData(null)
    try {
      const result = await window.electronAPI.secSubmissions({ tickerOrCik: q })
      if (result.error) {
        setError(result.error)
        setData(null)
      } else {
        setData(result.data as SecSubmissions)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load filings')
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  const filings = data?.filings?.recent
  const filingsCount = filings?.form?.length ?? 0

  const getFilingUrl = (accNo: string, primaryDoc: string, cik: string): string => {
    if (!accNo || !cik) return `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}`
    const cleanAcc = accNo.replace(/-/g, '')
    const doc = primaryDoc || `${cleanAcc}.htm`
    return `https://www.sec.gov/Archives/edgar/data/${cik}/${cleanAcc}/${doc}`
  }

  return (
    <div className="sec-filings-view">
      <div className="sec-header">
        <form className="sec-search-row" onSubmit={e => { e.preventDefault(); handleSearch() }}>
          <GlassTextField
            value={query}
            onChange={setQuery}
            placeholder="Enter ticker or CIK (e.g. AAPL, 320193)"
            prefixIcon={<Search size={16} />}
          />
          <button
            className="sec-search-btn"
            onClick={handleSearch}
            disabled={loading || !query.trim()}
          >
            {loading ? <Loader2 size={18} className="spin" /> : <Search size={18} />}
            Search
          </button>
        </form>
        <p className="sec-hint">Search SEC EDGAR filings by stock ticker or Central Index Key (CIK).</p>
      </div>

      {error && (
        <GlassContainer padding="16px" className="sec-error">
          <AlertCircle size={18} style={{ color: 'var(--status-error)', flexShrink: 0 }} />
          <span>{error}</span>
        </GlassContainer>
      )}

      {loading ? (
        <GlassContainer padding="40px" className="sec-loading">
          <Loader2 size={32} className="spin" />
          <p>Loading filings for {submittedQuery}...</p>
        </GlassContainer>
      ) : data && submittedQuery ? (
        <GlassContainer padding="0" borderRadius={16} className="sec-results">
          <div className="sec-company-info">
            <h3 className="sec-company-name">{data.name ?? 'Unknown'}</h3>
            <p className="sec-company-meta">
              CIK: {data.cik ?? '—'} • Tickers: {(data.tickers ?? []).join(', ') || '—'}
            </p>
          </div>
          {filingsCount === 0 ? (
            <div className="sec-empty">No recent filings found.</div>
          ) : (
            <div className="sec-filings-list">
              {(filings?.form ?? []).map((form, i) => {
                const accNo = filings?.accessionNumber?.[i] ?? ''
                const date = filings?.filingDate?.[i]
                const primary = filings?.primaryDocument?.[i] ?? ''
                const desc = filings?.primaryDocDescription?.[i]
                const url = getFilingUrl(accNo, primary, data?.cik ?? '')
                return (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="sec-filing-row"
                  >
                    <FileText size={16} className="sec-filing-icon" />
                    <div className="sec-filing-info">
                      <span className="sec-filing-form">{form}</span>
                      <span className="sec-filing-date">{date ?? '—'}</span>
                      {desc && <span className="sec-filing-desc">{desc}</span>}
                    </div>
                    <ExternalLink size={14} className="sec-filing-link" />
                  </a>
                )
              })}
            </div>
          )}
        </GlassContainer>
      ) : (
        <GlassContainer padding="40px" className="sec-empty-state">
          <FileText size={48} style={{ color: 'var(--text-tertiary)', marginBottom: 16 }} />
          <p>Enter a ticker symbol or CIK to view SEC filings.</p>
          <p className="sec-examples">Examples: AAPL, MSFT, 320193 (Apple CIK)</p>
        </GlassContainer>
      )}
    </div>
  )
}

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Loader2, Users, Building2, AlertCircle, RefreshCw, ChevronDown, ChevronRight, TrendingUp, TrendingDown, ExternalLink } from 'lucide-react'
import GlassContainer from '../glass/GlassContainer'
import './CongressionalTradesView.css'

type Chamber = 'senate' | 'house'

interface CongressDisclosure {
  [key: string]: unknown
}

interface CongressCache {
  senate: CongressDisclosure[]
  house: CongressDisclosure[]
  senateFetchedAt?: string
  houseFetchedAt?: string
}

interface MemberGroup {
  key: string
  name: string
  filings: CongressDisclosure[]
}

const SENATE_FILINGS_URL = 'https://efdsearch.senate.gov/search/'
const HOUSE_FILINGS_URL = 'https://disclosures.house.gov/ld/ldsearch.aspx'

function getFilingUrl(f: CongressDisclosure): string | null {
  const url = f.url ?? f.documentUrl ?? f.filingUrl ?? f.reportUrl ?? f.link
  return typeof url === 'string' && url.startsWith('http') ? url : null
}

function getMemberKey(d: CongressDisclosure): string {
  const first = String(d.firstName ?? '').trim()
  const last = String(d.lastName ?? '').trim()
  return `${first}|${last}`.toLowerCase() || 'unknown'
}

function getMemberName(d: CongressDisclosure): string {
  const first = String(d.firstName ?? '').trim()
  const last = String(d.lastName ?? '').trim()
  return [first, last].filter(Boolean).join(' ') || 'Unknown'
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function formatValue(val: unknown): string {
  if (val == null) return '—'
  if (typeof val === 'string') return val
  if (typeof val === 'number') return val.toLocaleString()
  return String(val)
}

function formatDate(val: unknown): string {
  if (val == null) return '—'
  const s = String(val)
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    return new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  }
  return s
}

export default function CongressionalTradesView() {
  const [chamber, setChamber] = useState<Chamber>('senate')
  const [cache, setCache] = useState<CongressCache | null>(null)
  const [loading, setLoading] = useState(false)
  const [pulling, setPulling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedMember, setExpandedMember] = useState<string | null>(null)

  const loadCache = useCallback(async () => {
    if (!window.electronAPI?.congressCacheGet) {
      setError('Congressional data is only available in the desktop app.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await window.electronAPI.congressCacheGet()
      if (result.data) {
        setCache(result.data)
      }
    } catch {
      setCache({ senate: [], house: [] })
    } finally {
      setLoading(false)
    }
  }, [])

  const pullLatest = useCallback(async () => {
    if (!window.electronAPI?.congressPullLatest) return
    setPulling(true)
    setError(null)
    try {
      const result = await window.electronAPI.congressPullLatest()
      if (result.error) {
        setError(result.error)
      } else if (result.data) {
        setCache(result.data)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to pull latest')
    } finally {
      setPulling(false)
    }
  }, [])

  useEffect(() => {
    loadCache()
  }, [loadCache])

  const rawList = chamber === 'senate' ? (cache?.senate ?? []) : (cache?.house ?? [])
  const membersByKey = useMemo(() => {
    const map = new Map<string, MemberGroup>()
    for (const d of rawList) {
      const key = getMemberKey(d)
      const name = getMemberName(d)
      const existing = map.get(key)
      if (existing) {
        existing.filings.push(d)
      } else {
        map.set(key, { key, name, filings: [d] })
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [rawList])

  const fetchedAt = chamber === 'senate' ? cache?.senateFetchedAt : cache?.houseFetchedAt

  return (
    <div className="congressional-trades-view">
      <div className="ct-header">
        <div className="ct-chamber-tabs">
          <button
            className={`ct-chamber-tab ${chamber === 'senate' ? 'ct-chamber-tab--active' : ''}`}
            onClick={() => { setChamber('senate'); setExpandedMember(null) }}
          >
            <Users size={18} /> Senate
          </button>
          <button
            className={`ct-chamber-tab ${chamber === 'house' ? 'ct-chamber-tab--active' : ''}`}
            onClick={() => { setChamber('house'); setExpandedMember(null) }}
          >
            <Building2 size={18} /> House
          </button>
        </div>
        <div className="ct-meta">
          {fetchedAt && (
            <span className="ct-fetched">Last updated: {formatDate(fetchedAt)}</span>
          )}
          <button
            className="ct-refresh-btn"
            onClick={pullLatest}
            disabled={pulling}
            title="Fetch latest from FMP (2 API calls)"
          >
            {pulling ? <Loader2 size={14} className="ct-spin" /> : <RefreshCw size={14} />}
            Refresh
          </button>
          <span className="ct-disclaimer">STOCK Act disclosures. Informational only.</span>
        </div>
      </div>

      {error && (
        <GlassContainer padding="16px" className="ct-error">
          <AlertCircle size={18} style={{ color: 'var(--status-error)', flexShrink: 0 }} />
          <span>{error}</span>
        </GlassContainer>
      )}

      {loading ? (
        <GlassContainer padding="48px" className="ct-loading">
          <Loader2 size={36} className="ct-spin" />
          <p>Loading cached data...</p>
        </GlassContainer>
      ) : membersByKey.length === 0 ? (
        <GlassContainer padding="48px" className="ct-empty">
          <Users size={48} style={{ color: 'var(--text-tertiary)', marginBottom: 16 }} />
          <p>No cached disclosures.</p>
          <p className="ct-empty-hint">Click Refresh to fetch data (2 API calls).</p>
          <button
            className="ct-refresh-btn ct-refresh-btn--primary"
            onClick={pullLatest}
            disabled={pulling}
          >
            {pulling ? <Loader2 size={18} className="ct-spin" /> : <RefreshCw size={18} />}
            Refresh
          </button>
        </GlassContainer>
      ) : (
        <div className="ct-members">
          {membersByKey.map(member => {
            const isExpanded = expandedMember === member.key
            const buyCount = member.filings.filter(f =>
              /purchase|buy/i.test(String(f.transactionType ?? ''))
            ).length
            const sellCount = member.filings.filter(f =>
              /sale|sell/i.test(String(f.transactionType ?? ''))
            ).length
            return (
              <div key={member.key} className="ct-member-card">
                <button
                  className="ct-member-head"
                  onClick={() => setExpandedMember(isExpanded ? null : member.key)}
                >
                  <div className="ct-member-avatar">
                    {getInitials(member.name)}
                  </div>
                  <div className="ct-member-info">
                    <span className="ct-member-name">{member.name}</span>
                    <span className="ct-member-stats">
                      {member.filings.length} filing{member.filings.length !== 1 ? 's' : ''}
                      {buyCount + sellCount > 0 && (
                        <>
                          {' • '}
                          <span className="ct-buy">{buyCount} buy</span>
                          <span className="ct-sell">{sellCount} sell</span>
                        </>
                      )}
                    </span>
                  </div>
                  {isExpanded ? (
                    <ChevronDown size={20} className="ct-chevron" />
                  ) : (
                    <ChevronRight size={20} className="ct-chevron" />
                  )}
                </button>
                {isExpanded && (
                  <div className="ct-member-filings">
                    <a
                      href={chamber === 'senate' ? SENATE_FILINGS_URL : HOUSE_FILINGS_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ct-view-filings-link"
                    >
                      <ExternalLink size={14} />
                      View {member.name}'s filings on {chamber === 'senate' ? 'Senate.gov' : 'House.gov'}
                    </a>
                    {member.filings.map((f, i) => {
                      const type = String(f.transactionType ?? '').toLowerCase()
                      const isBuy = /purchase|buy/i.test(type)
                      const filingUrl = getFilingUrl(f)
                      const rowContent = (
                        <>
                          <div className="ct-filing-type">
                            {isBuy ? (
                              <TrendingUp size={14} className="ct-icon-buy" />
                            ) : (
                              <TrendingDown size={14} className="ct-icon-sell" />
                            )}
                            <span>{formatValue(f.transactionType) || '—'}</span>
                          </div>
                          <div className="ct-filing-asset">
                            {formatValue(f.assetDescription) || formatValue(f.ticker) || '—'}
                          </div>
                          <div className="ct-filing-amount">{formatValue(f.amount)}</div>
                          <div className="ct-filing-date">{formatDate(f.transactionDate)}</div>
                          {filingUrl && (
                            <span className="ct-filing-doc-link">
                              <ExternalLink size={12} /> View filing
                            </span>
                          )}
                        </>
                      )
                      return filingUrl ? (
                        <a
                          key={i}
                          href={filingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ct-filing-row ct-filing-row--link"
                        >
                          {rowContent}
                        </a>
                      ) : (
                        <div key={i} className="ct-filing-row">
                          {rowContent}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

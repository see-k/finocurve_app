import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Search, Loader2 } from 'lucide-react'
import GlassContainer from '../../components/glass/GlassContainer'
import GlassButton from '../../components/glass/GlassButton'
import GlassTextField from '../../components/glass/GlassTextField'
import GlassIconButton from '../../components/glass/GlassIconButton'
import AssetLogo from '../../components/AssetLogo'
import type { Asset, AssetType } from '../../types'
import { getCoreDataItem, PORTFOLIO_STORAGE_KEY, setCoreDataItem } from '../../lib/coreDataStorage'
import { createFinancialProvenance, normalizePortfolioFinancialProvenance } from '../../lib/financialProvenance'
import './AddAsset.css'

interface PublicAsset {
  symbol: string; name: string; type: AssetType; price: number; sector: string
  priceSource?: string; priceAsOf?: string; isLive?: boolean
}

const SAMPLE_PUBLIC_ASSETS: PublicAsset[] = [
  { symbol: 'AAPL', name: 'Apple Inc.', type: 'stock', price: 227.63, sector: 'technology' },
  { symbol: 'MSFT', name: 'Microsoft Corp.', type: 'stock', price: 415.20, sector: 'technology' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', type: 'stock', price: 174.50, sector: 'communication' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', type: 'stock', price: 201.35, sector: 'consumer_discretionary' },
  { symbol: 'NVDA', name: 'NVIDIA Corp.', type: 'stock', price: 875.40, sector: 'technology' },
  { symbol: 'TSLA', name: 'Tesla Inc.', type: 'stock', price: 352.80, sector: 'consumer_discretionary' },
  { symbol: 'META', name: 'Meta Platforms', type: 'stock', price: 532.10, sector: 'communication' },
  { symbol: 'BTC', name: 'Bitcoin', type: 'crypto', price: 97450, sector: 'crypto' },
  { symbol: 'ETH', name: 'Ethereum', type: 'crypto', price: 3280.50, sector: 'crypto' },
  { symbol: 'SOL', name: 'Solana', type: 'crypto', price: 195.20, sector: 'crypto' },
  { symbol: 'VOO', name: 'Vanguard S&P 500 ETF', type: 'etf', price: 478.35, sector: 'diversified' },
  { symbol: 'QQQ', name: 'Invesco QQQ Trust', type: 'etf', price: 498.20, sector: 'technology' },
  { symbol: 'VTI', name: 'Vanguard Total Stock Mkt', type: 'etf', price: 275.60, sector: 'diversified' },
  { symbol: 'JPM', name: 'JPMorgan Chase & Co.', type: 'stock', price: 245.80, sector: 'financials' },
  { symbol: 'JNJ', name: 'Johnson & Johnson', type: 'stock', price: 152.30, sector: 'healthcare' },
]

export default function SearchPublicAssetScreen() {
  const navigate = useNavigate()
  const [visible, setVisible] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<PublicAsset | null>(null)
  const [quantity, setQuantity] = useState('')
  const [costBasis, setCostBasis] = useState('')
  const [searchResults, setSearchResults] = useState<PublicAsset[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  useEffect(() => { requestAnimationFrame(() => setVisible(true)) }, [])

  const hasLiveSearch = typeof window !== 'undefined' && !!window.electronAPI?.priceSearch

  const fetchSearch = useCallback(async (q: string) => {
    if (!q.trim() || !hasLiveSearch) return
    setSearchLoading(true)
    setSearchError(null)
    try {
      const { results, error } = await window.electronAPI!.priceSearch!({ query: q.trim() })
      if (error) {
        setSearchError(error)
        setSearchResults([])
      } else {
        setSearchResults(results as PublicAsset[])
      }
    } catch {
      setSearchError('Search failed')
      setSearchResults([])
    } finally {
      setSearchLoading(false)
    }
  }, [hasLiveSearch])

  useEffect(() => {
    if (!query.trim()) {
      setSearchResults([])
      setSearchError(null)
      return
    }
    const timer = setTimeout(() => fetchSearch(query), 350)
    return () => clearTimeout(timer)
  }, [query, fetchSearch])

  const results = useMemo(() => {
    if (!query.trim()) return SAMPLE_PUBLIC_ASSETS.slice(0, 8)
    if (hasLiveSearch && !searchError) {
      if (searchLoading && searchResults.length === 0) return []
      if (searchResults.length > 0) return searchResults
    }
    const q = query.toLowerCase()
    return SAMPLE_PUBLIC_ASSETS.filter(
      a => a.symbol.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)
    )
  }, [query, hasLiveSearch, searchResults, searchLoading, searchError])

  const handleAdd = () => {
    if (!selected || !quantity) return
    const now = new Date().toISOString()
    const currentSource = selected.priceSource || 'FinoCurve sample market data'
    const currentSourceKind = selected.isLive ? 'market' : 'demo'
    const currentAsOf = selected.priceAsOf || now
    const enteredCostBasis = costBasis ? parseFloat(costBasis) : null
    const asset: Asset = {
      id: crypto.randomUUID(),
      name: selected.name,
      symbol: selected.symbol,
      type: selected.type,
      category: 'public',
      quantity: parseFloat(quantity),
      costBasis: enteredCostBasis ?? parseFloat(quantity) * selected.price,
      currentPrice: selected.price,
      currency: 'USD',
      tags: [],
      sector: selected.sector as Asset['sector'],
      financialProvenance: {
        currentPrice: createFinancialProvenance({
          sourceKind: currentSourceKind,
          sourceName: currentSource,
          valuationMethod: selected.isLive ? 'market_price' : 'legacy_record',
          asOf: currentAsOf,
          recordedAt: now,
          isEstimated: !selected.isLive,
        }, now),
        costBasis: createFinancialProvenance(enteredCostBasis !== null ? {
          sourceKind: 'manual', sourceName: 'User-entered cost basis', valuationMethod: 'acquisition_cost',
          asOf: now, recordedAt: now,
        } : {
          sourceKind: currentSourceKind, sourceName: currentSource, valuationMethod: 'quantity_times_price',
          asOf: currentAsOf, recordedAt: now, isEstimated: !selected.isLive,
        }, now),
      },
    }
    const portfolio = normalizePortfolioFinancialProvenance(JSON.parse(getCoreDataItem(PORTFOLIO_STORAGE_KEY) || '{}'))
    portfolio.assets = [...(portfolio.assets || []), asset]
    portfolio.updatedAt = now
    setCoreDataItem(PORTFOLIO_STORAGE_KEY, JSON.stringify(portfolio))
    navigate('/main', { replace: true })
  }

  return (
    <div className="add-asset-screen">
      <div className="add-asset-bg-glow add-asset-bg-glow--1" />
      <div className="add-asset-bg-glow add-asset-bg-glow--2" />
      <div className={`add-asset-content ${visible ? 'add-asset-content--visible' : ''}`}>
        <div className="add-asset-header">
          <GlassIconButton icon={<ArrowLeft size={20} />} onClick={() => navigate(-1)} size={44} />
        </div>
        <GlassContainer>
          <h1 className="add-asset-title">Search Public Asset</h1>
          <p className="add-asset-subtitle">Find stocks, ETFs, and crypto by name or ticker</p>

          <GlassTextField
            value={query}
            onChange={setQuery}
            placeholder="Search by name or symbol..."
            prefixIcon={<Search size={18} />}
          />

          {!selected ? (
            <div className="search-results">
              {searchLoading && (
                <div className="search-results-loading">
                  <Loader2 size={24} className="spin" />
                  <span>Searching Yahoo Finance…</span>
                </div>
              )}
              {!searchLoading && searchError && query.trim() && (
                <div className="search-results-error">
                  {searchError}
                  <span className="search-results-fallback">Showing sample list below.</span>
                </div>
              )}
              {results.map(a => (
                <div
                  key={a.symbol}
                  className="search-result-item"
                  onClick={() => setSelected(a)}
                >
                  <AssetLogo symbol={a.symbol} name={a.name} type={a.type} size={36} borderRadius={10} />
                  <div>
                    <div className="search-result-item__symbol">{a.symbol}</div>
                    <div className="search-result-item__name">{a.name}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>${a.price.toLocaleString()}</div>
                    <span className="search-result-item__type">{a.type}</span>
                    <div className="search-result-item__source">{a.priceSource || 'Sample data'}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="search-quantity-form">
              <div className="search-result-item search-result-item--selected">
                <AssetLogo symbol={selected.symbol} name={selected.name} type={selected.type} size={36} borderRadius={10} />
                <div>
                  <div className="search-result-item__symbol">{selected.symbol}</div>
                  <div className="search-result-item__name">{selected.name}</div>
                </div>
                <GlassButton text="Change" onClick={() => setSelected(null)} width="auto" />
              </div>

              <div className="add-asset-row">
                <div>
                  <label className="add-asset-label">Quantity / Shares</label>
                  <GlassTextField value={quantity} onChange={setQuantity} placeholder="e.g. 10" type="number" />
                </div>
                <div>
                  <label className="add-asset-label">Total Cost Basis ($)</label>
                  <GlassTextField
                    value={costBasis}
                    onChange={setCostBasis}
                    placeholder={quantity ? `${(parseFloat(quantity || '0') * selected.price).toFixed(2)}` : '0.00'}
                    type="number"
                  />
                </div>
              </div>

              <div className="add-asset-actions">
                <GlassButton text="Cancel" onClick={() => navigate(-1)} />
                <GlassButton text="Add to Portfolio" onClick={handleAdd} isPrimary disabled={!quantity} />
              </div>
            </div>
          )}
        </GlassContainer>
      </div>
    </div>
  )
}

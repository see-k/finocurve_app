import { useState, useMemo, useCallback } from 'react'
import {
  Search, Star,
  ArrowUpRight, ArrowDownRight,
  LineChart,
} from 'lucide-react'
import GlassContainer from '../../components/glass/GlassContainer'
import GlassTextField from '../../components/glass/GlassTextField'
import GlassIconButton from '../../components/glass/GlassIconButton'
import AssetLogo from '../../components/AssetLogo'
import TradingViewChart, {
  getTradingViewSymbol,
  resolveChartSymbolInput,
  type ChartSymbolLookup,
} from '../../components/TradingViewChart'
import {
  HeatmapWidget,
  ScreenerWidget,
  TimelineWidget,
  type HeatmapKind,
  type ScreenerMarket,
} from '../../components/TradingViewWidgets'
import { useWatchlist } from '../../store/useWatchlist'
import MarketsDashboard from './MarketsDashboard'
import './MarketsScreen.css'

const MARKETS_BG = 'https://images.unsplash.com/photo-1515266591878-f93e32bc5937?q=80&w=1287&auto=format&fit=crop'

interface MarketItem {
  symbol: string; name: string; price: number; change: number; changePct: number; type: string
}

const INDICES: MarketItem[] = [
  { symbol: 'SPX', name: 'S&P 500', price: 5892.58, change: 45.23, changePct: 0.77, type: 'index' },
  { symbol: 'DJI', name: 'Dow Jones', price: 43842.67, change: 312.08, changePct: 0.72, type: 'index' },
  { symbol: 'IXIC', name: 'NASDAQ', price: 18972.42, change: -23.65, changePct: -0.12, type: 'index' },
  { symbol: 'RUT', name: 'Russell 2000', price: 2245.18, change: 18.40, changePct: 0.83, type: 'index' },
]

const STOCKS: MarketItem[] = [
  { symbol: 'AAPL', name: 'Apple Inc.', price: 227.63, change: 3.42, changePct: 1.53, type: 'stock' },
  { symbol: 'MSFT', name: 'Microsoft Corp.', price: 415.20, change: -2.10, changePct: -0.50, type: 'stock' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', price: 174.50, change: 1.80, changePct: 1.04, type: 'stock' },
  { symbol: 'AMZN', name: 'Amazon.com', price: 201.35, change: 4.50, changePct: 2.28, type: 'stock' },
  { symbol: 'NVDA', name: 'NVIDIA Corp.', price: 875.40, change: 12.30, changePct: 1.42, type: 'stock' },
  { symbol: 'TSLA', name: 'Tesla Inc.', price: 352.80, change: -8.20, changePct: -2.27, type: 'stock' },
  { symbol: 'META', name: 'Meta Platforms', price: 532.10, change: 6.70, changePct: 1.27, type: 'stock' },
  { symbol: 'JPM', name: 'JPMorgan Chase', price: 245.80, change: 1.20, changePct: 0.49, type: 'stock' },
  { symbol: 'JNJ', name: 'Johnson & Johnson', price: 152.30, change: -0.85, changePct: -0.56, type: 'stock' },
  { symbol: 'V', name: 'Visa Inc.', price: 312.45, change: 2.35, changePct: 0.76, type: 'stock' },
]

const CRYPTO: MarketItem[] = [
  { symbol: 'BTC', name: 'Bitcoin', price: 97450, change: 1250, changePct: 1.30, type: 'crypto' },
  { symbol: 'ETH', name: 'Ethereum', price: 3280.50, change: -45.20, changePct: -1.36, type: 'crypto' },
  { symbol: 'SOL', name: 'Solana', price: 195.20, change: 8.40, changePct: 4.50, type: 'crypto' },
  { symbol: 'BNB', name: 'Binance Coin', price: 585.30, change: 12.80, changePct: 2.24, type: 'crypto' },
  { symbol: 'ADA', name: 'Cardano', price: 0.98, change: -0.03, changePct: -2.97, type: 'crypto' },
  { symbol: 'XRP', name: 'Ripple', price: 2.42, change: 0.08, changePct: 3.42, type: 'crypto' },
  { symbol: 'DOT', name: 'Polkadot', price: 7.85, change: 0.25, changePct: 3.29, type: 'crypto' },
  { symbol: 'DOGE', name: 'Dogecoin', price: 0.32, change: 0.01, changePct: 3.23, type: 'crypto' },
  { symbol: 'AVAX', name: 'Avalanche', price: 38.50, change: 1.20, changePct: 3.21, type: 'crypto' },
  { symbol: 'LINK', name: 'Chainlink', price: 18.90, change: -0.45, changePct: -2.33, type: 'crypto' },
]

const ALL_ITEMS = [...STOCKS, ...CRYPTO]

type TabId = 'dashboard' | 'chart' | 'watchlist' | 'crypto' | 'heatmaps' | 'screener' | 'news'

const SYMBOL_INDEX_LIST: MarketItem[] = [...INDICES, ...STOCKS, ...CRYPTO]

const HEATMAP_TAB_ROWS: { id: HeatmapKind; label: string }[] = [
  { id: 'stock', label: 'Stocks' },
  { id: 'crypto', label: 'Crypto' },
  { id: 'forex', label: 'Forex' },
  { id: 'etf', label: 'ETF' },
]

const SCREENER_TAB_ROWS: { id: ScreenerMarket; label: string }[] = [
  { id: 'us', label: 'US stocks' },
  { id: 'forex', label: 'Forex' },
  { id: 'crypto_mkt', label: 'Crypto' },
]

/** TradingView embed height; keeps heatmaps/screener usable without overflow on typical laptop viewports */
const TV_EMBED_HEIGHT = 580

export default function MarketsScreen() {
  const [tab, setTab] = useState<TabId>('dashboard')
  const [heatmapKind, setHeatmapKind] = useState<HeatmapKind>('stock')
  const [screenerMarket, setScreenerMarket] = useState<ScreenerMarket>('us')
  const [searchQuery, setSearchQuery] = useState('')
  const [chartSymbol, setChartSymbol] = useState<{ symbol: string; type: string } | null>(null)
  const [advancedChartSymbol, setAdvancedChartSymbol] = useState('NASDAQ:AAPL')
  const [chartSearchDraft, setChartSearchDraft] = useState('AAPL')
  const { items: watchlistItems, addItem, removeItem, isInWatchlist } = useWatchlist()

  const advancedChartLookup = useCallback(
    (upper: string): ChartSymbolLookup | undefined => {
      const fromWatch = watchlistItems.find(w => w.symbol.toUpperCase() === upper)
      if (fromWatch) return { symbol: fromWatch.symbol, type: fromWatch.type }
      const row = SYMBOL_INDEX_LIST.find(i => i.symbol.toUpperCase() === upper)
      if (row) return { symbol: row.symbol, type: row.type }
      return undefined
    },
    [watchlistItems],
  )

  const applyAdvancedChartSymbol = useCallback(() => {
    setAdvancedChartSymbol(resolveChartSymbolInput(chartSearchDraft, advancedChartLookup))
  }, [chartSearchDraft, advancedChartLookup])

  const filteredItems = useMemo(() => {
    let items: MarketItem[] = tab === 'crypto' ? CRYPTO : STOCKS
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      items = items.filter(i => i.symbol.toLowerCase().includes(q) || i.name.toLowerCase().includes(q))
    }
    return items
  }, [tab, searchQuery])

  const toggleWatchlist = (item: MarketItem) => {
    if (isInWatchlist(item.symbol)) {
      removeItem(item.symbol)
    } else {
      addItem({ symbol: item.symbol, name: item.name, type: item.type, addedAt: new Date().toISOString() })
    }
  }

  const openChart = (symbol: string, type: string) => {
    setChartSymbol({ symbol: getTradingViewSymbol(symbol, type), type })
  }

  const renderMarketList = (items: MarketItem[], showWatchlistBtn = true) => (
    <div className="market-list">
      {items.map(item => {
        const pos = item.change >= 0
        return (
          <div key={item.symbol} className="market-item" onClick={() => openChart(item.symbol, item.type)}>
            <AssetLogo symbol={item.symbol} name={item.name} type={item.type} size={38} borderRadius={10} />
            <div className="market-item__left">
              <div className="market-item__symbol">{item.symbol}</div>
              <div className="market-item__name">{item.name}</div>
            </div>
            <div className="market-item__right">
              <div className="market-item__price">${item.price.toLocaleString()}</div>
              <div className={`market-item__change ${pos ? 'market-item__change--up' : 'market-item__change--down'}`}>
                {pos ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                {pos ? '+' : ''}{item.changePct.toFixed(2)}%
              </div>
            </div>
            {showWatchlistBtn && (
              <button
                className="market-item__star"
                onClick={e => { e.stopPropagation(); toggleWatchlist(item) }}
                title={isInWatchlist(item.symbol) ? 'Remove from watchlist' : 'Add to watchlist'}
              >
                {isInWatchlist(item.symbol)
                  ? <Star size={16} fill="var(--status-warning)" stroke="var(--status-warning)" />
                  : <Star size={16} />
                }
              </button>
            )}
          </div>
        )
      })}
    </div>
  )

  return (
    <div className={`markets ${tab === 'chart' ? 'markets--chart-tab' : ''}`}>
      {/* Background image */}
      <div className="markets-bg">
        <img src={MARKETS_BG} alt="" className="markets-bg__img" />
        <div className="markets-bg__overlay" />
      </div>

      <div className="markets-body">
      <div className="markets-header">
        <h1 className="markets-title">Markets</h1>
        {tab !== 'chart' && (
          <GlassTextField
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search markets..."
            prefixIcon={<Search size={16} />}
          />
        )}
      </div>

      <div className="markets-tabs">
        {[
          { id: 'dashboard' as TabId, label: 'Dashboard' },
          { id: 'chart' as TabId, label: 'Advanced chart' },
          { id: 'watchlist' as TabId, label: `Watchlist (${watchlistItems.length})` },
          { id: 'crypto' as TabId, label: 'Crypto' },
          { id: 'heatmaps' as TabId, label: 'Heatmaps' },
          { id: 'screener' as TabId, label: 'Screener' },
          { id: 'news' as TabId, label: 'News' },
        ].map(t => (
          <button key={t.id} className={`markets-tab ${tab === t.id ? 'markets-tab--active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'dashboard' && (
        <MarketsDashboard
          indices={INDICES}
          stockItems={filteredItems}
          isInWatchlist={isInWatchlist}
          toggleWatchlist={toggleWatchlist}
          openChart={openChart}
        />
      )}

      {tab === 'chart' && (
        <div className="markets-section markets-section--advanced-chart">
          <h2 className="section-title">Advanced chart</h2>
          <p className="markets-tools-intro">
            Full TradingView chart with indicators. Enter a ticker (e.g. AAPL, MSFT), crypto (BTC, ETH), an exchange pair (BINANCE:BTCUSDT), or any TradingView symbol format.
          </p>
          <div className="markets-chart-toolbar">
            <GlassTextField
              value={chartSearchDraft}
              onChange={setChartSearchDraft}
              placeholder="Symbol or pair…"
              prefixIcon={<Search size={14} />}
              onKeyDown={e => {
                if (e.key === 'Enter') applyAdvancedChartSymbol()
              }}
            />
            <GlassIconButton
              icon={<LineChart size={18} strokeWidth={2} />}
              onClick={applyAdvancedChartSymbol}
              size={40}
              title="Load chart"
              className="markets-chart-toolbar__load"
            />
          </div>
          <TradingViewChart
            key={advancedChartSymbol}
            symbol={advancedChartSymbol}
            variant="embedded"
          />
        </div>
      )}

      {tab === 'watchlist' && (
        <div className="markets-section">
          {watchlistItems.length === 0 ? (
            <GlassContainer padding="40px" className="market-empty">
              <Star size={40} style={{ color: 'var(--text-tertiary)', marginBottom: 12 }} />
              <p style={{ color: 'var(--text-secondary)', fontSize: 15, marginBottom: 4 }}>No watchlist items</p>
              <p style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>Star assets from the Dashboard or Crypto tab to add them here</p>
            </GlassContainer>
          ) : (
            renderMarketList(
              watchlistItems.map(wi => {
                const found = ALL_ITEMS.find(i => i.symbol === wi.symbol)
                return found || { symbol: wi.symbol, name: wi.name, price: 0, change: 0, changePct: 0, type: wi.type }
              }),
              true
            )
          )}
        </div>
      )}

      {tab === 'crypto' && (
        <div className="markets-section">
          <h2 className="section-title">Cryptocurrency</h2>
          {renderMarketList(filteredItems)}
        </div>
      )}

      {tab === 'heatmaps' && (
        <div className="markets-section markets-tradingview-tools">
          <h2 className="section-title">Market heatmaps</h2>
          <p className="markets-tools-intro">
            Sector and asset-class views powered by TradingView. Use the widget toolbar to change dataset or grouping.
          </p>
          <div className="markets-subtabs" role="tablist" aria-label="Heatmap type">
            {HEATMAP_TAB_ROWS.map(row => (
              <button
                key={row.id}
                type="button"
                role="tab"
                aria-selected={heatmapKind === row.id}
                className={`markets-subtab ${heatmapKind === row.id ? 'markets-subtab--active' : ''}`}
                onClick={() => setHeatmapKind(row.id)}
              >
                {row.label}
              </button>
            ))}
          </div>
          <GlassContainer padding="0" borderRadius={16} className="markets-tv-embed-wrap">
            <HeatmapWidget key={heatmapKind} kind={heatmapKind} height={TV_EMBED_HEIGHT} />
          </GlassContainer>
        </div>
      )}

      {tab === 'screener' && (
        <div className="markets-section markets-tradingview-tools">
          <h2 className="section-title">Screener</h2>
          <p className="markets-tools-intro">
            Filter symbols by performance and fundamentals. Switch market below; refine columns in the TradingView toolbar.
          </p>
          <div className="markets-subtabs" role="tablist" aria-label="Screener market">
            {SCREENER_TAB_ROWS.map(row => (
              <button
                key={row.id}
                type="button"
                role="tab"
                aria-selected={screenerMarket === row.id}
                className={`markets-subtab ${screenerMarket === row.id ? 'markets-subtab--active' : ''}`}
                onClick={() => setScreenerMarket(row.id)}
              >
                {row.label}
              </button>
            ))}
          </div>
          <GlassContainer padding="0" borderRadius={16} className="markets-tv-embed-wrap">
            <ScreenerWidget key={screenerMarket} market={screenerMarket} height={TV_EMBED_HEIGHT} />
          </GlassContainer>
        </div>
      )}

      {tab === 'news' && (
        <div className="markets-section">
          <h2 className="section-title">Market News</h2>
          <GlassContainer padding="0" borderRadius={16} className="markets-news-widget">
            <TimelineWidget height={550} />
          </GlassContainer>
        </div>
      )}

      {/* Full-screen TradingView Chart */}
      {chartSymbol && (
        <TradingViewChart
          symbol={chartSymbol.symbol}
          onClose={() => setChartSymbol(null)}
        />
      )}
      </div>{/* end markets-body */}
    </div>
  )
}

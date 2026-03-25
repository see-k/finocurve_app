import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  GripVertical,
  Plus,
  RotateCcw,
  X,
  Star,
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  TrendingDown,
} from 'lucide-react'
import GridLayout, { WidthProvider, type Layout } from 'react-grid-layout/legacy'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import GlassContainer from '../../components/glass/GlassContainer'
import AssetLogo from '../../components/AssetLogo'
import TradingViewEconomicMap from '../../components/TradingViewEconomicMap'
import {
  EventsWidget,
  ForexCrossRatesWidget,
  HeatmapWidget,
  HotlistsWidget,
  ScreenerWidget,
  TickerTapeWidget,
  TimelineWidget,
} from '../../components/TradingViewWidgets'
import {
  DASHBOARD_WIDGET_CATALOG,
  useMarketsDashboard,
  type DashboardInstance,
  type DashboardWidgetType,
} from '../../store/useMarketsDashboard'
import './MarketsDashboard.css'

export interface MarketRow {
  symbol: string
  name: string
  price: number
  change: number
  changePct: number
  type: string
}

interface MarketsDashboardProps {
  indices: MarketRow[]
  stockItems: MarketRow[]
  isInWatchlist: (symbol: string) => boolean
  toggleWatchlist: (item: MarketRow) => void
  openChart: (symbol: string, type: string) => void
}

const GRID_ROW_HEIGHT = 34
const GRID_MARGIN: [number, number] = [10, 10]

/** Persisted: widget library open (default true) vs hidden */
const ADD_WIDGET_PALETTE_KEY = 'finocurve-markets-add-widget-palette-open'

function readAddWidgetPaletteOpen(): boolean {
  try {
    const v = localStorage.getItem(ADD_WIDGET_PALETTE_KEY)
    if (v === null) return true
    return v !== '0' && v !== 'false'
  } catch {
    return true
  }
}

function writeAddWidgetPaletteOpen(open: boolean) {
  try {
    localStorage.setItem(ADD_WIDGET_PALETTE_KEY, open ? '1' : '0')
  } catch { /* ignore */ }
}

function catalogLabel(type: DashboardWidgetType): string {
  return DASHBOARD_WIDGET_CATALOG.find(e => e.type === type)?.label ?? type
}

function DashboardTvSlot({ children }: { children: (pxHeight: number) => ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [h, setH] = useState(320)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const next = Math.floor(el.getBoundingClientRect().height)
      if (next > 80) setH(next)
    })
    ro.observe(el)
    const next = Math.floor(el.getBoundingClientRect().height)
    if (next > 80) setH(next)
    return () => ro.disconnect()
  }, [])

  return (
    <div ref={ref} className="markets-dash-tv-slot">
      {children(h)}
    </div>
  )
}

const GridWithWidth = WidthProvider(GridLayout)

export default function MarketsDashboard({
  indices,
  stockItems,
  isInWatchlist,
  toggleWatchlist,
  openChart,
}: MarketsDashboardProps) {
  const {
    layout,
    instances,
    addWidget,
    removeWidget,
    resetDashboard,
    onLayoutChange,
  } = useMarketsDashboard()

  const [paletteOpen, setPaletteOpen] = useState(() => readAddWidgetPaletteOpen())

  useEffect(() => {
    writeAddWidgetPaletteOpen(paletteOpen)
  }, [paletteOpen])

  const handleLayoutChange = useCallback(
    (next: Layout) => {
      onLayoutChange(next)
    },
    [onLayoutChange],
  )

  const renderStockRows = (items: MarketRow[]) => (
    <div className="market-list markets-dash-stock-list">
      {items.map(item => {
        const pos = item.change >= 0
        return (
          <div
            key={item.symbol}
            className="market-item"
            onClick={() => openChart(item.symbol, item.type)}
          >
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
            <button
              className="market-item__star"
              onClick={e => {
                e.stopPropagation()
                toggleWatchlist(item)
              }}
              title={isInWatchlist(item.symbol) ? 'Remove from watchlist' : 'Add to watchlist'}
            >
              {isInWatchlist(item.symbol)
                ? <Star size={16} fill="var(--status-warning)" stroke="var(--status-warning)" />
                : <Star size={16} />}
            </button>
          </div>
        )
      })}
    </div>
  )

  const renderWidgetBody = (inst: DashboardInstance) => {
    switch (inst.type) {
      case 'indices':
        return (
          <div className="indices-grid markets-dash-indices">
            {indices.map(idx => {
              const pos = idx.change >= 0
              return (
                <GlassContainer key={idx.symbol} padding="16px" borderRadius={14} className="index-card">
                  <div className="index-card__name">{idx.name}</div>
                  <div className="index-card__price">{idx.price.toLocaleString()}</div>
                  <div className={`index-card__change ${pos ? 'index-card__change--up' : 'index-card__change--down'}`}>
                    {pos ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                    {pos ? '+' : ''}{idx.changePct.toFixed(2)}%
                  </div>
                </GlassContainer>
              )
            })}
          </div>
        )
      case 'hotlists':
        return (
          <DashboardTvSlot>
            {h => <HotlistsWidget height={h} className="markets-dash-tv-inner" />}
          </DashboardTvSlot>
        )
      case 'stocks':
        return <div className="markets-dash-stocks-scroll">{renderStockRows(stockItems)}</div>
      case 'ticker_tape':
        return (
          <DashboardTvSlot>
            {h => <TickerTapeWidget height={Math.max(42, h)} className="markets-dash-tv-inner" />}
          </DashboardTvSlot>
        )
      case 'market_news':
        return (
          <DashboardTvSlot>
            {h => <TimelineWidget height={h} className="markets-dash-tv-inner" />}
          </DashboardTvSlot>
        )
      case 'economic_calendar':
        return (
          <DashboardTvSlot>
            {h => <EventsWidget height={h} className="markets-dash-tv-inner" />}
          </DashboardTvSlot>
        )
      case 'economic_map':
        return <TradingViewEconomicMap className="markets-dash-economic-map" />
      case 'heatmap_stock':
        return (
          <DashboardTvSlot>
            {h => <HeatmapWidget kind="stock" height={h} className="markets-dash-tv-inner" />}
          </DashboardTvSlot>
        )
      case 'heatmap_crypto':
        return (
          <DashboardTvSlot>
            {h => <HeatmapWidget kind="crypto" height={h} className="markets-dash-tv-inner" />}
          </DashboardTvSlot>
        )
      case 'heatmap_forex':
        return (
          <DashboardTvSlot>
            {h => <HeatmapWidget kind="forex" height={h} className="markets-dash-tv-inner" />}
          </DashboardTvSlot>
        )
      case 'heatmap_etf':
        return (
          <DashboardTvSlot>
            {h => <HeatmapWidget kind="etf" height={h} className="markets-dash-tv-inner" />}
          </DashboardTvSlot>
        )
      case 'screener_us':
        return (
          <DashboardTvSlot>
            {h => <ScreenerWidget market="us" height={h} className="markets-dash-tv-inner" />}
          </DashboardTvSlot>
        )
      case 'screener_forex':
        return (
          <DashboardTvSlot>
            {h => <ScreenerWidget market="forex" height={h} className="markets-dash-tv-inner" />}
          </DashboardTvSlot>
        )
      case 'screener_crypto':
        return (
          <DashboardTvSlot>
            {h => <ScreenerWidget market="crypto_mkt" height={h} className="markets-dash-tv-inner" />}
          </DashboardTvSlot>
        )
      case 'forex_cross_rates':
        return (
          <DashboardTvSlot>
            {h => <ForexCrossRatesWidget height={h} className="markets-dash-tv-inner" />}
          </DashboardTvSlot>
        )
      default:
        return null
    }
  }

  return (
    <div className="markets-dashboard">
      <div className="markets-dashboard__toolbar">
        <p className="markets-dashboard__hint">
          Drag tiles by the handle, resize from corners and edges. Use Add widget to show or hide the library — your choice is remembered.
        </p>
        <div className="markets-dashboard__actions">
          <button
            type="button"
            className={`markets-dashboard__btn markets-dashboard__btn--primary ${paletteOpen ? 'markets-dashboard__btn--toggled' : ''}`}
            onClick={() => setPaletteOpen(o => !o)}
            aria-expanded={paletteOpen}
            aria-controls="markets-widget-library"
            id="markets-add-widget-toggle"
          >
            <Plus size={16} />
            {paletteOpen ? 'Hide widget library' : 'Add widget'}
          </button>
          <button
            type="button"
            className="markets-dashboard__btn"
            onClick={() => {
              resetDashboard()
            }}
          >
            <RotateCcw size={16} />
            Reset layout
          </button>
        </div>
      </div>

      {paletteOpen && (
        <div
          id="markets-widget-library"
          role="region"
          aria-labelledby="markets-add-widget-toggle"
        >
          <GlassContainer padding="16px" borderRadius={14} className="markets-dashboard__palette">
            <div className="markets-dashboard__palette-title">Widget library</div>
            <div className="markets-dashboard__palette-grid">
              {DASHBOARD_WIDGET_CATALOG.map(entry => (
                <button
                  key={entry.type}
                  type="button"
                  className="markets-dashboard__palette-item"
                  onClick={() => {
                    addWidget(entry.type)
                  }}
                >
                  <span className="markets-dashboard__palette-item-label">{entry.label}</span>
                  <span className="markets-dashboard__palette-item-desc">{entry.description}</span>
                </button>
              ))}
            </div>
          </GlassContainer>
        </div>
      )}

      <div className="markets-dashboard__grid-outer">
        <GridWithWidth
          className="markets-dashboard__grid"
          cols={12}
          rowHeight={GRID_ROW_HEIGHT}
          margin={GRID_MARGIN}
          layout={layout}
          onLayoutChange={handleLayoutChange}
          draggableHandle=".markets-dash-tile__drag"
          compactType="vertical"
          isBounded={false}
        >
          {instances.map(inst => (
            <div key={inst.id} className="markets-dash-tile-wrap">
              <GlassContainer
                padding="0"
                borderRadius={14}
                className="markets-dash-tile"
                style={{ height: '100%' }}
              >
                <div className="markets-dash-tile__head">
                  <span className="markets-dash-tile__drag" title="Drag to move">
                    <GripVertical size={16} aria-hidden />
                    {catalogLabel(inst.type)}
                  </span>
                  <button
                    type="button"
                    className="markets-dash-tile__remove"
                    onClick={() => removeWidget(inst.id)}
                    title="Remove widget"
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="markets-dash-tile__body">{renderWidgetBody(inst)}</div>
              </GlassContainer>
            </div>
          ))}
        </GridWithWidth>
      </div>
    </div>
  )
}

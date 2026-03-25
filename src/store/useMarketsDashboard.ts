import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Layout } from 'react-grid-layout'

const STORAGE_KEY = 'finocurve-markets-dashboard-v1'

export type DashboardWidgetType =
  | 'indices'
  | 'hotlists'
  | 'stocks'
  | 'market_news'
  | 'economic_calendar'
  | 'economic_map'
  | 'heatmap_stock'
  | 'heatmap_crypto'
  | 'heatmap_forex'
  | 'heatmap_etf'
  | 'screener_us'
  | 'screener_forex'
  | 'screener_crypto'
  | 'ticker_tape'
  | 'forex_cross_rates'

export interface DashboardInstance {
  id: string
  type: DashboardWidgetType
}

export interface DashboardWidgetCatalogEntry {
  type: DashboardWidgetType
  label: string
  description: string
  defaultW: number
  defaultH: number
  minW?: number
  minH?: number
}

export const DASHBOARD_WIDGET_CATALOG: DashboardWidgetCatalogEntry[] = [
  { type: 'indices', label: 'Indices', description: 'Major index levels', defaultW: 12, defaultH: 3, minW: 4, minH: 2 },
  { type: 'hotlists', label: 'Market movers', description: 'TradingView US hotlists', defaultW: 7, defaultH: 14, minW: 4, minH: 8 },
  { type: 'stocks', label: 'Stock list', description: 'Sample equities with chart on click', defaultW: 5, defaultH: 14, minW: 3, minH: 8 },
  { type: 'ticker_tape', label: 'Ticker tape', description: 'Scrolling symbols strip', defaultW: 12, defaultH: 2, minW: 6, minH: 2 },
  { type: 'market_news', label: 'Market news', description: 'TradingView timeline', defaultW: 6, defaultH: 12, minW: 4, minH: 8 },
  { type: 'economic_calendar', label: 'Economic calendar', description: 'Events & releases (TradingView)', defaultW: 6, defaultH: 12, minW: 4, minH: 8 },
  { type: 'economic_map', label: 'Economic map', description: 'Global macro map (TradingView)', defaultW: 12, defaultH: 16, minW: 6, minH: 10 },
  { type: 'heatmap_stock', label: 'Heatmap — Stocks', description: 'S&P 500 sector heatmap', defaultW: 12, defaultH: 16, minW: 4, minH: 10 },
  { type: 'heatmap_crypto', label: 'Heatmap · Crypto', description: 'Crypto coins heatmap', defaultW: 6, defaultH: 14, minW: 4, minH: 10 },
  { type: 'heatmap_forex', label: 'Heatmap · Forex', description: 'Currencies heat map', defaultW: 6, defaultH: 12, minW: 4, minH: 8 },
  { type: 'heatmap_etf', label: 'Heatmap · ETF', description: 'US ETF heatmap', defaultW: 6, defaultH: 14, minW: 4, minH: 10 },
  { type: 'screener_us', label: 'Screener · US', description: 'US stock screener', defaultW: 12, defaultH: 16, minW: 6, minH: 10 },
  { type: 'screener_forex', label: 'Screener · Forex', description: 'Forex screener', defaultW: 12, defaultH: 16, minW: 6, minH: 10 },
  { type: 'screener_crypto', label: 'Screener · Crypto', description: 'Crypto market screener', defaultW: 12, defaultH: 16, minW: 6, minH: 10 },
  { type: 'forex_cross_rates', label: 'Forex cross rates', description: 'Major FX matrix', defaultW: 6, defaultH: 10, minW: 4, minH: 6 },
]

/** Market movers + stock list, full-width stock heatmap at the bottom (no ticker in default). */
const DEFAULT_INSTANCES: DashboardInstance[] = [
  { id: 'w-hotlists', type: 'hotlists' },
  { id: 'w-stocks', type: 'stocks' },
  { id: 'w-heatmap-stock', type: 'heatmap_stock' },
]

const DEFAULT_LAYOUT: Layout = [
  { i: 'w-hotlists', x: 0, y: 0, w: 7, h: 14, minW: 4, minH: 8 },
  { i: 'w-stocks', x: 7, y: 0, w: 5, h: 14, minW: 3, minH: 8 },
  { i: 'w-heatmap-stock', x: 0, y: 14, w: 12, h: 17, minW: 6, minH: 10 },
]

interface StoredDashboard {
  layout: Layout
  instances: DashboardInstance[]
}

function catalogEntry(type: DashboardWidgetType): DashboardWidgetCatalogEntry {
  const e = DASHBOARD_WIDGET_CATALOG.find(c => c.type === type)
  if (!e) throw new Error(`Unknown widget type: ${type}`)
  return e
}

function sanitize(stored: StoredDashboard): StoredDashboard {
  const ids = new Set(stored.instances.map(i => i.id))
  const layout = stored.layout.filter(item => ids.has(item.i))
  const layoutIds = new Set(layout.map(l => l.i))
  const instances = stored.instances.filter(i => layoutIds.has(i.id))
  if (instances.length === 0 || layout.length === 0) {
    return {
      layout: DEFAULT_LAYOUT.map(item => ({ ...item })),
      instances: DEFAULT_INSTANCES.map(i => ({ ...i })),
    }
  }
  return { layout, instances }
}

/** Legacy saves: swap indices tile for stock heatmap and park it on the bottom row. */
function migrateIndicesToStockHeatmapBottom(stored: StoredDashboard): StoredDashboard {
  const idxInst = stored.instances.find(i => i.type === 'indices')
  if (!idxInst) return stored

  const idxLayoutItem = stored.layout.find(l => l.i === idxInst.id)
  if (!idxLayoutItem) return stored

  const top = idxLayoutItem.y
  const dropH = idxLayoutItem.h

  const withoutIdx = stored.layout.filter(l => l.i !== idxInst.id)
  const shifted = withoutIdx.map(l => ({
    ...l,
    y: l.y >= top + dropH ? l.y - dropH : l.y,
  }))

  let maxBottom = 0
  for (const l of shifted) {
    const b = l.y + l.h
    if (b > maxBottom) maxBottom = b
  }

  const newLayout = [
    ...shifted,
    {
      i: idxInst.id,
      x: 0,
      y: maxBottom,
      w: 12,
      h: 17,
      minW: 6,
      minH: 10,
    },
  ]

  const newInstances = stored.instances.map(i =>
    i.id === idxInst.id ? { ...i, type: 'heatmap_stock' as const } : i,
  )

  return { layout: newLayout, instances: newInstances }
}

function load(): StoredDashboard {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as StoredDashboard
      if (Array.isArray(parsed.layout) && Array.isArray(parsed.instances)) {
        return sanitize(migrateIndicesToStockHeatmapBottom(parsed))
      }
    }
  } catch { /* ignore */ }
  return {
    layout: DEFAULT_LAYOUT.map(item => ({ ...item })),
    instances: DEFAULT_INSTANCES.map(i => ({ ...i })),
  }
}

function save(state: StoredDashboard) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch { /* ignore */ }
}

function newId(): string {
  return `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export function useMarketsDashboard() {
  const initial = load()
  const [layout, setLayout] = useState<Layout>(() => initial.layout)
  const [instances, setInstances] = useState<DashboardInstance[]>(() => initial.instances)

  useEffect(() => {
    save({ layout, instances })
  }, [layout, instances])

  const instanceById = useMemo(() => {
    const m = new Map<string, DashboardInstance>()
    for (const inst of instances) m.set(inst.id, inst)
    return m
  }, [instances])

  const addWidget = useCallback((type: DashboardWidgetType) => {
    const meta = catalogEntry(type)
    const id = newId()
    setInstances(prev => [...prev, { id, type }])
    setLayout(prev => {
      let maxY = 0
      for (const it of prev) {
        const bottom = it.y + it.h
        if (bottom > maxY) maxY = bottom
      }
      return [
        ...prev,
        {
          i: id,
          x: 0,
          y: maxY,
          w: meta.defaultW,
          h: meta.defaultH,
          minW: meta.minW,
          minH: meta.minH,
        },
      ]
    })
  }, [])

  const removeWidget = useCallback((id: string) => {
    setInstances(prev => prev.filter(w => w.id !== id))
    setLayout(prev => prev.filter(item => item.i !== id))
  }, [])

  const resetDashboard = useCallback(() => {
    setLayout(DEFAULT_LAYOUT.map(item => ({ ...item })))
    setInstances(DEFAULT_INSTANCES.map(i => ({ ...i })))
    try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
  }, [])

  const onLayoutChange = useCallback((next: Layout) => {
    setLayout(next.map(item => ({ ...item })))
  }, [])

  return {
    layout,
    instances,
    instanceById,
    addWidget,
    removeWidget,
    resetDashboard,
    onLayoutChange,
  }
}

/**
 * Performance chart data logic for finance apps.
 *
 * Two series can back a value-over-time chart, and the client chooses which:
 *   1) market data reconstructed from historical closes
 *   2) portfolio marks this app recorded on the days it was opened
 *
 * There is deliberately no third "flat line at today's total" fallback. Drawing a
 * horizontal line across a date axis asserts that the portfolio held that value
 * on those dates, which is not something this app knows. When neither real
 * series is available the chart reports itself unavailable and the caller shows
 * something backed by data instead.
 */
import type { PerformancePeriod } from '../types'
import type { PortfolioValuePoint } from '../store/usePortfolioValueHistory'

export interface ChartDataPoint {
  date: string
  dateLabel: string
  value: number
}

/** Identifies which observed series produced the displayed points. */
export type PerformanceDataSourceId = 'market' | 'snapshots'

/** What the client asked for. `auto` follows the built-in priority order. */
export type PerformanceSourcePreference = 'auto' | PerformanceDataSourceId

export interface PerformanceSourceOption {
  id: PerformanceDataSourceId
  /** Full name, used in menus. */
  label: string
  /** Abbreviated name, used in the collapsed control. */
  shortLabel: string
  /** One line explaining where the numbers come from. */
  description: string
  /** Whether this source can render the chart right now. */
  available: boolean
  /** Observations this source contributes for the selected period. */
  pointCount: number
  /** Present when `available` is false — why it cannot be shown. */
  unavailableReason?: string
}

export interface PerformanceChartResult {
  data: ChartDataPoint[]
  /** False when no observed series is available; `data` is then empty. */
  hasRealData: boolean
  /** The source actually plotted, or null when none is available. */
  dataSource: PerformanceDataSourceId | null
  /** The preference that was requested. */
  requestedSource: PerformanceSourcePreference
  /** True when `requestedSource` was pinned but unavailable and another was used. */
  fellBack: boolean
  /** Every source, in menu order, with availability metadata. */
  sources: PerformanceSourceOption[]
}

/** Minimum observations before a source can draw a line rather than a point. */
const MIN_POINTS = 2

const MS_PER = {
  '1D': 24 * 60 * 60 * 1000,
  '1W': 7 * 24 * 60 * 60 * 1000,
  '1M': 30 * 24 * 60 * 60 * 1000,
  '1Y': 365 * 24 * 60 * 60 * 1000,
}

export const PERFORMANCE_SOURCE_ORDER: PerformanceDataSourceId[] = ['market', 'snapshots']

const SOURCE_COPY: Record<PerformanceDataSourceId, Pick<PerformanceSourceOption, 'label' | 'shortLabel' | 'description'>> = {
  market: {
    label: 'Market data',
    shortLabel: 'Market',
    description: 'Historical closes for your listed holdings, valued at your current quantities.',
  },
  snapshots: {
    label: 'Account snapshots',
    shortLabel: 'Snapshots',
    description: 'Portfolio marks this app recorded on the days you opened it, including private holdings.',
  },
}

function formatDateLabel(timestamp: string, period: PerformancePeriod): string {
  const d = new Date(timestamp)
  if (period === '1D') return d.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true })
  if (period === '1W' || period === '1M') return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

function buildMarketSeries(
  historicalApiData: { date: string; value: number }[] | undefined,
  period: PerformancePeriod
): ChartDataPoint[] {
  if (!historicalApiData) return []
  return historicalApiData.map((p) => ({
    date: p.date,
    dateLabel: formatDateLabel(p.date, period),
    value: p.value,
  }))
}

function buildSnapshotSeries(
  history: PortfolioValuePoint[],
  period: PerformancePeriod,
  now: number
): ChartDataPoint[] {
  const cutoff = now - MS_PER[period]
  return history
    .filter((p) => new Date(p.timestamp).getTime() >= cutoff)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    .map((p) => ({
      date: p.timestamp,
      dateLabel: formatDateLabel(p.timestamp, period),
      value: p.value,
    }))
}

function unavailableReason(
  id: PerformanceDataSourceId,
  pointCount: number,
  period: PerformancePeriod
): string {
  if (id === 'market') {
    return pointCount === 0
      ? 'No listed holdings with price history. Add a stock, ETF or crypto position with a ticker symbol.'
      : `Only ${pointCount} close available over ${period}. At least ${MIN_POINTS} are needed to plot a line.`
  }
  return pointCount === 0
    ? `No portfolio marks recorded in the last ${period}. Snapshots accumulate as you open the app.`
    : `Only ${pointCount} mark recorded over ${period}. At least ${MIN_POINTS} are needed to plot a line.`
}

/**
 * Builds the value-over-time series for the selected period.
 *
 * @param preference Which source the client pinned. Defaults to `auto`.
 */
export function getPerformanceChartData(
  history: PortfolioValuePoint[],
  period: PerformancePeriod,
  historicalApiData?: { date: string; value: number }[],
  preference: PerformanceSourcePreference = 'auto',
  now: number = Date.now()
): PerformanceChartResult {
  const series: Record<PerformanceDataSourceId, ChartDataPoint[]> = {
    market: buildMarketSeries(historicalApiData, period),
    snapshots: buildSnapshotSeries(history, period, now),
  }

  const sources: PerformanceSourceOption[] = PERFORMANCE_SOURCE_ORDER.map((id) => {
    const pointCount = series[id].length
    const available = pointCount >= MIN_POINTS
    return {
      id,
      ...SOURCE_COPY[id],
      available,
      pointCount,
      unavailableReason: available ? undefined : unavailableReason(id, pointCount, period),
    }
  })

  const isAvailable = (id: PerformanceDataSourceId) => sources.find((s) => s.id === id)?.available ?? false

  const pinnedIsUsable = preference !== 'auto' && isAvailable(preference)
  const resolved: PerformanceDataSourceId | null = pinnedIsUsable
    ? (preference as PerformanceDataSourceId)
    : (PERFORMANCE_SOURCE_ORDER.find(isAvailable) ?? null)

  return {
    data: resolved ? series[resolved] : [],
    hasRealData: resolved !== null,
    dataSource: resolved,
    requestedSource: preference,
    fellBack: preference !== 'auto' && !pinnedIsUsable && resolved !== null,
    sources,
  }
}

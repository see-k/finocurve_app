/**
 * Performance chart data logic for finance apps.
 * Priority: 1) Live/historical API data 2) Portfolio value history 3) Flat line.
 */
import type { PerformancePeriod } from '../types'
import type { PortfolioValuePoint } from '../store/usePortfolioValueHistory'

export interface ChartDataPoint {
  date: string
  dateLabel: string
  value: number
}

const MS_PER = {
  '1D': 24 * 60 * 60 * 1000,
  '1W': 7 * 24 * 60 * 60 * 1000,
  '1M': 30 * 24 * 60 * 60 * 1000,
  '1Y': 365 * 24 * 60 * 60 * 1000,
}

function formatDateLabel(timestamp: string, period: PerformancePeriod): string {
  const d = new Date(timestamp)
  if (period === '1D') return d.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true })
  if (period === '1W' || period === '1M') return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

export function getPerformanceChartData(
  history: PortfolioValuePoint[],
  currentValue: number,
  period: PerformancePeriod,
  historicalApiData?: { date: string; value: number }[]
): { data: ChartDataPoint[]; hasRealData: boolean; dataSource: 'api' | 'history' | 'none' } {
  // 1) Use live/historical API data when available (stocks, ETFs, crypto)
  if (historicalApiData && historicalApiData.length >= 2) {
    const data: ChartDataPoint[] = historicalApiData.map((p) => ({
      date: p.date,
      dateLabel: formatDateLabel(p.date, period),
      value: p.value,
    }))
    return { data, hasRealData: true, dataSource: 'api' }
  }

  // 2) Use portfolio value history (recorded when visiting app)
  const now = Date.now()
  const cutoff = now - MS_PER[period]

  const filtered = history
    .filter((p) => new Date(p.timestamp).getTime() >= cutoff)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

  if (filtered.length >= 2) {
    const data: ChartDataPoint[] = filtered.map((p) => ({
      date: p.timestamp,
      dateLabel: formatDateLabel(p.timestamp, period),
      value: p.value,
    }))
    return { data, hasRealData: true, dataSource: 'history' }
  }

  // 3) No real data: flat line at current value
  const startDate = new Date(now - MS_PER[period]).toISOString()
  const endDate = new Date(now).toISOString()
  const data: ChartDataPoint[] = [
    { date: startDate, dateLabel: formatDateLabel(startDate, period), value: currentValue },
    { date: endDate, dateLabel: formatDateLabel(endDate, period), value: currentValue },
  ]
  return { data, hasRealData: false, dataSource: 'none' }
}

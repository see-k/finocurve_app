import { describe, expect, it } from 'vitest'
import { getPerformanceChartData } from '../src/utils/performanceChartData'
import type { PortfolioValuePoint } from '../src/store/usePortfolioValueHistory'

const NOW = Date.parse('2026-09-10T17:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000

function snapshotsWithinMonth(count: number): PortfolioValuePoint[] {
  return Array.from({ length: count }, (_, i) => ({
    timestamp: new Date(NOW - (i + 1) * DAY).toISOString(),
    value: 150_000 + i * 100,
  }))
}

const marketCloses = [
  { date: new Date(NOW - 3 * DAY).toISOString(), value: 180_000 },
  { date: new Date(NOW - 2 * DAY).toISOString(), value: 184_000 },
  { date: new Date(NOW - DAY).toISOString(), value: 188_000 },
]

describe('getPerformanceChartData source selection', () => {
  it('prefers market data over snapshots in auto mode', () => {
    const result = getPerformanceChartData(snapshotsWithinMonth(5), '1M', marketCloses, 'auto', NOW)
    expect(result.dataSource).toBe('market')
    expect(result.data).toHaveLength(3)
    expect(result.hasRealData).toBe(true)
    expect(result.fellBack).toBe(false)
  })

  it('falls back to snapshots in auto mode when market data is absent', () => {
    const result = getPerformanceChartData(snapshotsWithinMonth(5), '1M', [], 'auto', NOW)
    expect(result.dataSource).toBe('snapshots')
    // fellBack describes a pinned source that could not be honoured, not auto priority.
    expect(result.fellBack).toBe(false)
  })

  it('honours a pinned source even when a higher-priority one exists', () => {
    const result = getPerformanceChartData(snapshotsWithinMonth(5), '1M', marketCloses, 'snapshots', NOW)
    expect(result.dataSource).toBe('snapshots')
    expect(result.requestedSource).toBe('snapshots')
    expect(result.fellBack).toBe(false)
  })

  it('reports a fallback when the pinned source has no usable data', () => {
    const result = getPerformanceChartData(snapshotsWithinMonth(5), '1M', [], 'market', NOW)
    expect(result.requestedSource).toBe('market')
    expect(result.dataSource).toBe('snapshots')
    expect(result.fellBack).toBe(true)
  })

  it('marks a source unavailable with a reason when it has a single observation', () => {
    const result = getPerformanceChartData(snapshotsWithinMonth(1), '1M', [], 'auto', NOW)
    const snapshots = result.sources.find((s) => s.id === 'snapshots')!
    expect(snapshots.available).toBe(false)
    expect(snapshots.pointCount).toBe(1)
    expect(snapshots.unavailableReason).toMatch(/at least 2/i)
  })

  it('excludes snapshots recorded outside the selected period', () => {
    const stale: PortfolioValuePoint[] = [
      { timestamp: new Date(NOW - 200 * DAY).toISOString(), value: 100_000 },
      { timestamp: new Date(NOW - 190 * DAY).toISOString(), value: 110_000 },
    ]
    const month = getPerformanceChartData(stale, '1M', [], 'auto', NOW)
    expect(month.sources.find((s) => s.id === 'snapshots')!.pointCount).toBe(0)
    expect(month.dataSource).toBeNull()

    const year = getPerformanceChartData(stale, '1Y', [], 'auto', NOW)
    expect(year.sources.find((s) => s.id === 'snapshots')!.pointCount).toBe(2)
    expect(year.dataSource).toBe('snapshots')
  })

  it('returns snapshots in chronological order', () => {
    const result = getPerformanceChartData(snapshotsWithinMonth(4), '1M', [], 'snapshots', NOW)
    const times = result.data.map((p) => Date.parse(p.date))
    expect(times).toEqual([...times].sort((a, b) => a - b))
  })
})

describe('getPerformanceChartData with no observed data', () => {
  it('reports no source rather than inventing a flat line', () => {
    const result = getPerformanceChartData([], '1M', [], 'auto', NOW)
    expect(result.dataSource).toBeNull()
    expect(result.hasRealData).toBe(false)
    // The regression this guards: a horizontal line asserting values on dates
    // the app never observed.
    expect(result.data).toEqual([])
  })

  it('offers no source that is available when neither has enough points', () => {
    const result = getPerformanceChartData([], '1M', [], 'auto', NOW)
    expect(result.sources).toHaveLength(2)
    expect(result.sources.every((s) => !s.available)).toBe(true)
    expect(result.sources.every((s) => !!s.unavailableReason)).toBe(true)
  })

  it('does not claim a fallback happened when nothing could be plotted', () => {
    const result = getPerformanceChartData([], '1M', [], 'market', NOW)
    expect(result.dataSource).toBeNull()
    expect(result.fellBack).toBe(false)
  })

  it('explains a missing market series in terms of ticker coverage', () => {
    const result = getPerformanceChartData([], '1M', [], 'auto', NOW)
    const market = result.sources.find((s) => s.id === 'market')!
    expect(market.unavailableReason).toMatch(/ticker symbol/i)
  })
})

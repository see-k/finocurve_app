import { describe, expect, it } from 'vitest'
import { getPerformanceChartData } from './performanceChartData'

describe('getPerformanceChartData', () => {
  const now = Date.now()

  it('prefers historical API data when at least two points exist', () => {
    const api = [
      { date: new Date(now - 3_600_000).toISOString(), value: 100 },
      { date: new Date(now).toISOString(), value: 110 },
    ]
    const history = [{ timestamp: new Date(now - 86_400_000).toISOString(), value: 90 }]

    const result = getPerformanceChartData(history, 110, '1D', api)

    expect(result.dataSource).toBe('api')
    expect(result.hasRealData).toBe(true)
    expect(result.data).toHaveLength(2)
    expect(result.data[1].value).toBe(110)
  })

  it('uses portfolio history inside the selected period when API data is unavailable', () => {
    const history = [
      { timestamp: new Date(now - 5 * 86_400_000).toISOString(), value: 95 },
      { timestamp: new Date(now - 2 * 86_400_000).toISOString(), value: 100 },
      { timestamp: new Date(now - 86_400_000).toISOString(), value: 105 },
    ]

    const result = getPerformanceChartData(history, 110, '1W')

    expect(result.dataSource).toBe('history')
    expect(result.hasRealData).toBe(true)
    expect(result.data.length).toBeGreaterThanOrEqual(2)
    expect(result.data.at(-1)?.value).toBe(105)
  })

  it('returns a flat line when no real data exists', () => {
    const result = getPerformanceChartData([], 250_000, '1M')

    expect(result.dataSource).toBe('none')
    expect(result.hasRealData).toBe(false)
    expect(result.data).toHaveLength(2)
    expect(result.data.every((point) => point.value === 250_000)).toBe(true)
  })

  it('ignores single-point API payloads and falls back to history or flat line', () => {
    const api = [{ date: new Date(now).toISOString(), value: 50 }]
    const history = [{ timestamp: new Date(now - 86_400_000).toISOString(), value: 40 }]

    const result = getPerformanceChartData(history, 55, '1W', api)

    expect(result.dataSource).toBe('none')
    expect(result.data).toHaveLength(2)
    expect(result.data[0].value).toBe(55)
  })
})

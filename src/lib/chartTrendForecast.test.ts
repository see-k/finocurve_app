import { describe, expect, it } from 'vitest'
import { augmentSeriesWithLinearTrend } from './chartTrendForecast'

type Point = { dateLabel: string; value: number }

describe('augmentSeriesWithLinearTrend', () => {
  it('returns null trends when fewer than minPoints observations', () => {
    const points: Point[] = [
      { dateLabel: 'Jan', value: 10 },
      { dateLabel: 'Feb', value: 20 },
    ]
    const result = augmentSeriesWithLinearTrend(points)
    expect(result).toHaveLength(2)
    expect(result.every((p) => p.histTrend === null && p.futTrend === null)).toBe(true)
    expect(result.every((p) => p.value !== null)).toBe(true)
  })

  it('fits a linear trend on historical rows and bridges futTrend at the last point', () => {
    const points: Point[] = [
      { dateLabel: 'Jan', value: 10 },
      { dateLabel: 'Feb', value: 20 },
      { dateLabel: 'Mar', value: 30 },
    ]
    const result = augmentSeriesWithLinearTrend(points, {
      forecastSteps: 2,
      valueClamp: [0, 100],
    })
    expect(result).toHaveLength(5)

    const hist = result.slice(0, 3)
    expect(hist[0].histTrend).toBeCloseTo(10, 5)
    expect(hist[1].histTrend).toBeCloseTo(20, 5)
    expect(hist[2].histTrend).toBeCloseTo(30, 5)
    expect(hist[0].futTrend).toBeNull()
    expect(hist[1].futTrend).toBeNull()
    expect(hist[2].futTrend).toBeCloseTo(30, 5)

    const proj = result.slice(3)
    expect(proj.every((p) => p.isProjection && p.value === null && p.histTrend === null)).toBe(true)
    expect(proj[0].futTrend).toBeCloseTo(40, 5)
    expect(proj[1].futTrend).toBeCloseTo(50, 5)
  })

  it('clamps extrapolated projection to padded historical bounds when valueClamp is unset', () => {
    const points: Point[] = [
      { dateLabel: 'Jan', value: 10 },
      { dateLabel: 'Feb', value: 20 },
      { dateLabel: 'Mar', value: 30 },
    ]
    const result = augmentSeriesWithLinearTrend(points, { forecastSteps: 2 })
    const proj = result.slice(3)
    // Raw extrapolation would reach 40/50, but padding caps hi at yMax + 35% span = 37
    expect(proj[0].futTrend).toBe(37)
    expect(proj[1].futTrend).toBe(37)
  })

  it('clamps trend and projection to valueClamp bounds (e.g. risk score 0–100)', () => {
    const points: Point[] = [
      { dateLabel: 'A', value: 80 },
      { dateLabel: 'B', value: 90 },
      { dateLabel: 'C', value: 95 },
    ]
    const result = augmentSeriesWithLinearTrend(points, {
      forecastSteps: 3,
      valueClamp: [0, 100],
    })
    const allTrends = result.map((p) => p.futTrend ?? p.histTrend).filter((v) => v !== null)
    expect(allTrends.every((v) => v >= 0 && v <= 100)).toBe(true)
    expect(result.at(-1)?.futTrend).toBe(100)
  })

  it('uses a flat trend for identical values without runaway extrapolation', () => {
    const points: Point[] = [
      { dateLabel: 'A', value: 50 },
      { dateLabel: 'B', value: 50 },
      { dateLabel: 'C', value: 50 },
    ]
    const result = augmentSeriesWithLinearTrend(points, { forecastSteps: 2 })
    const histTrends = result.slice(0, 3).map((p) => p.histTrend)
    expect(histTrends.every((t) => t === 50)).toBe(true)
    expect(result.slice(3).every((p) => p.futTrend === 50)).toBe(true)
  })

  it('uses custom forecastDateLabel for projection rows', () => {
    const points: Point[] = [
      { dateLabel: 'Q1', value: 100 },
      { dateLabel: 'Q2', value: 110 },
      { dateLabel: 'Q3', value: 120 },
    ]
    const result = augmentSeriesWithLinearTrend(points, {
      forecastSteps: 1,
      forecastDateLabel: (step) => `Proj ${step}`,
    })
    expect(result.at(-1)?.dateLabel).toBe('Proj 1')
  })
})

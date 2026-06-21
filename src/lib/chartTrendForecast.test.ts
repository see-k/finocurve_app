import { describe, expect, it } from 'vitest'
import { augmentSeriesWithLinearTrend } from './chartTrendForecast'

type Point = { dateLabel: string; value: number }

const rising: Point[] = [
  { dateLabel: 'Jan', value: 100 },
  { dateLabel: 'Feb', value: 110 },
  { dateLabel: 'Mar', value: 120 },
  { dateLabel: 'Apr', value: 130 },
]

describe('augmentSeriesWithLinearTrend', () => {
  it('returns null trends when there are fewer points than minPoints', () => {
    const out = augmentSeriesWithLinearTrend(
      [
        { dateLabel: 'A', value: 10 },
        { dateLabel: 'B', value: 20 },
      ],
      { minPoints: 3 },
    )
    expect(out).toHaveLength(2)
    expect(out.every((p) => p.histTrend === null && p.futTrend === null)).toBe(true)
  })

  it('fits a linear trend on historical rows and appends projection rows', () => {
    const out = augmentSeriesWithLinearTrend(rising, { forecastSteps: 2, minPoints: 3 })
    expect(out).toHaveLength(6)

    const hist = out.filter((p) => !p.isProjection)
    expect(hist).toHaveLength(4)
    expect(hist[0].histTrend).toBe(100)
    expect(hist[3].histTrend).toBe(130)
    expect(hist[3].futTrend).toBe(130)

    const proj = out.filter((p) => p.isProjection)
    expect(proj).toHaveLength(2)
    expect(proj[0].value).toBeNull()
    expect(proj[0].futTrend).toBeGreaterThan(130)
    expect(proj[1].futTrend).toBeGreaterThan(proj[0].futTrend!)
  })

  it('clamps trend and projection to valueClamp bounds (e.g. risk score 0–100)', () => {
    const steep: Point[] = [
      { dateLabel: 'W1', value: 80 },
      { dateLabel: 'W2', value: 90 },
      { dateLabel: 'W3', value: 95 },
    ]
    const out = augmentSeriesWithLinearTrend(steep, {
      forecastSteps: 3,
      valueClamp: [0, 100],
    })
    for (const row of out) {
      if (row.histTrend != null) expect(row.histTrend).toBeLessThanOrEqual(100)
      if (row.futTrend != null) expect(row.futTrend).toBeLessThanOrEqual(100)
    }
    const lastProj = out[out.length - 1]
    expect(lastProj.futTrend).toBe(100)
  })

  it('uses custom forecastDateLabel for projection rows', () => {
    const out = augmentSeriesWithLinearTrend(rising, {
      forecastSteps: 1,
      forecastDateLabel: (step) => `proj-${step}`,
    })
    const proj = out.find((p) => p.isProjection)
    expect(proj?.dateLabel).toBe('proj-1')
  })
})

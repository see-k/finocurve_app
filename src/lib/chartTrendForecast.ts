/**
 * Linear least-squares trend + forward projection for time-series charts.
 * For illustration only — not a forecast of future returns or net worth.
 */

export interface AugmentTrendOptions<T> {
  /** Points to append beyond the last observation (extrapolate the same slope). Default 4. */
  forecastSteps?: number
  /** Minimum rows required to fit a line; below this, trend/projection fields are null. Default 3. */
  minPoints?: number
  /** X-axis label for projection step (1-based). */
  forecastDateLabel?: (step: number, lastPoint: T) => string
  /**
   * Hard inclusive y bounds for trend + projection (e.g. [0, 100] for risk score).
   * When set, overrides extrapolation padding for clamping.
   */
  valueClamp?: [number, number]
  /**
   * Projection may extend at most this fraction of the historical value span beyond min/max.
   * Default 0.35. Prevents unbounded linear extrapolation from blowing up the chart scale.
   */
  extrapolationPaddingFraction?: number
}

export type TrendAugmentedPoint<T> = Omit<T, 'value'> & {
  value: number | null
  histTrend: number | null
  futTrend: number | null
  isProjection?: boolean
}

function linearRegression(xs: number[], ys: number[]): { a: number; b: number } {
  const n = xs.length
  if (n === 0) return { a: 0, b: 0 }
  if (n === 1) return { a: ys[0] ?? 0, b: 0 }
  let sumX = 0
  let sumY = 0
  let sumXY = 0
  let sumXX = 0
  for (let i = 0; i < n; i++) {
    sumX += xs[i]
    sumY += ys[i]
    sumXY += xs[i] * ys[i]
    sumXX += xs[i] * xs[i]
  }
  const denom = n * sumXX - sumX * sumX
  if (Math.abs(denom) < 1e-14) {
    return { a: sumY / n, b: 0 }
  }
  const b = (n * sumXY - sumX * sumY) / denom
  const a = (sumY - b * sumX) / n
  return { a, b }
}

function forecastYBounds(
  ys: number[],
  valueClamp: [number, number] | undefined,
  paddingFraction: number
): { lo: number; hi: number } {
  if (valueClamp) {
    return { lo: valueClamp[0], hi: valueClamp[1] }
  }
  const finite = ys.filter((y) => Number.isFinite(y))
  if (finite.length === 0) return { lo: 0, hi: 1 }
  const yMin = Math.min(...finite)
  const yMax = Math.max(...finite)
  let span = yMax - yMin
  if (!Number.isFinite(span) || span < 1e-12) {
    span = Math.max(Math.abs(yMin), Math.abs(yMax), 1) * 0.08
  }
  const pad = Math.max(span * paddingFraction, Math.max(Math.abs(yMin), Math.abs(yMax)) * 0.06, 1e-6)
  return { lo: yMin - pad, hi: yMax + pad }
}

/**
 * Fits y = a + b·i on observation index i, adds histTrend / futTrend series and optional projection rows.
 * Historical rows keep `value`; projection rows use `value: null` so area charts stop at the last real point.
 */
export function augmentSeriesWithLinearTrend<T extends { dateLabel: string; value: number }>(
  points: readonly T[],
  options?: AugmentTrendOptions<T>
): TrendAugmentedPoint<T>[] {
  const forecastSteps = options?.forecastSteps ?? 4
  const minPoints = options?.minPoints ?? 3
  const forecastDateLabel = options?.forecastDateLabel
  const paddingFraction = options?.extrapolationPaddingFraction ?? 0.35

  if (points.length < minPoints) {
    return points.map((p) => ({
      ...p,
      value: p.value,
      histTrend: null,
      futTrend: null,
    }))
  }

  const xs = points.map((_, i) => i)
  const ys = points.map((p) => p.value)
  const { a, b } = linearRegression(xs, ys)
  const n = points.length
  const { lo, hi } = forecastYBounds(ys, options?.valueClamp, paddingFraction)
  const clampY = (y: number) => Math.min(hi, Math.max(lo, y))

  const hist: TrendAugmentedPoint<T>[] = points.map((p, i) => {
    const rawTrend = a + b * i
    const trend = clampY(rawTrend)
    return {
      ...p,
      value: p.value,
      histTrend: trend,
      futTrend: i === n - 1 ? trend : null,
    }
  })

  const last = points[n - 1]
  const fut: TrendAugmentedPoint<T>[] = Array.from({ length: forecastSteps }, (_, j) => {
    const step = j + 1
    const i = n + j
    const label = forecastDateLabel?.(step, last) ?? `~+${step}`
    const rawFut = a + b * i
    return {
      ...last,
      dateLabel: label,
      value: null,
      histTrend: null,
      futTrend: clampY(rawFut),
      isProjection: true,
    } as TrendAugmentedPoint<T>
  })

  return [...hist, ...fut]
}

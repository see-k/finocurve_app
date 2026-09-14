/**
 * Owns everything the value-over-time chart needs: the selected period, the
 * client's data-source choice, the candidate series, and the provenance of
 * whichever one is plotted.
 *
 * Dashboard and Portfolio both render the same chart, so they share this hook
 * rather than each assembling the pipeline themselves.
 */
import { useMemo, useState } from 'react'
import { usePortfolioValueHistory } from '../store/usePortfolioValueHistory'
import { useHistoricalPrices } from './useHistoricalPrices'
import {
  getPerformanceChartData,
  type ChartDataPoint,
  type PerformanceChartResult,
  type PerformanceSourcePreference,
} from '../utils/performanceChartData'
import { augmentSeriesWithLinearTrend, type TrendAugmentedPoint } from '../lib/chartTrendForecast'
import { aggregateAssetValueProvenance, createFinancialProvenance } from '../lib/financialProvenance'
import type { Asset, FinancialValueProvenance, PerformancePeriod } from '../types'

export const PERFORMANCE_PERIODS: PerformancePeriod[] = ['1D', '1W', '1M', '1Y']

export interface PerformanceSeries extends PerformanceChartResult {
  period: PerformancePeriod
  setPeriod: (period: PerformancePeriod) => void
  sourcePreference: PerformanceSourcePreference
  setSourcePreference: (preference: PerformanceSourcePreference) => void
  /** Plotted rows, with the optional least-squares fit and its extension. */
  series: TrendAugmentedPoint<ChartDataPoint>[]
  /** True while the market series is being fetched. */
  loading: boolean
  /** Audit trail for the plotted series, or null when nothing is plotted. */
  provenance: FinancialValueProvenance | null
  /** Aggregate provenance for the portfolio totals. */
  portfolioProvenance: FinancialValueProvenance
  /** Change across the plotted window, and the same as a rate. */
  periodChange: { amount: number; percent: number } | null
}

interface Options {
  /** Appends the least-squares fit and its forward extension to each row. */
  withTrend?: boolean
}

export function usePerformanceSeries(
  assets: Asset[],
  totalValue: number,
  holdingsValue: number,
  hasAssets: boolean,
  options: Options = {}
): PerformanceSeries {
  const { withTrend = false } = options

  const [period, setPeriod] = useState<PerformancePeriod>('1M')
  const [sourcePreference, setSourcePreference] = useState<PerformanceSourcePreference>('auto')

  const { history } = usePortfolioValueHistory(totalValue, holdingsValue, hasAssets)
  // Market history is fetched in the main process; the browser build has no
  // such API, which is a different reason for absence than "no tickers on file".
  const marketSupported = !!window.electronAPI?.priceHistorical
  const {
    data: marketData, provenance: marketProvenance, loading, error: marketError,
  } = useHistoricalPrices(assets, period, totalValue, hasAssets && marketSupported)

  const raw = useMemo(
    () => getPerformanceChartData(history, period, marketData, sourcePreference),
    [history, period, marketData, sourcePreference]
  )

  // Replace the generic "no tickers" reason when the real obstacle is the
  // platform or a failed fetch, so the empty state never misdirects the reader.
  const result = useMemo<PerformanceChartResult>(() => {
    if (marketSupported && !marketError) return raw
    return {
      ...raw,
      sources: raw.sources.map((source) =>
        source.id === 'market' && !source.available
          ? {
            ...source,
            unavailableReason: marketSupported
              ? `Could not load market history: ${marketError}`
              : 'Market history is fetched by the FinoCurve desktop app and is not available in this build.',
          }
          : source
      ),
    }
  }, [raw, marketSupported, marketError])

  const series = useMemo(
    () =>
      withTrend
        ? augmentSeriesWithLinearTrend(result.data, { forecastSteps: 4, minPoints: 3 })
        : result.data.map((point) => ({ ...point, histTrend: null, futTrend: null })),
    [result.data, withTrend]
  )

  const portfolioProvenance = useMemo(() => aggregateAssetValueProvenance(assets), [assets])

  const provenance = useMemo<FinancialValueProvenance | null>(() => {
    if (result.dataSource === 'market') return marketProvenance ?? null
    if (result.dataSource === 'snapshots') {
      return createFinancialProvenance({
        sourceKind: 'historical',
        sourceName: 'FinoCurve account snapshots',
        valuationMethod: 'historical_close',
        asOf: result.data[result.data.length - 1]?.date ?? portfolioProvenance.asOf,
        isEstimated: portfolioProvenance.isEstimated,
      })
    }
    return null
  }, [result.dataSource, result.data, marketProvenance, portfolioProvenance])

  const periodChange = useMemo(() => {
    if (!result.hasRealData || result.data.length < 2) return null
    const first = result.data[0].value
    const last = result.data[result.data.length - 1].value
    if (!Number.isFinite(first) || !Number.isFinite(last)) return null
    const amount = last - first
    return { amount, percent: first !== 0 ? (amount / Math.abs(first)) * 100 : 0 }
  }, [result.data, result.hasRealData])

  return {
    ...result,
    period,
    setPeriod,
    sourcePreference,
    setSourcePreference,
    series,
    loading,
    provenance,
    portfolioProvenance,
    periodChange,
  }
}

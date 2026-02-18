/**
 * Fetches historical portfolio value from Yahoo Finance (stocks, ETFs, crypto).
 * Only available in Electron; falls back to null in browser.
 */
import { useState, useEffect, useCallback } from 'react'
import type { Asset } from '../types'
import { assetCurrentValue, isLoan } from '../types'
import type { PerformancePeriod } from '../types'

const SUPPORTED_TYPES = ['stock', 'etf', 'crypto']

export function useHistoricalPrices(
  assets: Asset[],
  period: PerformancePeriod,
  totalValue: number,
  enabled: boolean
): { data: { date: string; value: number }[]; loading: boolean; error: string | null } {
  const [data, setData] = useState<{ date: string; value: number }[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    const api = typeof window !== 'undefined' ? window.electronAPI?.priceHistorical : undefined
    if (!api || !enabled || assets.length === 0) {
      setData([])
      return
    }

    const nonLoans = assets.filter((a) => !isLoan(a))
    const tickerAssets = nonLoans.filter(
      (a) => a.symbol && SUPPORTED_TYPES.includes(a.type?.toLowerCase?.() || '')
    )
    const otherAssets = nonLoans.filter(
      (a) => !a.symbol || !SUPPORTED_TYPES.includes(a.type?.toLowerCase?.() || '')
    )
    const loanAssets = assets.filter(isLoan)
    const otherValue =
      otherAssets.reduce((s, a) => s + assetCurrentValue(a), 0) -
      loanAssets.reduce((s, a) => s + Math.abs(a.currentPrice), 0)

    if (tickerAssets.length === 0) {
      setData([])
      return
    }

    setLoading(true)
    setError(null)
    try {
      const result = await api({
        assets: tickerAssets.map((a) => ({
          symbol: a.symbol!,
          quantity: a.quantity,
          type: a.type,
          currentValue: assetCurrentValue(a),
        })),
        period,
        otherAssetsValue: otherValue,
      })

      if (result.error) {
        setError(result.error)
        setData([])
      } else {
        setData(result.data || [])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setData([])
    } finally {
      setLoading(false)
    }
  }, [assets, period, enabled])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return { data, loading, error }
}

/**
 * Fetches historical portfolio value from Yahoo Finance (stocks, ETFs, crypto).
 * Only available in Electron; falls back to null in browser.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import type { Asset, FinancialValueProvenance } from '../types'
import { assetCurrentValue, isLoan } from '../types'
import type { PerformancePeriod } from '../types'

const SUPPORTED_TYPES = ['stock', 'etf', 'crypto']

function holdingsKey(assets: Asset[], period: PerformancePeriod): string {
  const tickers = assets
    .filter((asset) => !isLoan(asset) && asset.symbol && SUPPORTED_TYPES.includes(asset.type?.toLowerCase?.() || ''))
    .map((asset) => `${asset.symbol}:${asset.quantity}:${asset.type}`)
    .sort()
    .join('|')
  return `${period}::${tickers}`
}

export function useHistoricalPrices(
  assets: Asset[],
  period: PerformancePeriod,
  totalValue: number,
  enabled: boolean
): {
  data: { date: string; value: number }[]
  provenance: FinancialValueProvenance | null
  loading: boolean
  error: string | null
} {
  const [data, setData] = useState<{ date: string; value: number }[]>([])
  const [dataKey, setDataKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [provenance, setProvenance] = useState<FinancialValueProvenance | null>(null)
  const requestSeq = useRef(0)
  const requestKey = holdingsKey(assets, period)

  const fetchData = useCallback(async () => {
    const seq = ++requestSeq.current
    const key = holdingsKey(assets, period)
    const api = typeof window !== 'undefined' ? window.electronAPI?.priceHistorical : undefined
    if (!api || !enabled || assets.length === 0) {
      setData([])
      setDataKey(key)
      setProvenance(null)
      setError(null)
      setLoading(false)
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
      loanAssets.reduce((s, a) => s + Math.abs(assetCurrentValue(a)), 0)

    if (tickerAssets.length === 0) {
      setData([])
      setDataKey(key)
      setProvenance(null)
      setError(null)
      setLoading(false)
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

      if (seq !== requestSeq.current) return
      if (result.error) {
        setError(result.error)
        setData([])
        setDataKey(key)
        setProvenance(null)
      } else {
        setData(result.data || [])
        setDataKey(key)
        setProvenance(result.provenance ?? null)
      }
    } catch (err) {
      if (seq !== requestSeq.current) return
      setError(err instanceof Error ? err.message : String(err))
      setData([])
      setDataKey(key)
      setProvenance(null)
    } finally {
      if (seq === requestSeq.current) setLoading(false)
    }
  }, [assets, period, enabled])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const matchesRequest = dataKey === requestKey
  return {
    data: matchesRequest ? data : [],
    provenance: matchesRequest ? provenance : null,
    loading: loading || !matchesRequest,
    error: matchesRequest ? error : null,
  }
}

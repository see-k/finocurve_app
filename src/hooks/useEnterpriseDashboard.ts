/**
 * Loads the consolidated balances and connection health the dashboard's
 * enterprise section renders.
 *
 * Kept separate from EnterpriseScreen's own loader: this one fetches only the
 * two endpoints the dashboard summarises, and stays inert unless enterprise mode
 * is active so a non-subscriber never issues a request.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  enterpriseFetch,
  type EnterpriseBalances,
  type EnterpriseConnection,
} from '../services/enterprise'
import { deriveCustodyMatrix, type CustodyMatrix } from '../lib/enterpriseAnalytics'

export interface EnterpriseDashboardData {
  matrix: CustodyMatrix
  balances: EnterpriseBalances | null
  connections: EnterpriseConnection[]
  /** True when the health endpoint failed; balances may still be present. */
  healthUnavailable: boolean
  loading: boolean
  error: string
  /** True once a load has resolved, successfully or not. */
  loaded: boolean
  refresh: () => void
}

export function useEnterpriseDashboard(enabled: boolean): EnterpriseDashboardData {
  const [balances, setBalances] = useState<EnterpriseBalances | null>(null)
  const [connections, setConnections] = useState<EnterpriseConnection[]>([])
  const [healthUnavailable, setHealthUnavailable] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [nonce, setNonce] = useState(0)
  const requestSeq = useRef(0)

  useEffect(() => {
    if (!enabled) {
      setBalances(null)
      setConnections([])
      setHealthUnavailable(false)
      setLoaded(false)
      setError('')
      return
    }

    const seq = ++requestSeq.current
    let cancelled = false
    const force = nonce > 0
    setLoading(true)
    setError('')

    void (async () => {
      try {
        const nextBalances = await enterpriseFetch<EnterpriseBalances>('/api/reports/balances', { force })
        if (cancelled || seq !== requestSeq.current) return
        setBalances(nextBalances)
      } catch (reason) {
        if (cancelled || seq !== requestSeq.current) return
        setError(reason instanceof Error ? reason.message : 'Enterprise data could not be loaded.')
      } finally {
        if (!cancelled && seq === requestSeq.current) {
          setLoading(false)
          setLoaded(true)
        }
      }
    })()

    // Health is advisory: do not gate balances on it, and surface a failure
    // rather than reporting 0/0 as “all providers responding”.
    void (async () => {
      try {
        const data = await enterpriseFetch<{ products: EnterpriseConnection[] }>(
          '/api/health/connections',
          { force }
        )
        if (cancelled || seq !== requestSeq.current) return
        setConnections(data.products ?? [])
        setHealthUnavailable(false)
      } catch {
        if (cancelled || seq !== requestSeq.current) return
        setConnections([])
        setHealthUnavailable(true)
      }
    })()

    return () => { cancelled = true }
  }, [enabled, nonce])

  const refresh = useCallback(() => setNonce((n) => n + 1), [])

  return {
    matrix: deriveCustodyMatrix(balances),
    balances,
    connections,
    healthUnavailable,
    loading,
    error,
    loaded,
    refresh,
  }
}

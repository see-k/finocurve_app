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
  loading: boolean
  error: string
  /** True once a load has resolved, successfully or not. */
  loaded: boolean
  refresh: () => void
}

export function useEnterpriseDashboard(enabled: boolean): EnterpriseDashboardData {
  const [balances, setBalances] = useState<EnterpriseBalances | null>(null)
  const [connections, setConnections] = useState<EnterpriseConnection[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [nonce, setNonce] = useState(0)
  const requestSeq = useRef(0)

  useEffect(() => {
    if (!enabled) {
      setBalances(null)
      setConnections([])
      setLoaded(false)
      setError('')
      return
    }

    const seq = ++requestSeq.current
    let cancelled = false
    setLoading(true)
    setError('')

    void (async () => {
      try {
        // Connection health is advisory; a failure there must not blank the
        // balances the rest of the section is built on.
        const [nextBalances, nextConnections] = await Promise.all([
          enterpriseFetch<EnterpriseBalances>('/api/reports/balances'),
          enterpriseFetch<{ products: EnterpriseConnection[] }>('/api/health/connections')
            .then((data) => data.products ?? [])
            .catch(() => [] as EnterpriseConnection[]),
        ])
        if (cancelled || seq !== requestSeq.current) return
        setBalances(nextBalances)
        setConnections(nextConnections)
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

    return () => { cancelled = true }
  }, [enabled, nonce])

  const refresh = useCallback(() => setNonce((n) => n + 1), [])

  return {
    matrix: deriveCustodyMatrix(balances),
    balances,
    connections,
    loading,
    error,
    loaded,
    refresh,
  }
}

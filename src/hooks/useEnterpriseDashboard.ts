/**
 * Loads what the dashboard shows from Finocurve Service: consolidated balances,
 * connection health, balance history, recent activity and broker positions.
 *
 * Kept separate from EnterpriseScreen's own loader, and inert unless enterprise
 * mode is active so a non-subscriber never issues a request.
 *
 * Balances are the primary figure: their failure is the section's error. Every
 * other feed is advisory and fails on its own without hiding the balances.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  enterpriseFetch,
  type BalanceSnapshot,
  type EnterpriseBalances,
  type EnterpriseConnection,
  type EnterpriseTransaction,
} from '../services/enterprise'
import { deriveCustodyMatrix, PRODUCT_LABELS, type CustodyMatrix } from '../lib/enterpriseAnalytics'
import {
  POSITION_PATHS, POSITION_READERS, type EnterprisePosition, type PositionVenue,
} from '../lib/enterprisePositions'

/** Most recent transactions kept for the dashboard; the full list lives on the Enterprise tab. */
const RECENT_ACTIVITY_LIMIT = 8

type TransactionsResponse = {
  by_product?: Array<{
    product: string
    institution_name?: string
    account_name?: string
    transactions?: Omit<EnterpriseTransaction, 'product' | 'institution' | 'account'>[]
    error?: unknown
  }>
}

export interface FeedState<T> {
  data: T
  /** True when the request failed; `data` holds its empty value. */
  unavailable: boolean
  loaded: boolean
}

export interface PositionsFeed {
  positions: EnterprisePosition[]
  /** Connected venues whose position request failed. */
  failedVenues: string[]
  loaded: boolean
}

export interface EnterpriseDashboardData {
  matrix: CustodyMatrix
  balances: EnterpriseBalances | null
  connections: EnterpriseConnection[]
  /** True when the health endpoint failed; balances may still be present. */
  healthUnavailable: boolean
  history: FeedState<BalanceSnapshot[]>
  activity: FeedState<EnterpriseTransaction[]>
  positions: PositionsFeed
  /** Latest provider sync time, ISO, or '' when none is reported. */
  asOf: string
  loading: boolean
  error: string
  /** True once the balances load has resolved, successfully or not. */
  loaded: boolean
  refresh: () => void
}

const VENUES = Object.keys(POSITION_PATHS) as PositionVenue[]

function emptyFeed<T>(data: T): FeedState<T> {
  return { data, unavailable: false, loaded: false }
}

const EMPTY_POSITIONS: PositionsFeed = { positions: [], failedVenues: [], loaded: false }

export function useEnterpriseDashboard(enabled: boolean): EnterpriseDashboardData {
  const [balances, setBalances] = useState<EnterpriseBalances | null>(null)
  const [connections, setConnections] = useState<EnterpriseConnection[]>([])
  const [healthUnavailable, setHealthUnavailable] = useState(false)
  const [history, setHistory] = useState<FeedState<BalanceSnapshot[]>>(() => emptyFeed([]))
  const [activity, setActivity] = useState<FeedState<EnterpriseTransaction[]>>(() => emptyFeed([]))
  const [positions, setPositions] = useState<PositionsFeed>(EMPTY_POSITIONS)
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
      setHistory(emptyFeed([]))
      setActivity(emptyFeed([]))
      setPositions(EMPTY_POSITIONS)
      setLoaded(false)
      setError('')
      return
    }

    const seq = ++requestSeq.current
    let cancelled = false
    const live = () => !cancelled && seq === requestSeq.current
    const force = nonce > 0
    setLoading(true)
    setError('')

    void (async () => {
      try {
        const nextBalances = await enterpriseFetch<EnterpriseBalances>('/api/reports/balances', { force })
        if (!live()) return
        setBalances(nextBalances)
      } catch (reason) {
        if (!live()) return
        setError(reason instanceof Error ? reason.message : 'Enterprise data could not be loaded.')
      } finally {
        if (live()) {
          setLoading(false)
          setLoaded(true)
        }
      }
    })()

    void (async () => {
      try {
        const data = await enterpriseFetch<{ history?: BalanceSnapshot[] }>('/api/balance-history')
        if (!live()) return
        const ordered = [...(data.history ?? [])].sort((a, b) => Number(a.id) - Number(b.id))
        setHistory({ data: ordered, unavailable: false, loaded: true })
      } catch {
        if (live()) setHistory({ data: [], unavailable: true, loaded: true })
      }
    })()

    void (async () => {
      try {
        const data = await enterpriseFetch<TransactionsResponse>('/api/reports/transactions', { force })
        if (!live()) return
        const recent = (data.by_product ?? [])
          .flatMap((group) => (group.transactions ?? []).map((transaction) => ({
            ...transaction,
            product: group.product,
            institution: group.institution_name || PRODUCT_LABELS[group.product] || group.product,
            account: group.account_name ?? '',
          })))
          .sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')))
          .slice(0, RECENT_ACTIVITY_LIMIT)
        setActivity({ data: recent, unavailable: false, loaded: true })
      } catch {
        if (live()) setActivity({ data: [], unavailable: true, loaded: true })
      }
    })()

    // Health decides which brokers are worth asking for positions: querying an
    // unconfigured venue only produces an error the reader cannot act on.
    void (async () => {
      let products: EnterpriseConnection[] | null = null
      try {
        const data = await enterpriseFetch<{ products: EnterpriseConnection[] }>(
          '/api/health/connections',
          { force }
        )
        if (!live()) return
        products = data.products ?? []
        setConnections(products)
        setHealthUnavailable(false)
      } catch {
        if (!live()) return
        setConnections([])
        setHealthUnavailable(true)
      }

      const connected = products
        ? VENUES.filter((venue) => products!.some((p) => p.product === venue && p.status === 'connected'))
        : VENUES
      // Broker pass-throughs forward query strings upstream, so never add refresh=1.
      const results = await Promise.allSettled(
        connected.map(async (venue) => POSITION_READERS[venue](await enterpriseFetch<unknown>(POSITION_PATHS[venue])))
      )
      if (!live()) return
      const failedVenues = products
        ? connected.filter((_, i) => results[i].status === 'rejected').map((venue) => PRODUCT_LABELS[venue] ?? venue)
        : [] // Without health we probed blind; a failure may just mean "not configured".
      const merged = results
        .flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
        .sort((a, b) => Math.abs(b.marketValue) - Math.abs(a.marketValue))
      setPositions({ positions: merged, failedVenues, loaded: true })
    })()

    return () => { cancelled = true }
  }, [enabled, nonce])

  const refresh = useCallback(() => setNonce((n) => n + 1), [])
  const matrix = useMemo(() => deriveCustodyMatrix(balances), [balances])
  const asOf = useMemo(() => {
    let latest = ''
    let latestMs = -Infinity
    for (const connection of connections) {
      const ms = connection.last_sync ? new Date(connection.last_sync).getTime() : NaN
      if (Number.isFinite(ms) && ms > latestMs) {
        latestMs = ms
        latest = connection.last_sync as string
      }
    }
    return latest
  }, [connections])

  return {
    matrix,
    balances,
    connections,
    healthUnavailable,
    history,
    activity,
    positions,
    asOf,
    loading,
    error,
    loaded,
    refresh,
  }
}

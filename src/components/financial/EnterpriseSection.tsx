import { useMemo } from 'react'
import { Activity, Briefcase, Building2, Boxes, ExternalLink, Layers, LineChart, PieChart, RefreshCw } from 'lucide-react'
import Panel from './Panel'
import KeyFigures from './KeyFigures'
import CustodyLandscape from './CustodyLandscape'
import AllocationBreakdown from './AllocationBreakdown'
import { CustodyMatrixTable, ConnectionHealthTable } from './EnterpriseTables'
import {
  BalanceHistoryChart, EnterprisePositionsTable, RecentActivityTable, historyChange,
} from './EnterpriseFeeds'
import type { EnterpriseDashboardData } from '../../hooks/useEnterpriseDashboard'
import { allocateByClass, totalPositions } from '../../lib/enterprisePositions'
import { formatCurrency, formatCurrencySigned, formatPercentSigned } from '../../lib/formatMoney'
import './EnterpriseSection.css'

/** Broker positions listed inline; the rest are counted in the panel header. */
const POSITIONS_LIMIT = 10

interface EnterpriseSectionProps {
  /** Enterprise mode gate. The caller loads `data` with the same gate. */
  enabled: boolean
  data: EnterpriseDashboardData
  onOpenEnterprise: () => void
}

/**
 * The enterprise band on the dashboard: consolidated custody across connected
 * institutions, the exposure landscape, and the provider link status that says
 * whether those figures can be trusted right now.
 *
 * Rendered only for subscribers whose Finocurve Service is reachable.
 */
export default function EnterpriseSection({ enabled, data, onOpenEnterprise }: EnterpriseSectionProps) {
  const {
    matrix, connections, healthUnavailable, history, activity, positions, loading, error, loaded, refresh,
  } = data

  const positionTotals = useMemo(() => totalPositions(positions.positions), [positions.positions])
  const positionAllocation = useMemo(() => allocateByClass(positions.positions), [positions.positions])
  const change = useMemo(() => historyChange(history.data), [history.data])

  if (!enabled) return null

  const connected = connections.filter((c) => c.status === 'connected').length
  const degraded = connections.filter((c) => c.status === 'error').length
  const notConfigured = connections.filter((c) => c.status === 'not_configured').length
  const reporting = matrix.rows.filter((row) => row.total > 0).length

  const healthMeta = healthUnavailable
    ? 'Health check unavailable'
    : degraded > 0
      ? `${degraded} reporting an error`
      : notConfigured > 0
        ? `${notConfigured} not configured`
        : connections.length > 0
          ? 'All providers responding'
          : loaded
            ? 'No providers reported'
            : '—'

  return (
    <section className="fin-enterprise" aria-label="Enterprise custody">
      <header className="fin-enterprise__head">
        <div className="fin-enterprise__heading">
          <span className="fin-enterprise__eyebrow">
            <Building2 size={12} aria-hidden /> Enterprise
          </span>
          <h2 className="fin-enterprise__title">Consolidated custody</h2>
          <p className="fin-enterprise__sub">
            Balances aggregated across your connected institutions by Finocurve Service.
          </p>
        </div>
        <div className="fin-enterprise__actions">
          <button
            type="button"
            className="fin-btn fin-btn--icon"
            onClick={refresh}
            disabled={loading}
            title="Refresh"
            aria-label="Refresh consolidated custody"
          >
            <RefreshCw size={15} aria-hidden className={loading ? 'fin-enterprise__spin' : undefined} />
          </button>
          <button
            type="button"
            className="fin-btn fin-btn--icon"
            onClick={onOpenEnterprise}
            title="Full workspace"
            aria-label="Open enterprise workspace"
          >
            <ExternalLink size={15} aria-hidden />
          </button>
        </div>
      </header>

      {error ? (
        <Panel title="Enterprise service unreachable" icon={<Building2 size={14} aria-hidden />}>
          <div className="fin-empty">
            <span className="fin-empty__title">Consolidated custody could not be loaded</span>
            <span className="fin-empty__body">{error}</span>
            <button type="button" className="fin-btn fin-btn--icon" onClick={refresh} title="Try again" aria-label="Try again">
              <RefreshCw size={15} aria-hidden />
            </button>
          </div>
        </Panel>
      ) : (
        <div className="fin-stack">
          <KeyFigures
            figures={[
              {
                label: 'Assets under administration',
                value: loaded ? formatCurrency(matrix.total) : '—',
                meta: `${reporting} reporting ${reporting === 1 ? 'institution' : 'institutions'}`,
              },
              {
                label: 'Custody accounts',
                value: loaded ? String(matrix.accountCount) : '—',
                meta: 'Across all providers',
              },
              {
                label: 'Digital assets',
                value: loaded ? String(matrix.cryptoAssetCount) : '—',
                meta: 'Distinct assets held',
              },
              {
                label: 'Links connected',
                value: loaded
                  ? (healthUnavailable ? '—' : `${connected}/${connections.length}`)
                  : '—',
                meta: healthMeta,
                tone: healthUnavailable || degraded > 0 ? 'negative' : undefined,
              },
            ]}
          />

          <Panel
            title="Consolidated balance history"
            icon={<LineChart size={14} aria-hidden />}
            note={change
              ? `${formatCurrencySigned(change.amount)}${change.percent != null ? ` (${formatPercentSigned(change.percent)})` : ''} since ${change.since}, from recorded snapshots.`
              : 'Recorded snapshots of the consolidated total.'}
          >
            <BalanceHistoryChart history={history.data} unavailable={history.unavailable} loaded={history.loaded} />
          </Panel>

          <Panel
            title="Custody landscape"
            icon={<Layers size={14} aria-hidden />}
            note="Institution by exposure type. Bar height is the balance held in that cell."
          >
            {loading && !loaded
              ? <div className="fin-empty"><span className="fin-empty__body">Loading consolidated balances…</span></div>
              : <CustodyLandscape matrix={matrix} />}
          </Panel>

          <Panel
            title="Custody matrix"
            icon={<Boxes size={14} aria-hidden />}
            count={reporting > 0 ? `${reporting}` : undefined}
            note="Exact figures behind the landscape. Buckets reconcile to each provider's reported total."
            flushBody
          >
            <CustodyMatrixTable matrix={matrix} />
          </Panel>

          <Panel
            title="Broker positions"
            icon={<Briefcase size={14} aria-hidden />}
            count={positions.positions.length > 0 ? `${positions.positions.length}` : undefined}
            note={positionTotals.measured > 0
              ? `${formatCurrency(positionTotals.marketValue)} across brokers. Unrealized ${formatCurrencySigned(positionTotals.unrealizedPl)}${positionTotals.unrealizedPlPercent != null ? ` (${formatPercentSigned(positionTotals.unrealizedPlPercent)})` : ''} on ${formatCurrency(positionTotals.costBasis)} cost.`
              : 'Open positions reported by connected brokerages, ranked by market value.'}
            flushBody={positions.positions.length > 0}
          >
            <EnterprisePositionsTable
              positions={positions.positions}
              total={positionTotals.grossValue}
              loaded={positions.loaded}
              failedVenues={positions.failedVenues}
              limit={POSITIONS_LIMIT}
            />
          </Panel>

          {positionAllocation.length > 1 && (
            <Panel
              title="Brokerage allocation"
              icon={<PieChart size={14} aria-hidden />}
              note="Broker positions by asset class, as a share of their market value."
            >
              <AllocationBreakdown data={positionAllocation} total={positionTotals.grossValue} currency="USD" />
            </Panel>
          )}

          <div className="fin-row-2">
            <Panel
              title="Recent activity"
              icon={<Activity size={14} aria-hidden />}
              count={activity.data.length > 0 ? `${activity.data.length}` : undefined}
              note="Latest institutional transactions. The full ledger is in the Enterprise workspace."
              flushBody={activity.data.length > 0}
            >
              <RecentActivityTable transactions={activity.data} unavailable={activity.unavailable} loaded={activity.loaded} />
            </Panel>

            <Panel
              title="Connection health"
            count={connections.length > 0 ? `${connections.length}` : undefined}
            note="Provider link status. Balances are only as current as the last successful check."
            flushBody={connections.length > 0 && !healthUnavailable}
          >
              <ConnectionHealthTable connections={connections} unavailable={healthUnavailable} />
            </Panel>
          </div>
        </div>
      )}
    </section>
  )
}

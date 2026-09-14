import { Building2, Boxes, ExternalLink, Layers, RefreshCw } from 'lucide-react'
import Panel from './Panel'
import KeyFigures from './KeyFigures'
import CustodyLandscape from './CustodyLandscape'
import { CustodyMatrixTable, ConnectionHealthTable } from './EnterpriseTables'
import { useEnterpriseDashboard } from '../../hooks/useEnterpriseDashboard'
import { formatCurrency } from '../../lib/formatMoney'
import './EnterpriseSection.css'

interface EnterpriseSectionProps {
  /** Enterprise mode gate — no request is issued when false. */
  enabled: boolean
  onOpenEnterprise: () => void
}

/**
 * The enterprise band on the dashboard: consolidated custody across connected
 * institutions, the exposure landscape, and the provider link status that says
 * whether those figures can be trusted right now.
 *
 * Rendered only for subscribers whose Finocurve Service is reachable.
 */
export default function EnterpriseSection({ enabled, onOpenEnterprise }: EnterpriseSectionProps) {
  const { matrix, connections, healthUnavailable, loading, error, loaded, refresh } = useEnterpriseDashboard(enabled)

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
          <button type="button" className="fin-btn" onClick={refresh} disabled={loading}>
            <RefreshCw size={13} aria-hidden className={loading ? 'fin-enterprise__spin' : undefined} />
            Refresh
          </button>
          <button type="button" className="fin-btn" onClick={onOpenEnterprise}>
            Full workspace <ExternalLink size={13} aria-hidden />
          </button>
        </div>
      </header>

      {error ? (
        <Panel title="Enterprise service unreachable" icon={<Building2 size={14} aria-hidden />}>
          <div className="fin-empty">
            <span className="fin-empty__title">Consolidated custody could not be loaded</span>
            <span className="fin-empty__body">{error}</span>
            <button type="button" className="fin-btn" onClick={refresh}>Try again</button>
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
            title="Connection health"
            count={connections.length > 0 ? `${connections.length}` : undefined}
            note="Provider link status. Balances are only as current as the last successful check."
            flushBody={connections.length > 0}
          >
            <ConnectionHealthTable connections={connections} />
          </Panel>
        </div>
      )}
    </section>
  )
}

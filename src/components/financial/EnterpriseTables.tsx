import { AlertTriangle, CheckCircle2, CircleSlash } from 'lucide-react'
import {
  EXPOSURE_COLORS, EXPOSURE_LABELS, type CustodyMatrix,
} from '../../lib/enterpriseAnalytics'
import { formatCurrency, formatWeight } from '../../lib/formatMoney'
import type { EnterpriseConnection } from '../../services/enterprise'
import './EnterpriseTables.css'

/* ── Custody matrix ──────────────────────────────────────────────────────── */

/**
 * The exact figures behind the landscape: one row per institution, one column
 * per exposure bucket, with a reconciling totals row.
 *
 * This is the landscape's relief channel — every cell the 3D field encodes as a
 * height is readable here as a number.
 */
export function CustodyMatrixTable({ matrix }: { matrix: CustodyMatrix }) {
  if (matrix.rows.length === 0) {
    return (
      <div className="fin-empty">
        <span className="fin-empty__title">No institutions reporting</span>
        <span className="fin-empty__body">
          Connect a provider in Finocurve Service to populate consolidated custody.
        </span>
      </div>
    )
  }

  return (
    <div className="fin-table-wrap">
      <table className="fin-table fin-custody">
        <thead>
          <tr>
            <th scope="col">Institution</th>
            <th scope="col" className="fin-table__num">Accounts</th>
            {matrix.exposures.map((exposure) => (
              <th scope="col" className="fin-table__num" key={exposure}>
                <span className="fin-custody__head">
                  <span
                    className="fin-custody__swatch"
                    style={{ background: EXPOSURE_COLORS[exposure] }}
                    aria-hidden
                  />
                  {EXPOSURE_LABELS[exposure]}
                </span>
              </th>
            ))}
            <th scope="col" className="fin-table__num">Total</th>
            <th scope="col" className="fin-table__num">Share</th>
          </tr>
        </thead>
        <tbody>
          {matrix.rows.map((row) => (
            <tr key={row.key}>
              <td>
                <div className="fin-table__identity-text">
                  <span className="fin-table__primary">{row.label}</span>
                  <span className="fin-table__secondary">
                    {row.product}
                    {row.failed && ' · provider request failed'}
                    {row.excluded && ' · excluded from totals'}
                  </span>
                </div>
              </td>
              <td className="fin-table__num fin-custody__muted">{row.accountCount || '—'}</td>
              {matrix.exposures.map((exposure) => {
                const value = row.exposures[exposure]
                return (
                  <td className="fin-table__num" key={exposure}>
                    {value > 0
                      ? <span className="fin-num">{formatCurrency(value)}</span>
                      : <span className="fin-custody__muted">—</span>}
                  </td>
                )
              })}
              <td className="fin-table__num fin-table__value">{formatCurrency(row.total)}</td>
              <td className="fin-table__num fin-custody__muted">{formatWeight(row.weight)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>Consolidated</td>
            <td className="fin-table__num">{matrix.accountCount}</td>
            {matrix.exposures.map((exposure) => (
              <td className="fin-table__num" key={exposure}>
                {formatCurrency(matrix.exposureTotals[exposure])}
              </td>
            ))}
            <td className="fin-table__num">{formatCurrency(matrix.total)}</td>
            <td className="fin-table__num">100.0%</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

/* ── Connection health ───────────────────────────────────────────────────── */

const STATUS_META = {
  connected: { label: 'Connected', icon: CheckCircle2, tone: 'ok' },
  error: { label: 'Error', icon: AlertTriangle, tone: 'bad' },
  not_configured: { label: 'Not configured', icon: CircleSlash, tone: 'idle' },
} as const

function lastSyncLabel(connection: EnterpriseConnection): string {
  if (!connection.last_sync) return 'Never'
  const parsed = new Date(connection.last_sync)
  if (!Number.isFinite(parsed.getTime())) return 'Unknown'
  return parsed.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

/**
 * Provider link status. On an enterprise desk this is the first thing checked
 * before the balances are trusted, so it sits beside them rather than a tab away.
 */
export function ConnectionHealthTable({
  connections,
  unavailable = false,
}: {
  connections: EnterpriseConnection[]
  unavailable?: boolean
}) {
  if (unavailable) {
    return (
      <div className="fin-empty">
        <span className="fin-empty__title">Health check unavailable</span>
        <span className="fin-empty__body">
          Provider link status could not be loaded. Custody figures above may still be current.
        </span>
      </div>
    )
  }

  if (connections.length === 0) {
    return (
      <div className="fin-empty">
        <span className="fin-empty__title">No providers configured</span>
        <span className="fin-empty__body">
          Connection health appears once a provider is configured in Finocurve Service.
        </span>
      </div>
    )
  }

  const ordered = [...connections].sort((a, b) => {
    const rank = { error: 0, not_configured: 1, connected: 2 } as const
    return (rank[a.status] ?? 3) - (rank[b.status] ?? 3)
  })

  return (
    <div className="fin-table-wrap">
      <table className="fin-table fin-health">
        <thead>
          <tr>
            <th scope="col">Provider</th>
            <th scope="col">Status</th>
            <th scope="col">Last checked</th>
          </tr>
        </thead>
        <tbody>
          {ordered.map((connection) => {
            const meta = STATUS_META[connection.status] ?? STATUS_META.not_configured
            const Icon = meta.icon
            return (
              <tr key={`${connection.product}-${connection.label}`}>
                <td>
                  <div className="fin-table__identity-text">
                    <span className="fin-table__primary">
                      {connection.institution_name || connection.label}
                    </span>
                    <span className="fin-table__secondary">{connection.product}</span>
                  </div>
                </td>
                <td>
                  <span className={`fin-health__status fin-health__status--${meta.tone}`}>
                    <Icon size={13} aria-hidden />
                    {meta.label}
                  </span>
                  {connection.status === 'error' && connection.error && (
                    <div className="fin-health__detail">
                      {String(connection.error).toLowerCase().includes('rate limit')
                        ? 'Provider rate limit reached.'
                        : 'Provider request failed.'}
                    </div>
                  )}
                </td>
                <td className="fin-health__sync">{lastSyncLabel(connection)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

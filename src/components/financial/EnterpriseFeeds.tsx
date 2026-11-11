import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import Delta from './Delta'
import { formatCompactCurrency, formatCurrency, formatCurrencySigned, formatQuantity, formatWeight } from '../../lib/formatMoney'
import { PRODUCT_LABELS } from '../../lib/enterpriseAnalytics'
import { POSITION_CLASS_LABELS, type EnterprisePosition } from '../../lib/enterprisePositions'
import type { BalanceSnapshot, EnterpriseTransaction } from '../../services/enterprise'
import './ValueOverTimeChart.css'
import './EnterpriseTables.css'

function dateLabel(raw: string, withTime = false): string {
  const parsed = new Date(raw)
  if (!Number.isFinite(parsed.getTime())) return raw || '—'
  return parsed.toLocaleDateString(undefined, withTime
    ? { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { month: 'short', day: 'numeric', year: 'numeric' })
}

/* ── Balance history ─────────────────────────────────────────────────────── */

interface HistoryPoint { key: string; label: string; total: number }

function HistoryTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload?: HistoryPoint }> }) {
  const point = active ? payload?.[0]?.payload : undefined
  if (!point) return null
  return (
    <div className="fin-chart-tip">
      <div className="fin-chart-tip__label">{point.label}</div>
      <div className="fin-chart-tip__row">
        <span className="fin-chart-tip__key">Consolidated</span>
        <span className="fin-chart-tip__value fin-num">{formatCurrency(point.total)}</span>
      </div>
    </div>
  )
}

/**
 * Recorded consolidated-balance snapshots. Every snapshot is plotted: folding
 * to one point a day hides intra-day swings the service did record.
 */
export function BalanceHistoryChart({
  history,
  unavailable,
  loaded,
  height = 220,
}: {
  history: BalanceSnapshot[]
  unavailable: boolean
  loaded: boolean
  height?: number
}) {
  if (!loaded) {
    return <div className="fin-empty" style={{ minHeight: height }}><span className="fin-empty__body">Loading balance history…</span></div>
  }
  if (unavailable) {
    return (
      <div className="fin-empty" style={{ minHeight: height }}>
        <span className="fin-empty__title">Balance history unavailable</span>
        <span className="fin-empty__body">Finocurve Service did not return recorded snapshots.</span>
      </div>
    )
  }
  const points: HistoryPoint[] = history
    .map((item) => ({ key: String(item.id), label: dateLabel(item.snapshot_date, true), total: Number(item.total_usd) }))
    .filter((point) => Number.isFinite(point.total))
  if (points.length < 2) {
    return (
      <div className="fin-empty" style={{ minHeight: height }}>
        <span className="fin-empty__title">Not enough history yet</span>
        <span className="fin-empty__body">
          A line is drawn once two or more snapshots are recorded. Take one from the Enterprise workspace.
        </span>
      </div>
    )
  }

  return (
    <div className="fin-chart" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 12, left: 4, bottom: 8 }}>
          <defs>
            <linearGradient id="finEnterpriseHistoryFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--brand-primary)" stopOpacity={0.22} />
              <stop offset="100%" stopColor="var(--brand-primary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--fin-chart-grid)" vertical={false} />
          <XAxis
            dataKey="key"
            tickFormatter={(key) => {
              const point = points.find((p) => p.key === key)
              return point ? point.label.split(',')[0] : ''
            }}
            tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }}
            axisLine={{ stroke: 'var(--fin-chart-axis)' }}
            tickLine={false}
            tickMargin={10}
            minTickGap={32}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickMargin={8}
            width={62}
            tickCount={5}
            tickFormatter={(value) => formatCompactCurrency(value)}
            domain={([min, max]: readonly [number, number]) => {
              const pad = max > min ? (max - min) * 0.15 : Math.max(Math.abs(min) * 0.02, 100)
              return [min - pad, max + pad]
            }}
          />
          <Tooltip content={<HistoryTooltip />} cursor={{ stroke: 'var(--fin-rule-strong)', strokeWidth: 1 }} />
          <Area
            type="monotone"
            dataKey="total"
            stroke="var(--brand-primary)"
            strokeWidth={2}
            fill="url(#finEnterpriseHistoryFill)"
            activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--fin-surface)' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

/** First-to-last change across the recorded snapshots, or null with fewer than two. */
export function historyChange(history: BalanceSnapshot[]): { amount: number; percent: number | null; since: string } | null {
  const valid = history.filter((item) => Number.isFinite(Number(item.total_usd)))
  if (valid.length < 2) return null
  const first = Number(valid[0].total_usd)
  const last = Number(valid[valid.length - 1].total_usd)
  return {
    amount: last - first,
    percent: first !== 0 ? ((last - first) / Math.abs(first)) * 100 : null,
    since: dateLabel(valid[0].snapshot_date),
  }
}

/* ── Broker positions ────────────────────────────────────────────────────── */

export function EnterprisePositionsTable({
  positions,
  total,
  loaded,
  failedVenues,
  limit,
}: {
  positions: EnterprisePosition[]
  /** Denominator for the weight column: market value across all positions. */
  total: number
  loaded: boolean
  failedVenues: string[]
  limit?: number
}) {
  const failureNote = failedVenues.length > 0
    ? `Could not load positions from ${failedVenues.join(', ')}.`
    : ''

  if (!loaded) {
    return <div className="fin-empty"><span className="fin-empty__body">Loading broker positions…</span></div>
  }
  if (positions.length === 0) {
    return (
      <div className="fin-empty">
        <span className="fin-empty__title">No open positions reported</span>
        <span className="fin-empty__body">
          {failureNote || 'Positions appear here once a connected brokerage (Alpaca, Schwab, Kalshi or Polymarket US) reports holdings.'}
        </span>
      </div>
    )
  }

  const shown = limit ? positions.slice(0, limit) : positions
  return (
    <>
      <div className="fin-table-wrap">
        <table className="fin-table fin-broker-positions">
          <thead>
            <tr>
              <th scope="col">Position</th>
              <th scope="col">Venue</th>
              <th scope="col" className="fin-table__num">Quantity</th>
              <th scope="col" className="fin-table__num">Market value</th>
              <th scope="col" className="fin-table__num">Weight</th>
              <th scope="col" className="fin-table__num">Unrealized</th>
              <th scope="col" className="fin-table__num">Return</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((position) => (
              <tr key={position.key}>
                <td>
                  <div className="fin-table__identity-text">
                    <span className="fin-table__primary">{position.symbol}</span>
                    <span className="fin-table__secondary">
                      {position.name !== position.symbol ? `${position.name} · ` : ''}
                      {POSITION_CLASS_LABELS[position.assetClass]}
                    </span>
                  </div>
                </td>
                <td className="fin-custody__muted">{PRODUCT_LABELS[position.venue] ?? position.venue}</td>
                <td className="fin-table__num">{formatQuantity(position.quantity)}</td>
                <td className="fin-table__num fin-table__value">
                  {formatCurrency(position.marketValue)}
                  {position.valuedAtCost && <span className="fin-table__secondary"> at cost</span>}
                </td>
                <td className="fin-table__num fin-custody__muted">
                  {total > 0 ? formatWeight((Math.abs(position.marketValue) / total) * 100) : '—'}
                </td>
                <td className="fin-table__num">
                  {position.unrealizedPl != null
                    ? <span className={position.unrealizedPl >= 0 ? 'fin-pos' : 'fin-neg'}>{formatCurrencySigned(position.unrealizedPl)}</span>
                    : <span className="fin-custody__muted">—</span>}
                </td>
                <td className="fin-table__num">
                  {position.unrealizedPlPercent != null
                    ? <Delta value={position.unrealizedPlPercent} kind="percent" size="sm" />
                    : <span className="fin-custody__muted">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {failureNote && <div className="fin-health__detail fin-broker-positions__note">{failureNote}</div>}
    </>
  )
}

/* ── Recent activity ─────────────────────────────────────────────────────── */

export function RecentActivityTable({
  transactions,
  unavailable,
  loaded,
}: {
  transactions: EnterpriseTransaction[]
  unavailable: boolean
  loaded: boolean
}) {
  if (!loaded) {
    return <div className="fin-empty"><span className="fin-empty__body">Loading activity…</span></div>
  }
  if (unavailable) {
    return (
      <div className="fin-empty">
        <span className="fin-empty__title">Activity unavailable</span>
        <span className="fin-empty__body">Finocurve Service did not return institutional transactions.</span>
      </div>
    )
  }
  if (transactions.length === 0) {
    return (
      <div className="fin-empty">
        <span className="fin-empty__title">No recent activity</span>
        <span className="fin-empty__body">Connected institutions have not reported transactions.</span>
      </div>
    )
  }

  return (
    <div className="fin-table-wrap">
      <table className="fin-table fin-activity">
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Description</th>
            <th scope="col" className="fin-table__num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((transaction, index) => {
            const amount = Number(transaction.amount)
            return (
              <tr key={transaction.id || `${transaction.date}-${index}`}>
                <td className="fin-health__sync">{dateLabel(transaction.date)}</td>
                <td>
                  <div className="fin-table__identity-text">
                    <span className="fin-table__primary">
                      {transaction.description || transaction.counterparty || 'Transaction'}
                    </span>
                    <span className="fin-table__secondary">
                      {[transaction.institution, transaction.category?.replace(/_/g, ' ')].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                </td>
                <td className="fin-table__num">
                  {Number.isFinite(amount)
                    ? <span className={amount >= 0 ? 'fin-pos' : undefined}>{formatCurrencySigned(amount)}</span>
                    : <span className="fin-custody__muted">—</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

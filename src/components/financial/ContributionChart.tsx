import { useMemo } from 'react'
import {
  Bar, BarChart, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { formatCompactCurrency, formatCurrency, formatPercentSigned, formatWeight } from '../../lib/formatMoney'
import type { Asset } from '../../types'
import { assetCurrentValue, assetGainLoss, assetGainLossPercent } from '../../types'
import './PositionCharts.css'

interface ContributionChartProps {
  holdings: Asset[]
  /** Denominator for the weight shown in the tooltip. */
  grossAssets: number
  /** Positions past this cap are grouped into a single "Other" bar. */
  maxRows?: number
  onSelect?: (asset: Asset) => void
}

interface ContributionRow {
  label: string
  fullName: string
  gain: number
  returnPercent: number | null
  value: number
  cost: number
  asset: Asset | null
  groupedCount: number
}

/** Axis labels are a fixed width; longer names are truncated rather than wrapped. */
function axisLabel(asset: Asset): string {
  const raw = asset.symbol || asset.name
  return raw.length > 12 ? `${raw.slice(0, 11)}…` : raw
}

/** Bar height plus gap. Drives the chart height so rows never crowd. */
const ROW_HEIGHT = 34

function buildRows(holdings: Asset[], maxRows: number): ContributionRow[] {
  const rows: ContributionRow[] = holdings.map((asset) => ({
    label: axisLabel(asset),
    fullName: asset.name,
    gain: assetGainLoss(asset),
    returnPercent: asset.costBasis > 0 ? assetGainLossPercent(asset) : null,
    value: assetCurrentValue(asset),
    cost: asset.costBasis,
    asset,
    groupedCount: 0,
  }))

  // Rank by absolute contribution — the biggest movers in either direction.
  rows.sort((a, b) => Math.abs(b.gain) - Math.abs(a.gain))
  if (rows.length <= maxRows) return rows

  const head = rows.slice(0, maxRows - 1)
  const tail = rows.slice(maxRows - 1)
  const grouped: ContributionRow = {
    label: `Other (${tail.length})`,
    fullName: `${tail.length} smaller positions`,
    gain: tail.reduce((sum, r) => sum + r.gain, 0),
    returnPercent: null,
    value: tail.reduce((sum, r) => sum + r.value, 0),
    cost: tail.reduce((sum, r) => sum + r.cost, 0),
    asset: null,
    groupedCount: tail.length,
  }
  return [...head, grouped]
}

/**
 * Unrealized gain or loss contributed by each position, as a diverging bar chart
 * about a zero baseline.
 *
 * Every figure here is arithmetic on stored values — market value less cost
 * basis — so the chart is meaningful with no price history at all.
 */
export default function ContributionChart({
  holdings,
  grossAssets,
  maxRows = 10,
  onSelect,
}: ContributionChartProps) {
  const rows = useMemo(() => buildRows(holdings, maxRows), [holdings, maxRows])

  const totals = useMemo(() => {
    const gainers = rows.filter((r) => r.gain > 0)
    const losers = rows.filter((r) => r.gain < 0)
    return {
      gains: gainers.reduce((sum, r) => sum + r.gain, 0),
      losses: losers.reduce((sum, r) => sum + r.gain, 0),
      net: rows.reduce((sum, r) => sum + r.gain, 0),
      gainerCount: gainers.length,
      loserCount: losers.length,
    }
  }, [rows])

  if (rows.length === 0) {
    return (
      <div className="fin-empty">
        <span className="fin-empty__title">No positions to attribute</span>
        <span className="fin-empty__body">Add a holding with a cost basis to see what drives your return.</span>
      </div>
    )
  }

  const everythingFlat = rows.every((row) => row.gain === 0)

  return (
    <div className="fin-poschart">
      <div className="fin-poschart__summary">
        <span className="fin-poschart__summary-item">
          <span className="fin-label">Gains</span>
          <strong className="fin-num fin-pos">{formatCurrency(totals.gains)}</strong>
          <span className="fin-poschart__summary-meta">
            {totals.gainerCount} {totals.gainerCount === 1 ? 'position' : 'positions'}
          </span>
        </span>
        <span className="fin-poschart__summary-item">
          <span className="fin-label">Losses</span>
          <strong className="fin-num fin-neg">{formatCurrency(totals.losses)}</strong>
          <span className="fin-poschart__summary-meta">
            {totals.loserCount} {totals.loserCount === 1 ? 'position' : 'positions'}
          </span>
        </span>
        <span className="fin-poschart__summary-item fin-poschart__summary-item--net">
          <span className="fin-label">Net unrealized</span>
          <strong className={`fin-num ${totals.net >= 0 ? 'fin-pos' : 'fin-neg'}`}>
            {formatCurrency(totals.net)}
          </strong>
          <span className="fin-poschart__summary-meta">Across {rows.length} rows</span>
        </span>
      </div>

      {everythingFlat ? (
        <div className="fin-empty">
          <span className="fin-empty__title">Every position is at cost</span>
          <span className="fin-empty__body">
            Nothing has moved against its basis yet, so there is no contribution to attribute.
          </span>
        </div>
      ) : (
        <div style={{ height: Math.max(160, rows.length * ROW_HEIGHT + 36) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={rows}
              layout="vertical"
              margin={{ top: 4, right: 88, left: 4, bottom: 20 }}
              barCategoryGap="22%"
            >
              <XAxis
                type="number"
                tickFormatter={formatCompactCurrency}
                tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickMargin={8}
              />
              <YAxis
                type="category"
                dataKey="label"
                width={112}
                tick={{ fill: 'var(--text-secondary)', fontSize: 11.5 }}
                axisLine={false}
                tickLine={false}
              />
              <ReferenceLine x={0} stroke="var(--fin-rule-strong)" strokeWidth={1} />
              <Tooltip
                cursor={{ fill: 'var(--fin-surface-hover)' }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const row = payload[0].payload as ContributionRow
                  const weight = grossAssets > 0 ? (row.value / grossAssets) * 100 : 0
                  return (
                    <div className="fin-chart-tip">
                      <div className="fin-chart-tip__label">{row.fullName}</div>
                      <TipRow label="Unrealized" value={formatCurrency(row.gain)} tone={row.gain >= 0 ? 'pos' : 'neg'} />
                      {row.returnPercent != null && (
                        <TipRow label="Return" value={formatPercentSigned(row.returnPercent)} tone={row.returnPercent >= 0 ? 'pos' : 'neg'} />
                      )}
                      <TipRow label="Market value" value={formatCurrency(row.value)} />
                      <TipRow label="Invested cost" value={formatCurrency(row.cost)} />
                      <TipRow label="Weight" value={formatWeight(weight)} />
                    </div>
                  )
                }}
              />
              <Bar
                dataKey="gain"
                radius={[3, 3, 3, 3]}
                isAnimationActive={false}
                onClick={(entry: unknown) => {
                  const row = (entry as { payload?: ContributionRow })?.payload
                  if (row?.asset && onSelect) onSelect(row.asset)
                }}
                cursor={onSelect ? 'pointer' : undefined}
              >
                {rows.map((row) => (
                  <Cell
                    key={row.label}
                    fill={row.gain >= 0 ? 'var(--fin-pos)' : 'var(--fin-neg)'}
                    fillOpacity={row.asset ? 0.9 : 0.55}
                  />
                ))}
                {/* Direct labels so the figure never depends on bar colour alone. */}
                <LabelList
                  dataKey="gain"
                  position="right"
                  className="fin-poschart__label"
                  formatter={(value) => (typeof value === 'number' ? formatCompactCurrency(value) : '')}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

function TipRow({ label, value, tone }: { label: string; value: string; tone?: 'pos' | 'neg' }) {
  return (
    <div className="fin-chart-tip__row">
      <span className="fin-chart-tip__key fin-chart-tip__key--plain">{label}</span>
      <span className={`fin-chart-tip__value fin-num ${tone === 'pos' ? 'fin-pos' : tone === 'neg' ? 'fin-neg' : ''}`}>
        {value}
      </span>
    </div>
  )
}

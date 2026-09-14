import { useMemo } from 'react'
import {
  Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { formatCompactCurrency, formatCurrency, formatPercentSigned } from '../../lib/formatMoney'
import type { Asset } from '../../types'
import { assetCurrentValue, assetGainLoss, assetGainLossPercent } from '../../types'
import './PositionCharts.css'

interface CostValueChartProps {
  holdings: Asset[]
  maxRows?: number
  onSelect?: (asset: Asset) => void
  currency?: string
}

interface CostValueRow {
  label: string
  fullName: string
  cost: number
  value: number
  gain: number
  returnPercent: number | null
  asset: Asset | null
}

/** Axis labels are a fixed width; longer names are truncated rather than wrapped. */
function axisLabel(asset: Asset): string {
  const raw = asset.symbol || asset.name
  return raw.length > 12 ? `${raw.slice(0, 11)}…` : raw
}

/** Two bars plus the gap between groups. */
const ROW_HEIGHT = 44

function buildRows(holdings: Asset[], maxRows: number): CostValueRow[] {
  const rows: CostValueRow[] = holdings.map((asset) => ({
    label: axisLabel(asset),
    fullName: asset.name,
    cost: asset.costBasis,
    value: assetCurrentValue(asset),
    gain: assetGainLoss(asset),
    returnPercent: asset.costBasis > 0 ? assetGainLossPercent(asset) : null,
    asset,
  }))

  rows.sort((a, b) => b.value - a.value)
  if (rows.length <= maxRows) return rows

  const head = rows.slice(0, maxRows - 1)
  const tail = rows.slice(maxRows - 1)
  return [
    ...head,
    {
      label: `Other (${tail.length})`,
      fullName: `${tail.length} smaller positions`,
      cost: tail.reduce((sum, r) => sum + r.cost, 0),
      value: tail.reduce((sum, r) => sum + r.value, 0),
      gain: tail.reduce((sum, r) => sum + r.gain, 0),
      returnPercent: null,
      asset: null,
    },
  ]
}

/**
 * Capital deployed against what each position is worth now — two bars per
 * holding, read off stored cost basis and current mark.
 *
 * The gap between the pair is the unrealized result, which is the same quantity
 * the contribution view ranks; here it is shown in the context of position size.
 */
export default function CostValueChart({
  holdings,
  maxRows = 10,
  onSelect,
  currency = 'USD',
}: CostValueChartProps) {
  const rows = useMemo(() => buildRows(holdings, maxRows), [holdings, maxRows])

  const totals = useMemo(() => ({
    cost: rows.reduce((sum, r) => sum + r.cost, 0),
    value: rows.reduce((sum, r) => sum + r.value, 0),
  }), [rows])

  if (rows.length === 0) {
    return (
      <div className="fin-empty">
        <span className="fin-empty__title">No positions on file</span>
        <span className="fin-empty__body">Add a holding to compare invested cost against market value.</span>
      </div>
    )
  }

  function handleClick(entry: unknown) {
    const row = (entry as { payload?: CostValueRow })?.payload
    if (row?.asset && onSelect) onSelect(row.asset)
  }

  return (
    <div className="fin-poschart">
      <div className="fin-poschart__summary">
        <span className="fin-poschart__summary-item">
          <span className="fin-label">Invested cost</span>
          <strong className="fin-num">{formatCurrency(totals.cost, currency)}</strong>
          <span className="fin-poschart__summary-meta">Capital deployed</span>
        </span>
        <span className="fin-poschart__summary-item">
          <span className="fin-label">Market value</span>
          <strong className="fin-num">{formatCurrency(totals.value, currency)}</strong>
          <span className="fin-poschart__summary-meta">At current marks</span>
        </span>
        <span className="fin-poschart__summary-item fin-poschart__summary-item--net">
          <span className="fin-label">Difference</span>
          <strong className={`fin-num ${totals.value - totals.cost >= 0 ? 'fin-pos' : 'fin-neg'}`}>
            {formatCurrency(totals.value - totals.cost, currency)}
          </strong>
          <span className="fin-poschart__summary-meta">Unrealized</span>
        </span>
      </div>

      <div className="fin-legend fin-poschart__legend">
        <span className="fin-legend__item">
          <span className="fin-legend__swatch fin-legend__swatch--dot" style={{ background: 'var(--fin-cat-1)' }} />
          Invested cost
        </span>
        <span className="fin-legend__item">
          <span className="fin-legend__swatch fin-legend__swatch--dot" style={{ background: 'var(--fin-cat-3)' }} />
          Market value
        </span>
      </div>

      <div style={{ height: Math.max(180, rows.length * ROW_HEIGHT + 36) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ top: 4, right: 88, left: 4, bottom: 20 }}
            barGap={2}
            barCategoryGap="26%"
          >
            <XAxis
              type="number"
              tickFormatter={(value) => formatCompactCurrency(value, currency)}
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
            <Tooltip
              cursor={{ fill: 'var(--fin-surface-hover)' }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const row = payload[0].payload as CostValueRow
                return (
                  <div className="fin-chart-tip">
                    <div className="fin-chart-tip__label">{row.fullName}</div>
                    <div className="fin-chart-tip__row">
                      <span className="fin-chart-tip__key fin-chart-tip__key--cost">Invested cost</span>
                      <span className="fin-chart-tip__value fin-num">{formatCurrency(row.cost, currency)}</span>
                    </div>
                    <div className="fin-chart-tip__row">
                      <span className="fin-chart-tip__key fin-chart-tip__key--value">Market value</span>
                      <span className="fin-chart-tip__value fin-num">{formatCurrency(row.value, currency)}</span>
                    </div>
                    <div className="fin-chart-tip__row">
                      <span className="fin-chart-tip__key fin-chart-tip__key--plain">Unrealized</span>
                      <span className={`fin-chart-tip__value fin-num ${row.gain >= 0 ? 'fin-pos' : 'fin-neg'}`}>
                        {formatCurrency(row.gain, currency)}
                        {row.returnPercent != null && ` (${formatPercentSigned(row.returnPercent)})`}
                      </span>
                    </div>
                  </div>
                )
              }}
            />
            <Bar
              dataKey="cost"
              fill="var(--fin-cat-1)"
              fillOpacity={0.75}
              radius={[0, 3, 3, 0]}
              isAnimationActive={false}
              onClick={handleClick}
              cursor={onSelect ? 'pointer' : undefined}
            />
            <Bar
              dataKey="value"
              fill="var(--fin-cat-3)"
              radius={[0, 3, 3, 0]}
              isAnimationActive={false}
              onClick={handleClick}
              cursor={onSelect ? 'pointer' : undefined}
            >
              <LabelList
                dataKey="gain"
                position="right"
                className="fin-poschart__label"
                formatter={(value) => (typeof value !== 'number' ? '' : value === 0 ? '—' : formatCompactCurrency(value, currency))}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

import {
  Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { AlertTriangle, LineChart as LineChartIcon } from 'lucide-react'
import type { PerformanceSeries } from '../../hooks/usePerformanceSeries'
import { formatCompactCurrency, formatCurrency } from '../../lib/formatMoney'
import './ValueOverTimeChart.css'

interface ValueOverTimeChartProps {
  performance: PerformanceSeries
  showTrend: boolean
  height?: number
  currency?: string
}

interface TooltipPayloadEntry {
  dataKey?: string | number
  value?: number | null
}

const SERIES_NAMES: Record<string, string> = {
  value: 'Portfolio value',
  histTrend: 'Trend fit',
  futTrend: 'Trend extended',
}

function ChartTooltip({ active, payload, label, currency }: {
  active?: boolean
  payload?: TooltipPayloadEntry[]
  label?: string
  currency: string
}) {
  if (!active || !payload?.length) return null
  const rows = payload.filter((entry) => entry.value != null && Number.isFinite(entry.value))
  if (rows.length === 0) return null

  return (
    <div className="fin-chart-tip">
      <div className="fin-chart-tip__label">{label}</div>
      {rows.map((entry) => (
        <div className="fin-chart-tip__row" key={String(entry.dataKey)}>
          <span className={`fin-chart-tip__key fin-chart-tip__key--${entry.dataKey}`}>
            {SERIES_NAMES[String(entry.dataKey)] ?? String(entry.dataKey)}
          </span>
          <span className="fin-chart-tip__value fin-num">{formatCurrency(entry.value as number, currency)}</span>
        </div>
      ))}
    </div>
  )
}

/**
 * Observed portfolio value over the selected window.
 *
 * Renders only when a real series exists. With no observed data it states what
 * is missing and how to get it, rather than drawing a placeholder line.
 */
export default function ValueOverTimeChart({
  performance,
  showTrend,
  height = 280,
  currency = 'USD',
}: ValueOverTimeChartProps) {
  const {
    series, period, sources, sourcePreference, dataSource, fellBack, loading, hasRealData,
  } = performance

  if (loading && !hasRealData) {
    return (
      <div className="fin-empty" style={{ minHeight: height }}>
        <span className="fin-empty__body">Loading market history…</span>
      </div>
    )
  }

  if (!hasRealData) {
    return (
      <div className="fin-empty fin-chart-unavailable" style={{ minHeight: height }}>
        <LineChartIcon size={22} aria-hidden />
        <span className="fin-empty__title">No observed history for {period}</span>
        <span className="fin-empty__body">
          This app will not draw a value line it has not observed. When a source has enough
          observations for this window, it can be selected above. Listed holdings with a ticker
          enable market history; opening the app records snapshots.
        </span>
        <ul className="fin-chart-unavailable__reasons">
          {sources.map((source) => (
            <li key={source.id}>
              <strong>{source.label}</strong>
              <span>{source.unavailableReason}</span>
            </li>
          ))}
        </ul>
        <span className="fin-empty__body">
          In the meantime, Contribution and Cost vs value are computed from your stored
          positions and are accurate today.
        </span>
      </div>
    )
  }

  const activeSource = sources.find((s) => s.id === dataSource)
  const pinnedSource = sources.find((s) => s.id === sourcePreference)

  return (
    <>
      {fellBack && pinnedSource && (
        <div className="fin-chart-alert" role="status">
          <AlertTriangle size={14} aria-hidden />
          <span>
            {pinnedSource.label} is not available for {period} — showing{' '}
            {activeSource?.label.toLowerCase()} instead. {pinnedSource.unavailableReason}
          </span>
        </div>
      )}

      <div className="fin-chart" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={series} margin={{ top: 8, right: 12, left: 4, bottom: 20 }}>
            <defs>
              <linearGradient id="finPerfFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--brand-primary)" stopOpacity={0.22} />
                <stop offset="100%" stopColor="var(--brand-primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--fin-chart-grid)" strokeDasharray="0" vertical={false} />
            <XAxis
              dataKey="dateLabel"
              tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }}
              axisLine={{ stroke: 'var(--fin-chart-axis)' }}
              tickLine={false}
              tickMargin={10}
              minTickGap={28}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickMargin={8}
              tickFormatter={(value) => formatCompactCurrency(value, currency)}
              width={62}
              tickCount={5}
              domain={([dataMin, dataMax]: readonly [number, number]) => {
                const range = dataMax - dataMin
                const pad = range > 0
                  ? Math.max(range * 0.15, Math.abs(dataMin + dataMax) / 2 * 0.005, 50)
                  : Math.max(Math.abs(dataMin) * 0.02, 100)
                return [dataMin - pad, dataMax + pad]
              }}
            />
            <Tooltip
              content={<ChartTooltip currency={currency} />}
              cursor={{ stroke: 'var(--fin-rule-strong)', strokeWidth: 1 }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--brand-primary)"
              strokeWidth={2}
              fill="url(#finPerfFill)"
              connectNulls={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--fin-surface)' }}
            />
            {showTrend && (
              <Line
                type="monotone"
                dataKey="histTrend"
                stroke="var(--fin-chart-trend)"
                strokeWidth={1.5}
                dot={false}
                connectNulls
              />
            )}
            {showTrend && (
              <Line
                type="monotone"
                dataKey="futTrend"
                stroke="var(--fin-chart-projection)"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={false}
                connectNulls
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="fin-chart-footer">
        <div className="fin-legend">
          <span className="fin-legend__item">
            <span className="fin-legend__swatch" style={{ background: 'var(--brand-primary)' }} />
            Portfolio value
          </span>
          {showTrend && (
            <>
              <span className="fin-legend__item">
                <span className="fin-legend__swatch" style={{ background: 'var(--fin-chart-trend)' }} />
                Least-squares fit
              </span>
              <span className="fin-legend__item">
                <span className="fin-legend__swatch fin-legend__swatch--dashed" />
                Fit extended forward
              </span>
            </>
          )}
        </div>
        {showTrend && (
          <p className="fin-footnote">
            The fit describes the plotted window only. Extending it forward is arithmetic, not a
            forecast — it carries no view on future returns.
          </p>
        )}
      </div>
    </>
  )
}

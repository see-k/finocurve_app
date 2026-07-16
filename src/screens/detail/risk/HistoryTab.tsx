import { History, Info, TrendingUp } from 'lucide-react'
import {
  ResponsiveContainer, ComposedChart, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip,
} from 'recharts'
import GlassContainer from '../../../components/glass/GlassContainer'
import type { RiskSnapshot } from '../../../types'
import { augmentSeriesWithLinearTrend } from '../../../lib/chartTrendForecast'
import { fmt } from './riskConstants'

interface HistoryTabProps {
  snapshots: RiskSnapshot[]
}

export default function HistoryTab({ snapshots }: HistoryTabProps) {
  if (snapshots.length < 2) {
    return (
      <div className="risk-tab-content">
        <div className="risk-info-banner">
          <Info size={16} />
          <span>Risk metrics are recorded each time you visit this page or save a report. Up to 20 snapshots are kept for trend analysis.</span>
        </div>
        <GlassContainer padding="32px" borderRadius={16} className="risk-history-empty">
          <History size={40} style={{ color: 'var(--text-tertiary)', marginBottom: 16 }} />
          <h3 className="risk-section-title">Not enough history yet</h3>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Visit this page again or save a report to build your risk history. Once you have 2+ snapshots, trend graphs will appear here.
          </p>
        </GlassContainer>
      </div>
    )
  }

  // Chart data: oldest first for time axis
  const chartData = [...snapshots].reverse().map((s) => ({
    date: new Date(s.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }),
    riskScore: s.riskScore,
    sharpe: s.sharpeRatio,
    volatility: s.annualizedVolatility,
    maxDD: s.maxDrawdownPercent,
    diversification: s.diversificationScore,
    liquidity: s.liquidityScore,
    value: s.portfolioValue,
  }))
  const riskScoreTrend = augmentSeriesWithLinearTrend(
    chartData.map((d) => ({ ...d, dateLabel: d.date, value: d.riskScore })),
    { forecastSteps: 3, minPoints: 3, valueClamp: [0, 100] }
  ).map((row) => ({
    date: row.dateLabel,
    riskScore: row.value,
    histTrend: row.histTrend,
    futTrend: row.futTrend,
  }))

  return (
    <div className="risk-tab-content">
      <div className="risk-info-banner">
        <Info size={16} />
        <span>Risk metrics are recorded each time you visit this page or save a report. Up to 20 snapshots are kept for trend analysis.</span>
      </div>

      <GlassContainer padding="24px" borderRadius={16}>
        <h3 className="risk-section-title"><TrendingUp size={16} /> Risk Score Over Time</h3>
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={riskScoreTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} width={28} />
            <Tooltip
              contentStyle={{ background: 'var(--glass-bg-strong)', border: '1px solid var(--glass-border)', borderRadius: 10, fontSize: 12 }}
              formatter={(v, name) => {
                if (v == null || typeof v !== 'number' || Number.isNaN(v)) return ['—', name ?? '']
                return [`${v.toFixed(1)}`, name ?? '']
              }}
            />
            <Line
              type="monotone"
              dataKey="riskScore"
              stroke="#6366f1"
              strokeWidth={2}
              dot={{ r: 4, fill: '#6366f1' }}
              name="Risk score"
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="histTrend"
              stroke="var(--text-tertiary)"
              strokeWidth={1.5}
              dot={false}
              name="Linear trend"
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="futTrend"
              stroke="#f59e0b"
              strokeWidth={1.5}
              strokeDasharray="5 4"
              dot={false}
              name="Projection"
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
        <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.35 }}>
          Gray: linear fit to saved snapshots. Dashed amber: extrapolation — not a prediction of future risk.
        </p>
      </GlassContainer>

      <div className="risk-history-grid">
        <GlassContainer padding="24px" borderRadius={16}>
          <h3 className="risk-section-title">Sharpe Ratio</h3>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" />
              <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 9, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} width={32} />
              <Tooltip contentStyle={{ background: 'var(--glass-bg-strong)', border: '1px solid var(--glass-border)', borderRadius: 10, fontSize: 12 }} />
              <Line type="monotone" dataKey="sharpe" stroke="#06b6d4" strokeWidth={2} dot={{ r: 3, fill: '#06b6d4' }} name="Sharpe" />
            </LineChart>
          </ResponsiveContainer>
        </GlassContainer>
        <GlassContainer padding="24px" borderRadius={16}>
          <h3 className="risk-section-title">Volatility %</h3>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" />
              <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 9, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} width={32} />
              <Tooltip contentStyle={{ background: 'var(--glass-bg-strong)', border: '1px solid var(--glass-border)', borderRadius: 10, fontSize: 12 }} />
              <Line type="monotone" dataKey="volatility" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3, fill: '#f59e0b' }} name="Volatility %" />
            </LineChart>
          </ResponsiveContainer>
        </GlassContainer>
        <GlassContainer padding="24px" borderRadius={16}>
          <h3 className="risk-section-title">Max Drawdown %</h3>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" />
              <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 9, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} width={32} tickFormatter={(v) => `-${v}%`} />
              <Tooltip contentStyle={{ background: 'var(--glass-bg-strong)', border: '1px solid var(--glass-border)', borderRadius: 10, fontSize: 12 }} formatter={(v) => {
                if (v == null || typeof v !== 'number' || Number.isNaN(v)) return ['—', 'Max DD']
                return [`-${v}%`, 'Max DD']
              }} />
              <Line type="monotone" dataKey="maxDD" stroke="#ef4444" strokeWidth={2} dot={{ r: 3, fill: '#ef4444' }} name="Max DD %" />
            </LineChart>
          </ResponsiveContainer>
        </GlassContainer>
        <GlassContainer padding="24px" borderRadius={16}>
          <h3 className="risk-section-title">Portfolio Value</h3>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" />
              <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 9, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip contentStyle={{ background: 'var(--glass-bg-strong)', border: '1px solid var(--glass-border)', borderRadius: 10, fontSize: 12 }} formatter={(v) => {
                if (v == null || typeof v !== 'number' || Number.isNaN(v)) return ['—', 'Value']
                return [fmt(v), 'Value']
              }} />
              <Line type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2} dot={{ r: 3, fill: '#10b981' }} name="Portfolio Value" />
            </LineChart>
          </ResponsiveContainer>
        </GlassContainer>
      </div>
    </div>
  )
}

import { Info } from 'lucide-react'
import { ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, Tooltip } from 'recharts'
import GlassContainer from '../../../components/glass/GlassContainer'
import type { RiskAnalysisResult } from '../../../types'
import { SEVERITY_META, fmt } from './riskConstants'

interface ScenariosTabProps {
  effectiveRisk: RiskAnalysisResult
}

export default function ScenariosTab({ effectiveRisk }: ScenariosTabProps) {
  return (
    <div className="risk-tab-content">
      <div className="risk-info-banner">
        <Info size={16} />
        <span>Stress tests model how your portfolio might react to different economic scenarios based on historical asset-class behavior. Positive impact (e.g. Market Crash showing green) can occur when bonds or cash dominate—they typically rally in risk-off environments. Negative impact in Crypto Winter reflects crypto exposure.</span>
      </div>

      {/* Bar Chart */}
      <GlassContainer padding="24px" borderRadius={16}>
        <h3 className="risk-section-title">Impact Overview</h3>
        <ResponsiveContainer width="100%" height={Math.max(180, effectiveRisk.scenarioAnalysis.length * 44)}>
          <BarChart data={effectiveRisk.scenarioAnalysis} layout="vertical">
            <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v > 0 ? '+' : ''}${v}%`} />
            <YAxis dataKey="name" type="category" width={130} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ background: 'var(--glass-bg-strong)', border: '1px solid var(--glass-border)', borderRadius: 10, fontSize: 12 }}
              formatter={(v) => {
                if (v == null || typeof v !== 'number' || Number.isNaN(v)) return ['—', 'Impact']
                return [`${v > 0 ? '+' : ''}${v}%`, 'Impact']
              }} />
            <Bar dataKey="impactPercent" radius={[0, 6, 6, 0]}>
              {effectiveRisk.scenarioAnalysis.map((s, i) => (
                <Cell key={i} fill={s.impactPercent >= 0 ? '#10b981' : '#ef4444'} opacity={0.8} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </GlassContainer>

      {/* Scenario Cards */}
      <div className="scenario-cards">
        {effectiveRisk.scenarioAnalysis.map((s, i) => (
          <GlassContainer key={i} padding="20px" borderRadius={16} className="scenario-card-v2">
            <div className="scenario-card-v2__top">
              <h4>{s.name}</h4>
              <span className="scenario-severity" style={{ background: SEVERITY_META[s.severity].bg, color: SEVERITY_META[s.severity].color }}>{s.severity}</span>
            </div>
            <p className="scenario-card-v2__desc">{s.description}</p>
            <div className="scenario-card-v2__impact" style={{ color: s.impactPercent >= 0 ? 'var(--status-success)' : 'var(--status-error)' }}>
              {s.impactPercent >= 0 ? '+' : ''}{s.impactPercent}%
              <span className="scenario-card-v2__amt">{s.impactAmount >= 0 ? '+' : '-'}{fmt(s.impactAmount)}</span>
            </div>
            <div className="scenario-bar-bg">
              <div className="scenario-bar" style={{ width: `${Math.min(Math.abs(s.impactPercent), 100)}%`, background: s.impactPercent >= 0 ? '#10b981' : '#ef4444' }} />
            </div>
          </GlassContainer>
        ))}
      </div>
    </div>
  )
}

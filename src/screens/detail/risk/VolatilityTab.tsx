import { Droplets } from 'lucide-react'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts'
import GlassContainer from '../../../components/glass/GlassContainer'
import type { RiskAnalysisResult } from '../../../types'
import { LIQ_COLOR, LIQ_LABEL, SHARPE_META, VOL_LEVEL_META, fmt } from './riskConstants'

interface VolatilityTabProps {
  effectiveRisk: RiskAnalysisResult
  volHistory: { week: string; vol: number }[]
}

export default function VolatilityTab({ effectiveRisk, volHistory }: VolatilityTabProps) {
  return (
    <div className="risk-tab-content">
      {/* Volatility Overview */}
      <GlassContainer padding="24px" borderRadius={16}>
        <h3 className="risk-section-title">Volatility Overview</h3>
        <div className="vol-hero">
          <div className="vol-gauge">
            <svg width="140" height="140" viewBox="0 0 140 140">
              <circle cx="70" cy="70" r="58" fill="none" stroke="var(--glass-border)" strokeWidth="8" />
              <circle cx="70" cy="70" r="58" fill="none" stroke={VOL_LEVEL_META[effectiveRisk.volatilityLevel].color}
                strokeWidth="8" strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 58} strokeDashoffset={2 * Math.PI * 58 * (1 - Math.min(effectiveRisk.annualizedVolatility / 60, 1))}
                transform="rotate(-90 70 70)" style={{ transition: 'stroke-dashoffset 1s ease' }} />
            </svg>
            <div className="vol-gauge__val">{effectiveRisk.annualizedVolatility}%</div>
            <div className="vol-gauge__label" style={{ color: VOL_LEVEL_META[effectiveRisk.volatilityLevel].color }}>{VOL_LEVEL_META[effectiveRisk.volatilityLevel].label}</div>
          </div>
          <div className="vol-stats">
            <div className="vol-stat"><span>Daily Volatility</span><strong>{effectiveRisk.volatility}%</strong></div>
            <div className="vol-stat"><span>Annualized</span><strong>{effectiveRisk.annualizedVolatility}%</strong></div>
            <div className="vol-stat"><span>VIX Equivalent</span><strong>{(effectiveRisk.annualizedVolatility * 0.8).toFixed(1)}</strong></div>
          </div>
        </div>
      </GlassContainer>

      {/* Sharpe Ratio Scale */}
      <GlassContainer padding="24px" borderRadius={16}>
        <h3 className="risk-section-title">Sharpe Ratio — {effectiveRisk.sharpeRatio}</h3>
        <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 16 }}>{SHARPE_META[effectiveRisk.sharpeRating].desc}</p>
        <div className="sharpe-scale">
          {Object.entries(SHARPE_META).map(([key, meta]) => (
            <div key={key} className={`sharpe-tier ${effectiveRisk.sharpeRating === key ? 'sharpe-tier--active' : ''}`} style={{ borderColor: effectiveRisk.sharpeRating === key ? meta.color : 'var(--glass-border)' }}>
              <div className="sharpe-tier__dot" style={{ background: meta.color }} />
              <span>{meta.label}</span>
            </div>
          ))}
        </div>
      </GlassContainer>

      {/* Max Drawdown */}
      <GlassContainer padding="24px" borderRadius={16}>
        <h3 className="risk-section-title">Maximum Drawdown</h3>
        <div className="dd-row">
          <div className="dd-big" style={{ color: 'var(--status-error)' }}>-{effectiveRisk.maxDrawdownPercent}%</div>
          <div className="dd-amount">{fmt(effectiveRisk.maxDrawdown)}</div>
        </div>
        <div className="dd-bar-bg">
          <div className="dd-bar" style={{ width: `${Math.min(effectiveRisk.maxDrawdownPercent, 100)}%` }} />
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 8 }}>Estimated worst-case loss based on historical asset-class drawdowns</p>
      </GlassContainer>

      {/* Historical Volatility */}
      <GlassContainer padding="24px" borderRadius={16}>
        <h3 className="risk-section-title">Simulated Volatility (52 Weeks)</h3>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={volHistory}>
            <XAxis dataKey="week" tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} interval={7} />
            <YAxis hide />
            <Tooltip
              contentStyle={{ background: 'var(--glass-bg-strong)', border: '1px solid var(--glass-border)', borderRadius: 10, fontSize: 12 }}
              formatter={(v) => {
                if (v == null || typeof v !== 'number' || Number.isNaN(v)) return ['—', 'Volatility']
                return [`${v}%`, 'Volatility']
              }}
            />
            <Area type="monotone" dataKey="vol" stroke="#f59e0b" fill="rgba(245,158,11,0.12)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </GlassContainer>

      {/* High Correlations */}
      {effectiveRisk.highCorrelations.length > 0 && (
        <GlassContainer padding="20px" borderRadius={16}>
          <h3 className="risk-section-title">High Correlations</h3>
          <div className="corr-list">
            {effectiveRisk.highCorrelations.map((c, i) => (
              <div key={i} className="corr-row">
                <span>{c.asset1}</span>
                <div className="corr-bar-bg"><div className="corr-bar" style={{ width: `${c.correlation * 100}%` }} /></div>
                <span>{c.asset2}</span>
                <strong>{(c.correlation * 100).toFixed(0)}%</strong>
              </div>
            ))}
          </div>
        </GlassContainer>
      )}

      {/* Liquidity Breakdown */}
      <GlassContainer padding="20px" borderRadius={16}>
        <h3 className="risk-section-title"><Droplets size={16} /> Liquidity Breakdown</h3>
        <div className="liq-list">
          {Object.entries(effectiveRisk.liquidityBreakdown).filter(([,v]) => v > 0).sort(([,a],[,b]) => b - a).map(([cat, pct]) => (
            <div key={cat} className="liq-row">
              <span className="liq-row__label">{LIQ_LABEL[cat] || cat}</span>
              <div className="liq-row__bar-bg"><div className="liq-row__bar" style={{ width: `${pct}%`, background: LIQ_COLOR[cat] || '#6366f1' }} /></div>
              <span className="liq-row__pct">{pct.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </GlassContainer>
    </div>
  )
}

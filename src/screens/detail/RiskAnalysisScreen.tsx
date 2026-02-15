import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Shield, TrendingDown, Globe, AlertTriangle } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, BarChart, Bar } from 'recharts'
import GlassContainer from '../../components/glass/GlassContainer'
import GlassIconButton from '../../components/glass/GlassIconButton'
import type { Asset, RiskLevel, ScenarioResult } from '../../types'
import { assetCurrentValue, portfolioAllocationBySector, portfolioAllocationByCountry, portfolioAllocationByType, SECTOR_LABELS, ASSET_TYPE_LABELS } from '../../types'
import './DetailScreen.css'

const CHART_COLORS = [
  '#6366f1', '#8b5cf6', '#a78bfa', '#c084fc',
  '#06b6d4', '#14b8a6', '#10b981', '#f59e0b',
  '#ef4444', '#ec4899', '#64748b', '#84cc16',
]

function computeRiskMetrics(assets: Asset[]) {
  const total = assets.reduce((s, a) => s + assetCurrentValue(a), 0)
  if (total === 0) return null

  const sectors = new Set(assets.map(a => a.sector || 'other'))
  const types = new Set(assets.map(a => a.type))
  const countries = new Set(assets.map(a => a.country || 'Unknown'))

  const diversificationScore = Math.min(100, (sectors.size * 8 + types.size * 10 + countries.size * 6))
  const maxWeight = Math.max(...assets.map(a => assetCurrentValue(a) / total)) * 100
  const concentrationRisk = maxWeight
  const liquidityScore = assets.filter(a => a.category === 'public').reduce((s, a) => s + assetCurrentValue(a), 0) / total * 100

  // Simulated volatility metrics
  const annualizedVolatility = 12 + Math.random() * 8
  const sharpeRatio = 0.5 + Math.random() * 1.5
  const maxDrawdown = -(8 + Math.random() * 12)
  const beta = 0.7 + Math.random() * 0.6

  let riskScore = 50
  riskScore += (diversificationScore - 50) * 0.3
  riskScore -= (concentrationRisk - 20) * 0.3
  riskScore += (liquidityScore - 50) * 0.2
  riskScore = Math.max(10, Math.min(95, riskScore))

  let riskLevel: RiskLevel = 'moderate'
  if (riskScore >= 75) riskLevel = 'low'
  else if (riskScore >= 50) riskLevel = 'moderate'
  else if (riskScore >= 25) riskLevel = 'high'
  else riskLevel = 'very_high'

  const recommendations: string[] = []
  if (concentrationRisk > 30) recommendations.push('Consider reducing concentration in your top holding')
  if (sectors.size < 4) recommendations.push('Diversify across more sectors for better risk management')
  if (liquidityScore < 50) recommendations.push('Increase allocation to liquid assets for better flexibility')
  if (types.size < 3) recommendations.push('Add different asset types to improve diversification')
  if (recommendations.length === 0) recommendations.push('Your portfolio shows good diversification')

  return {
    riskScore: +riskScore.toFixed(0), riskLevel,
    diversificationScore: +diversificationScore.toFixed(0),
    concentrationRisk: +concentrationRisk.toFixed(1),
    liquidityScore: +liquidityScore.toFixed(0),
    annualizedVolatility: +annualizedVolatility.toFixed(2),
    sharpeRatio: +sharpeRatio.toFixed(2),
    maxDrawdown: +maxDrawdown.toFixed(2),
    beta: +beta.toFixed(2),
    recommendations,
  }
}

function getScenarios(totalValue: number): ScenarioResult[] {
  return [
    { name: 'Market Crash (-30%)', description: 'A severe market downturn similar to 2008', impact: -totalValue * 0.3, impactPercent: -30 },
    { name: 'Correction (-10%)', description: 'A standard market correction', impact: -totalValue * 0.1, impactPercent: -10 },
    { name: 'Rate Hike (+2%)', description: 'Central bank raises rates by 200bps', impact: -totalValue * 0.08, impactPercent: -8 },
    { name: 'Recession', description: 'GDP contraction for 2+ quarters', impact: -totalValue * 0.2, impactPercent: -20 },
    { name: 'Bull Market (+20%)', description: 'Strong economic growth and market rally', impact: totalValue * 0.2, impactPercent: 20 },
    { name: 'Inflation Spike', description: 'CPI exceeds 8% year-over-year', impact: -totalValue * 0.12, impactPercent: -12 },
  ]
}

function generateVolatilityData() {
  const data = []
  let vol = 12
  for (let i = 0; i < 52; i++) {
    vol += (Math.random() - 0.48) * 2
    vol = Math.max(5, Math.min(35, vol))
    data.push({ week: `W${i + 1}`, volatility: +vol.toFixed(2) })
  }
  return data
}

export default function RiskAnalysisScreen() {
  const navigate = useNavigate()
  const [visible, setVisible] = useState(false)
  const [tab, setTab] = useState<'overview' | 'volatility' | 'exposure' | 'scenarios'>('overview')

  const portfolio = JSON.parse(localStorage.getItem('finocure-portfolio') || '{}')
  const assets: Asset[] = portfolio.assets || []
  const totalValue = assets.reduce((s: number, a: Asset) => s + assetCurrentValue(a), 0)

  useEffect(() => { requestAnimationFrame(() => setVisible(true)) }, [])

  const risk = useMemo(() => computeRiskMetrics(assets), [assets])
  const scenarios = useMemo(() => getScenarios(totalValue), [totalValue])
  const volData = useMemo(() => generateVolatilityData(), [])

  const sectorAlloc = useMemo(() => portfolioAllocationBySector({ ...portfolio, assets }), [assets])
  const countryAlloc = useMemo(() => portfolioAllocationByCountry({ ...portfolio, assets }), [assets])
  const typeAlloc = useMemo(() => portfolioAllocationByType({ ...portfolio, assets }), [assets])

  const fmt = (n: number) => '$' + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const riskLevelColor = (level?: RiskLevel) => {
    switch (level) {
      case 'low': return 'var(--status-success)'
      case 'moderate': return 'var(--status-warning)'
      case 'high': return 'var(--status-error)'
      case 'very_high': return '#dc2626'
      default: return 'var(--text-secondary)'
    }
  }

  const pieData = (alloc: Record<string, number>, labels: Record<string, string>) =>
    Object.entries(alloc).map(([key, val]) => ({
      name: labels[key as keyof typeof labels] || key,
      value: +val.toFixed(2),
    })).sort((a, b) => b.value - a.value)

  return (
    <div className="detail-screen">
      <div className="detail-bg-glow detail-bg-glow--1" />
      <div className="detail-bg-glow detail-bg-glow--2" />
      <div className={`detail-content ${visible ? 'detail-content--visible' : ''}`}>
        <div className="detail-header">
          <GlassIconButton icon={<ArrowLeft size={20} />} onClick={() => navigate(-1)} size={44} />
        </div>

        <GlassContainer>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Shield size={24} style={{ color: 'var(--brand-primary)' }} />
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>Risk Analysis</h1>
          </div>

          <div className="tab-bar">
            <button className={`tab-btn ${tab === 'overview' ? 'tab-btn--active' : ''}`} onClick={() => setTab('overview')}>Overview</button>
            <button className={`tab-btn ${tab === 'volatility' ? 'tab-btn--active' : ''}`} onClick={() => setTab('volatility')}>Volatility</button>
            <button className={`tab-btn ${tab === 'exposure' ? 'tab-btn--active' : ''}`} onClick={() => setTab('exposure')}>Exposure</button>
            <button className={`tab-btn ${tab === 'scenarios' ? 'tab-btn--active' : ''}`} onClick={() => setTab('scenarios')}>Scenarios</button>
          </div>

          {!risk ? (
            <p style={{ color: 'var(--text-tertiary)', textAlign: 'center', padding: 40 }}>Add assets to your portfolio to see risk analysis.</p>
          ) : (
            <>
              {tab === 'overview' && (
                <>
                  <div className="risk-score-large">
                    <svg width="160" height="160" viewBox="0 0 160 160" className="risk-score-svg">
                      <circle cx="80" cy="80" r="68" fill="none" stroke="var(--glass-border)" strokeWidth="10" />
                      <circle
                        cx="80" cy="80" r="68" fill="none"
                        stroke={riskLevelColor(risk.riskLevel)}
                        strokeWidth="10" strokeLinecap="round"
                        strokeDasharray={2 * Math.PI * 68}
                        strokeDashoffset={2 * Math.PI * 68 * (1 - risk.riskScore / 100)}
                        transform="rotate(-90 80 80)"
                        style={{ transition: 'stroke-dashoffset 1s ease' }}
                      />
                    </svg>
                    <div className="risk-score-large__value">{risk.riskScore}</div>
                    <div className="risk-score-large__label" style={{ color: riskLevelColor(risk.riskLevel), textTransform: 'capitalize' }}>
                      {risk.riskLevel.replace('_', ' ')} Risk
                    </div>
                  </div>

                  <div className="stats-grid">
                    <div className="stat-card">
                      <div className="stat-card__label">Diversification</div>
                      <div className="stat-card__value">{risk.diversificationScore}/100</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-card__label">Liquidity</div>
                      <div className="stat-card__value">{risk.liquidityScore}%</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-card__label">Concentration</div>
                      <div className="stat-card__value">{risk.concentrationRisk}%</div>
                    </div>
                  </div>

                  <div className="detail-section">
                    <div className="detail-section-title">Recommendations</div>
                    {risk.recommendations.map((r, i) => (
                      <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 8, padding: '8px 0' }}>
                        <AlertTriangle size={16} style={{ color: 'var(--status-warning)', flexShrink: 0, marginTop: 2 }} />
                        <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{r}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {tab === 'volatility' && (
                <>
                  <div className="stats-grid">
                    <div className="stat-card">
                      <div className="stat-card__label">Annualized Vol.</div>
                      <div className="stat-card__value">{risk.annualizedVolatility}%</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-card__label">Sharpe Ratio</div>
                      <div className="stat-card__value">{risk.sharpeRatio}</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-card__label">Max Drawdown</div>
                      <div className="stat-card__value" style={{ color: 'var(--status-error)' }}>{risk.maxDrawdown}%</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-card__label">Beta</div>
                      <div className="stat-card__value">{risk.beta}</div>
                    </div>
                  </div>

                  <div className="detail-section-title" style={{ marginTop: 16 }}>Historical Volatility (52 weeks)</div>
                  <div style={{ width: '100%', height: 200 }}>
                    <ResponsiveContainer>
                      <AreaChart data={volData}>
                        <XAxis dataKey="week" tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} interval={7} />
                        <YAxis hide />
                        <Tooltip contentStyle={{ background: 'var(--glass-bg-strong)', border: '1px solid var(--glass-border)', borderRadius: 10, fontSize: 12 }} />
                        <Area type="monotone" dataKey="volatility" stroke="var(--status-warning)" fill="rgba(245,158,11,0.15)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </>
              )}

              {tab === 'exposure' && (
                <>
                  {[
                    { title: 'Sector Exposure', data: pieData(sectorAlloc, SECTOR_LABELS as Record<string, string>) },
                    { title: 'Asset Type Breakdown', data: pieData(typeAlloc, ASSET_TYPE_LABELS as Record<string, string>) },
                    { title: 'Geographic Exposure', data: pieData(countryAlloc, {} as Record<string, string>) },
                  ].map(({ title, data }) => (
                    <div key={title} className="detail-section">
                      <div className="detail-section-title">{title}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                        <div style={{ width: 180, height: 180 }}>
                          <ResponsiveContainer>
                            <PieChart>
                              <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} innerRadius={40}>
                                {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                              </Pie>
                              <Tooltip contentStyle={{ background: 'var(--glass-bg-strong)', border: '1px solid var(--glass-border)', borderRadius: 10, fontSize: 12 }}
                                formatter={(v: number) => [fmt(v), 'Value']} />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {data.map((d, i) => (
                            <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                              <div style={{ width: 10, height: 10, borderRadius: 3, background: CHART_COLORS[i % CHART_COLORS.length], flexShrink: 0 }} />
                              <span style={{ color: 'var(--text-secondary)', flex: 1 }}>{d.name}</span>
                              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{fmt(d.value)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )}

              {tab === 'scenarios' && (
                <>
                  <div className="detail-section-title">Stress Test Scenarios</div>
                  <div style={{ width: '100%', height: 220, marginBottom: 24 }}>
                    <ResponsiveContainer>
                      <BarChart data={scenarios} layout="vertical">
                        <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false}
                          tickFormatter={(v: number) => `${v > 0 ? '+' : ''}${v}%`} />
                        <YAxis dataKey="name" type="category" width={140} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={{ background: 'var(--glass-bg-strong)', border: '1px solid var(--glass-border)', borderRadius: 10, fontSize: 12 }} />
                        <Bar dataKey="impactPercent" radius={[0, 6, 6, 0]}>
                          {scenarios.map((s, i) => (
                            <Cell key={i} fill={s.impactPercent >= 0 ? 'var(--status-success)' : 'var(--status-error)'} opacity={0.8} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {scenarios.map((s, i) => (
                    <div key={i} className="scenario-card">
                      <div className="scenario-card__name">{s.name}</div>
                      <div className="scenario-card__desc">{s.description}</div>
                      <div className="scenario-card__impact" style={{ color: s.impact >= 0 ? 'var(--status-success)' : 'var(--status-error)' }}>
                        {s.impact >= 0 ? '+' : ''}{fmt(s.impact)} ({s.impactPercent > 0 ? '+' : ''}{s.impactPercent}%)
                      </div>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </GlassContainer>
      </div>
    </div>
  )
}

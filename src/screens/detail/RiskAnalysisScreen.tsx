import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Shield, AlertTriangle, TrendingUp, TrendingDown,
  Droplets, BarChart3, Target, ArrowUpRight, ArrowDownRight,
  Layers, Globe, PieChart as PieIcon, RefreshCw, Info, FileDown, MapPin,
} from 'lucide-react'
import {
  PieChart, Pie, Cell, ResponsiveContainer, AreaChart, Area,
  XAxis, YAxis, Tooltip, BarChart, Bar, RadarChart, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis, Radar,
} from 'recharts'
import GlassContainer from '../../components/glass/GlassContainer'
import GlassIconButton from '../../components/glass/GlassIconButton'
import { usePortfolio } from '../../store/usePortfolio'
import { analyzePortfolio } from '../../services/riskAnalysis'
import { generateRiskReportPdf } from '../../services/riskReportPdf'
import WorldMap from '../../components/WorldMap'
import type { RiskAnalysisResult, Asset, ScenarioSeverity, SuggestionPriority } from '../../types'
import {
  assetCurrentValue, portfolioAllocationBySector, portfolioAllocationByCountry,
  portfolioAllocationByType, SECTOR_LABELS, ASSET_TYPE_LABELS,
} from '../../types'z
import './DetailScreen.css'
import './RiskAnalysisScreen.css'

const CHART_COLORS = ['#6366f1', '#8b5cf6', '#a78bfa', '#c084fc', '#06b6d4', '#14b8a6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#64748b', '#84cc16']

const RISK_LEVEL_META: Record<string, { color: string; label: string; desc: string }> = {
  conservative: { color: '#10b981', label: 'Conservative', desc: 'Low risk tolerance with focus on capital preservation' },
  moderate:     { color: '#6366f1', label: 'Moderate',     desc: 'Balanced approach between growth and stability' },
  growth:       { color: '#f59e0b', label: 'Growth',       desc: 'Higher risk tolerance for potential growth' },
  aggressive:   { color: '#ef4444', label: 'Aggressive',   desc: 'High risk tolerance with focus on maximum returns' },
}

const VOL_LEVEL_META: Record<string, { color: string; label: string }> = {
  low: { color: '#10b981', label: 'Low' }, moderate: { color: '#6366f1', label: 'Moderate' },
  high: { color: '#f59e0b', label: 'High' }, very_high: { color: '#ef4444', label: 'Very High' },
}

const SHARPE_META: Record<string, { color: string; label: string; desc: string }> = {
  poor:          { color: '#ef4444', label: 'Poor',          desc: 'Returns do not justify the risk taken' },
  below_average: { color: '#f59e0b', label: 'Below Average', desc: 'Below market average risk-adjusted returns' },
  average:       { color: '#6366f1', label: 'Average',       desc: 'Market average risk-adjusted returns' },
  good:          { color: '#06b6d4', label: 'Good',          desc: 'Good risk-adjusted returns' },
  excellent:     { color: '#10b981', label: 'Excellent',     desc: 'Excellent risk-adjusted returns' },
}

const LIQ_LABEL: Record<string, string> = {
  immediate: 'Immediate (0-1 day)', short_term: 'Short-term (1-7 days)',
  medium_term: 'Medium-term (1-4 wks)', long_term: 'Long-term (1+ months)',
}
const LIQ_COLOR: Record<string, string> = { immediate: '#10b981', short_term: '#06b6d4', medium_term: '#f59e0b', long_term: '#ef4444' }

const SEVERITY_META: Record<ScenarioSeverity, { color: string; bg: string }> = {
  mild:     { color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  moderate: { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  severe:   { color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  extreme:  { color: '#dc2626', bg: 'rgba(220,38,38,0.15)' },
}

const PRIORITY_META: Record<SuggestionPriority, { color: string; bg: string }> = {
  high:   { color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  medium: { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  low:    { color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
}

const fmt = (n: number) => '$' + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function generateVolHistory(score: number) {
  const data = []
  let v = score
  for (let i = 0; i < 52; i++) {
    v += (Math.random() - 0.48) * 4
    v = Math.max(5, Math.min(50, v))
    data.push({ week: `W${i + 1}`, vol: +v.toFixed(1) })
  }
  return data
}

// Country code → emoji flag
const COUNTRY_TO_ISO2: Record<string, string> = {
  US: 'US', USA: 'US', 'United States': 'US', UK: 'GB', 'United Kingdom': 'GB', GB: 'GB',
  Germany: 'DE', DE: 'DE', France: 'FR', FR: 'FR', Japan: 'JP', JP: 'JP',
  China: 'CN', CN: 'CN', India: 'IN', IN: 'IN', Australia: 'AU', AU: 'AU',
  Canada: 'CA', CA: 'CA', Brazil: 'BR', BR: 'BR', 'South Korea': 'KR', KR: 'KR',
  Switzerland: 'CH', CH: 'CH', Netherlands: 'NL', NL: 'NL', Italy: 'IT', IT: 'IT',
  Spain: 'ES', ES: 'ES', Sweden: 'SE', SE: 'SE', Norway: 'NO', NO: 'NO',
  Denmark: 'DK', DK: 'DK', Finland: 'FI', FI: 'FI', Ireland: 'IE', IE: 'IE',
  Taiwan: 'TW', TW: 'TW', Singapore: 'SG', SG: 'SG', 'Hong Kong': 'HK', HK: 'HK',
  'New Zealand': 'NZ', NZ: 'NZ', 'South Africa': 'ZA', ZA: 'ZA', Mexico: 'MX', MX: 'MX',
  Argentina: 'AR', AR: 'AR', 'Saudi Arabia': 'SA', SA: 'SA', UAE: 'AE', AE: 'AE',
  Israel: 'IL', IL: 'IL', Russia: 'RU', RU: 'RU', Poland: 'PL', PL: 'PL',
  Belgium: 'BE', BE: 'BE', Austria: 'AT', AT: 'AT', Global: 'UN',
}

function countryFlag(name: string): string {
  const iso2 = COUNTRY_TO_ISO2[name] || COUNTRY_TO_ISO2[name.toUpperCase()]
  if (!iso2) return '🌍'
  return iso2.split('').map(c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)).join('')
}

export default function RiskAnalysisScreen() {
  const navigate = useNavigate()
  const { portfolio, totalValue, totalGainLossPercent } = usePortfolio()
  const [visible, setVisible] = useState(false)
  const [tab, setTab] = useState<'overview' | 'volatility' | 'scenarios' | 'exposure'>('overview')
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [selectedCountry, setSelectedCountry] = useState<{ name: string; pct: number } | null>(null)

  useEffect(() => { requestAnimationFrame(() => setVisible(true)) }, [])

  const assets: Asset[] = portfolio?.assets ?? []
  const risk = useMemo(() => analyzePortfolio(assets, totalValue, totalGainLossPercent), [assets, totalValue, totalGainLossPercent])
  const volHistory = useMemo(() => risk ? generateVolHistory(risk.annualizedVolatility) : [], [risk])

  const sectorAlloc = useMemo(() => portfolio ? portfolioAllocationBySector(portfolio) : {}, [portfolio])
  const countryAlloc = useMemo(() => portfolio ? portfolioAllocationByCountry(portfolio) : {}, [portfolio])
  const typeAlloc = useMemo(() => portfolio ? portfolioAllocationByType(portfolio) : {}, [portfolio])

  // Country allocation as percentage (for the world map)
  const countryPct = useMemo(() => {
    const result: Record<string, number> = {}
    if (totalValue > 0) {
      for (const [k, v] of Object.entries(countryAlloc)) {
        result[k] = (v / totalValue) * 100
      }
    }
    return result
  }, [countryAlloc, totalValue])

  const handleExportPdf = () => {
    if (!risk || !portfolio) return
    setGeneratingPdf(true)
    // Small timeout so the loading state renders
    setTimeout(() => {
      try {
        generateRiskReportPdf({
          risk, assets, totalValue, totalGainLossPercent,
          portfolioName: portfolio.name || 'My Portfolio',
          sectorAlloc, countryAlloc, typeAlloc,
        })
      } finally {
        setGeneratingPdf(false)
      }
    }, 100)
  }

  const pieData = (alloc: Record<string, number>, labels: Record<string, string>) =>
    Object.entries(alloc).map(([k, v]) => ({ name: labels[k as keyof typeof labels] || k, value: +v.toFixed(2) })).sort((a, b) => b.value - a.value)

  // Radar data for overview
  const radarData = risk ? [
    { metric: 'Diversification', value: risk.diversificationScore },
    { metric: 'Liquidity', value: risk.liquidityScore },
    { metric: 'Stability', value: Math.max(0, 100 - risk.annualizedVolatility * 2) },
    { metric: 'Risk-Adj Return', value: Math.max(0, Math.min(100, (risk.sharpeRatio + 1) * 25)) },
    { metric: 'Concentration', value: Math.max(0, 100 - risk.concentrationIndex * 100) },
  ] : []

  const rlm = risk ? RISK_LEVEL_META[risk.riskLevel] : null

  if (!risk) {
    return (
      <div className="risk-page">
        <div className="risk-page__header">
          <GlassIconButton icon={<ArrowLeft size={20} />} onClick={() => navigate(-1)} size={44} />
          <h1 className="risk-page__title"><Shield size={22} /> Risk Analysis</h1>
        </div>
        <GlassContainer padding="48px" borderRadius={20} className="risk-empty">
          <Shield size={48} style={{ color: 'var(--text-tertiary)' }} />
          <h2>No Portfolio Data</h2>
          <p>Add assets to see a comprehensive risk analysis.</p>
        </GlassContainer>
      </div>
    )
  }

  return (
    <div className="risk-page">
      <div className={`risk-page__inner ${visible ? 'risk-page__inner--visible' : ''}`}>
        {/* Header */}
        <div className="risk-page__header">
          <GlassIconButton icon={<ArrowLeft size={20} />} onClick={() => navigate(-1)} size={44} />
          <h1 className="risk-page__title"><Shield size={22} /> Risk Analysis</h1>
          <div className="risk-page__header-right">
            <button className="risk-export-btn" onClick={handleExportPdf} disabled={generatingPdf}>
              <FileDown size={16} />
              {generatingPdf ? 'Generating...' : 'Export PDF'}
            </button>
          </div>
        </div>

        {/* Risk Score Hero */}
        <GlassContainer padding="32px" borderRadius={20} className="risk-hero">
          <div className="risk-hero__ring">
            <svg width="180" height="180" viewBox="0 0 180 180">
              <circle cx="90" cy="90" r="76" fill="none" stroke="var(--glass-border)" strokeWidth="10" />
              <circle cx="90" cy="90" r="76" fill="none" stroke={rlm!.color} strokeWidth="10" strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 76} strokeDashoffset={2 * Math.PI * 76 * (1 - risk.riskScore / 100)}
                transform="rotate(-90 90 90)" style={{ transition: 'stroke-dashoffset 1.2s ease' }} />
            </svg>
            <div className="risk-hero__score">{risk.riskScore}</div>
          </div>
          <div className="risk-hero__info">
            <span className="risk-hero__badge" style={{ background: rlm!.color }}>{rlm!.label}</span>
            <p className="risk-hero__desc">{rlm!.desc}</p>
            <div className="risk-hero__mini-stats">
              <div><span>Sharpe</span><strong>{risk.sharpeRatio}</strong></div>
              <div><span>Volatility</span><strong>{risk.annualizedVolatility}%</strong></div>
              <div><span>Max DD</span><strong>-{risk.maxDrawdownPercent}%</strong></div>
            </div>
          </div>
        </GlassContainer>

        {/* Tabs */}
        <div className="risk-tabs">
          {(['overview', 'volatility', 'scenarios', 'exposure'] as const).map(t => (
            <button key={t} className={`risk-tab ${tab === t ? 'risk-tab--active' : ''}`} onClick={() => setTab(t)}>
              {t === 'overview' && <BarChart3 size={15} />}
              {t === 'volatility' && <TrendingUp size={15} />}
              {t === 'scenarios' && <AlertTriangle size={15} />}
              {t === 'exposure' && <Globe size={15} />}
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* ═══════ OVERVIEW TAB ═══════ */}
        {tab === 'overview' && (
          <div className="risk-tab-content">
            {/* Info banner */}
            <div className="risk-info-banner">
              <Info size={16} />
              <span>Risk metrics are calculated based on asset-class historical data and your portfolio composition. They are indicative and not investment advice.</span>
            </div>

            {/* Key Metrics Grid */}
            <div className="risk-metrics-grid">
              <GlassContainer padding="20px" borderRadius={16} className="risk-metric-card">
                <div className="risk-metric-card__icon" style={{ background: 'rgba(99,102,241,0.15)', color: '#6366f1' }}><Target size={20} /></div>
                <div className="risk-metric-card__label">Sharpe Ratio</div>
                <div className="risk-metric-card__value">{risk.sharpeRatio}</div>
                <div className="risk-metric-card__sub" style={{ color: SHARPE_META[risk.sharpeRating].color }}>{SHARPE_META[risk.sharpeRating].label}</div>
              </GlassContainer>
              <GlassContainer padding="20px" borderRadius={16} className="risk-metric-card">
                <div className="risk-metric-card__icon" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}><TrendingDown size={20} /></div>
                <div className="risk-metric-card__label">Max Drawdown</div>
                <div className="risk-metric-card__value">-{risk.maxDrawdownPercent}%</div>
                <div className="risk-metric-card__sub">{fmt(risk.maxDrawdown)}</div>
              </GlassContainer>
              <GlassContainer padding="20px" borderRadius={16} className="risk-metric-card">
                <div className="risk-metric-card__icon" style={{ background: 'rgba(6,182,212,0.15)', color: '#06b6d4' }}><Droplets size={20} /></div>
                <div className="risk-metric-card__label">Liquidity Score</div>
                <div className="risk-metric-card__value">{risk.liquidityScore}/100</div>
                <div className="risk-metric-card__sub">{risk.liquidityLevel.replace('_', ' ')}</div>
              </GlassContainer>
              <GlassContainer padding="20px" borderRadius={16} className="risk-metric-card">
                <div className="risk-metric-card__icon" style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981' }}><Layers size={20} /></div>
                <div className="risk-metric-card__label">Diversification</div>
                <div className="risk-metric-card__value">{risk.diversificationScore}/100</div>
                <div className="risk-metric-card__sub">HHI: {risk.concentrationIndex.toFixed(2)}</div>
              </GlassContainer>
            </div>

            {/* Concentration Warnings */}
            {risk.concentrationWarnings.length > 0 && (
              <GlassContainer padding="20px" borderRadius={16}>
                <h3 className="risk-section-title"><AlertTriangle size={16} style={{ color: 'var(--status-warning)' }} /> Concentration Warnings</h3>
                <div className="risk-warnings">
                  {risk.concentrationWarnings.map((w, i) => (
                    <div key={i} className={`risk-warning risk-warning--${w.type}`}>
                      <AlertTriangle size={14} />
                      <span>{w.message}</span>
                      {w.percentage > 0 && <span className="risk-warning__pct">{w.percentage.toFixed(0)}%</span>}
                    </div>
                  ))}
                </div>
              </GlassContainer>
            )}

            {/* Radar + Risk Contribution row */}
            <div className="risk-two-col">
              <GlassContainer padding="20px" borderRadius={16}>
                <h3 className="risk-section-title">Portfolio Health</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="var(--glass-border)" />
                    <PolarAngleAxis dataKey="metric" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                    <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                    <Radar dataKey="value" stroke="#6366f1" fill="#6366f1" fillOpacity={0.2} strokeWidth={2} />
                  </RadarChart>
                </ResponsiveContainer>
              </GlassContainer>

              <GlassContainer padding="20px" borderRadius={16}>
                <h3 className="risk-section-title">Risk Contribution by Type</h3>
                <div className="risk-contrib-list">
                  {Object.entries(risk.riskContributionByType).sort(([,a],[,b]) => b - a).map(([type, pct], i) => (
                    <div key={type} className="risk-contrib-row">
                      <div className="risk-contrib-row__dot" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                      <span className="risk-contrib-row__label">{type}</span>
                      <div className="risk-contrib-row__bar-bg">
                        <div className="risk-contrib-row__bar" style={{ width: `${pct}%`, background: CHART_COLORS[i % CHART_COLORS.length] }} />
                      </div>
                      <span className="risk-contrib-row__pct">{pct}%</span>
                    </div>
                  ))}
                </div>
              </GlassContainer>
            </div>

            {/* Benchmark Comparison */}
            <GlassContainer padding="24px" borderRadius={16}>
              <h3 className="risk-section-title"><BarChart3 size={16} /> Benchmark Comparison — {risk.benchmarkComparison.benchmarkName}</h3>
              <div className="bench-grid">
                <div className="bench-col">
                  <div className="bench-col__header">Your Portfolio</div>
                  <div className="bench-stat"><span>Return</span><strong style={{ color: risk.benchmarkComparison.portfolioReturn >= 0 ? 'var(--status-success)' : 'var(--status-error)' }}>{risk.benchmarkComparison.portfolioReturn >= 0 ? '+' : ''}{risk.benchmarkComparison.portfolioReturn}%</strong></div>
                  <div className="bench-stat"><span>Volatility</span><strong>{risk.benchmarkComparison.portfolioVolatility}%</strong></div>
                  <div className="bench-stat"><span>Sharpe</span><strong>{risk.benchmarkComparison.portfolioSharpe}</strong></div>
                </div>
                <div className="bench-vs">VS</div>
                <div className="bench-col">
                  <div className="bench-col__header">{risk.benchmarkComparison.benchmarkName}</div>
                  <div className="bench-stat"><span>Return</span><strong>+{risk.benchmarkComparison.benchmarkReturn}%</strong></div>
                  <div className="bench-stat"><span>Volatility</span><strong>{risk.benchmarkComparison.benchmarkVolatility}%</strong></div>
                  <div className="bench-stat"><span>Sharpe</span><strong>{risk.benchmarkComparison.benchmarkSharpe}</strong></div>
                </div>
              </div>
              <div className="bench-verdict">{risk.benchmarkComparison.verdict}</div>
            </GlassContainer>

            {/* Top Risk Contributors */}
            <GlassContainer padding="20px" borderRadius={16}>
              <h3 className="risk-section-title">Top Risk Contributors</h3>
              <div className="risk-top-list">
                {risk.topRiskContributors.map((c, i) => (
                  <div key={i} className="risk-top-row">
                    <span className="risk-top-row__rank">#{i + 1}</span>
                    <div className="risk-top-row__info">
                      <span className="risk-top-row__name">{c.assetName}</span>
                      <span className="risk-top-row__sub">{c.symbol || c.type} &middot; {c.portfolioWeight}% weight</span>
                    </div>
                    <div className="risk-top-row__bar-bg">
                      <div className="risk-top-row__bar" style={{ width: `${c.riskContribution}%`, background: c.riskContribution > 30 ? '#ef4444' : c.riskContribution > 15 ? '#f59e0b' : '#6366f1' }} />
                    </div>
                    <span className="risk-top-row__pct">{c.riskContribution}%</span>
                  </div>
                ))}
              </div>
            </GlassContainer>

            {/* Rebalancing Suggestions */}
            {risk.rebalancingSuggestions.length > 0 && (
              <GlassContainer padding="20px" borderRadius={16}>
                <h3 className="risk-section-title"><RefreshCw size={16} /> Rebalancing Suggestions</h3>
                <div className="risk-suggestions">
                  {risk.rebalancingSuggestions.map((s, i) => (
                    <div key={i} className="risk-suggestion">
                      <div className="risk-suggestion__action" style={{ background: s.action === 'buy' ? 'rgba(16,185,129,0.15)' : s.action === 'sell' ? 'rgba(239,68,68,0.15)' : 'rgba(99,102,241,0.15)', color: s.action === 'buy' ? '#10b981' : s.action === 'sell' ? '#ef4444' : '#6366f1' }}>
                        {s.action === 'buy' ? <ArrowUpRight size={14} /> : s.action === 'sell' ? <ArrowDownRight size={14} /> : <RefreshCw size={14} />}
                        {s.action.toUpperCase()}
                      </div>
                      <div className="risk-suggestion__info">
                        <strong>{s.assetType}</strong>
                        <span>{s.currentPercent}% → {s.targetPercent}%</span>
                      </div>
                      <div className="risk-suggestion__reason">{s.reason}</div>
                      <span className="risk-suggestion__badge" style={{ background: PRIORITY_META[s.priority].bg, color: PRIORITY_META[s.priority].color }}>{s.priority}</span>
                    </div>
                  ))}
                </div>
              </GlassContainer>
            )}
          </div>
        )}

        {/* ═══════ VOLATILITY TAB ═══════ */}
        {tab === 'volatility' && (
          <div className="risk-tab-content">
            {/* Volatility Overview */}
            <GlassContainer padding="24px" borderRadius={16}>
              <h3 className="risk-section-title">Volatility Overview</h3>
              <div className="vol-hero">
                <div className="vol-gauge">
                  <svg width="140" height="140" viewBox="0 0 140 140">
                    <circle cx="70" cy="70" r="58" fill="none" stroke="var(--glass-border)" strokeWidth="8" />
                    <circle cx="70" cy="70" r="58" fill="none" stroke={VOL_LEVEL_META[risk.volatilityLevel].color}
                      strokeWidth="8" strokeLinecap="round"
                      strokeDasharray={2 * Math.PI * 58} strokeDashoffset={2 * Math.PI * 58 * (1 - Math.min(risk.annualizedVolatility / 60, 1))}
                      transform="rotate(-90 70 70)" style={{ transition: 'stroke-dashoffset 1s ease' }} />
                  </svg>
                  <div className="vol-gauge__val">{risk.annualizedVolatility}%</div>
                  <div className="vol-gauge__label" style={{ color: VOL_LEVEL_META[risk.volatilityLevel].color }}>{VOL_LEVEL_META[risk.volatilityLevel].label}</div>
                </div>
                <div className="vol-stats">
                  <div className="vol-stat"><span>Daily Volatility</span><strong>{risk.volatility}%</strong></div>
                  <div className="vol-stat"><span>Annualized</span><strong>{risk.annualizedVolatility}%</strong></div>
                  <div className="vol-stat"><span>VIX Equivalent</span><strong>{(risk.annualizedVolatility * 0.8).toFixed(1)}</strong></div>
                </div>
              </div>
            </GlassContainer>

            {/* Sharpe Ratio Scale */}
            <GlassContainer padding="24px" borderRadius={16}>
              <h3 className="risk-section-title">Sharpe Ratio — {risk.sharpeRatio}</h3>
              <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 16 }}>{SHARPE_META[risk.sharpeRating].desc}</p>
              <div className="sharpe-scale">
                {Object.entries(SHARPE_META).map(([key, meta]) => (
                  <div key={key} className={`sharpe-tier ${risk.sharpeRating === key ? 'sharpe-tier--active' : ''}`} style={{ borderColor: risk.sharpeRating === key ? meta.color : 'var(--glass-border)' }}>
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
                <div className="dd-big" style={{ color: 'var(--status-error)' }}>-{risk.maxDrawdownPercent}%</div>
                <div className="dd-amount">{fmt(risk.maxDrawdown)}</div>
              </div>
              <div className="dd-bar-bg">
                <div className="dd-bar" style={{ width: `${Math.min(risk.maxDrawdownPercent, 100)}%` }} />
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
                  <Tooltip contentStyle={{ background: 'var(--glass-bg-strong)', border: '1px solid var(--glass-border)', borderRadius: 10, fontSize: 12 }} formatter={(v: number) => [`${v}%`, 'Volatility']} />
                  <Area type="monotone" dataKey="vol" stroke="#f59e0b" fill="rgba(245,158,11,0.12)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </GlassContainer>

            {/* High Correlations */}
            {risk.highCorrelations.length > 0 && (
              <GlassContainer padding="20px" borderRadius={16}>
                <h3 className="risk-section-title">High Correlations</h3>
                <div className="corr-list">
                  {risk.highCorrelations.map((c, i) => (
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
                {Object.entries(risk.liquidityBreakdown).filter(([,v]) => v > 0).sort(([,a],[,b]) => b - a).map(([cat, pct]) => (
                  <div key={cat} className="liq-row">
                    <span className="liq-row__label">{LIQ_LABEL[cat] || cat}</span>
                    <div className="liq-row__bar-bg"><div className="liq-row__bar" style={{ width: `${pct}%`, background: LIQ_COLOR[cat] || '#6366f1' }} /></div>
                    <span className="liq-row__pct">{pct.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </GlassContainer>
          </div>
        )}

        {/* ═══════ SCENARIOS TAB ═══════ */}
        {tab === 'scenarios' && (
          <div className="risk-tab-content">
            <div className="risk-info-banner">
              <Info size={16} />
              <span>Stress tests model how your portfolio might react to different economic scenarios based on historical asset-class behavior.</span>
            </div>

            {/* Bar Chart */}
            <GlassContainer padding="24px" borderRadius={16}>
              <h3 className="risk-section-title">Impact Overview</h3>
              <ResponsiveContainer width="100%" height={Math.max(180, risk.scenarioAnalysis.length * 44)}>
                <BarChart data={risk.scenarioAnalysis} layout="vertical">
                  <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v > 0 ? '+' : ''}${v}%`} />
                  <YAxis dataKey="name" type="category" width={130} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: 'var(--glass-bg-strong)', border: '1px solid var(--glass-border)', borderRadius: 10, fontSize: 12 }}
                    formatter={(v: number) => [`${v > 0 ? '+' : ''}${v}%`, 'Impact']} />
                  <Bar dataKey="impactPercent" radius={[0, 6, 6, 0]}>
                    {risk.scenarioAnalysis.map((s, i) => (
                      <Cell key={i} fill={s.impactPercent >= 0 ? '#10b981' : '#ef4444'} opacity={0.8} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </GlassContainer>

            {/* Scenario Cards */}
            <div className="scenario-cards">
              {risk.scenarioAnalysis.map((s, i) => (
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
        )}

        {/* ═══════ EXPOSURE TAB ═══════ */}
        {tab === 'exposure' && (
          <div className="risk-tab-content">
            {/* Interactive World Map */}
            <GlassContainer padding="24px" borderRadius={16}>
              <h3 className="risk-section-title"><Globe size={16} /> Geographic Exposure</h3>
              <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 16 }}>
                Hover over countries to see your allocation. Click a highlighted country for details.
              </p>
              <WorldMap
                countryExposure={countryPct}
                totalValue={totalValue}
                onCountryClick={(name, pct) => setSelectedCountry({ name, pct })}
              />
              {selectedCountry && (
                <div className="map-country-detail">
                  <MapPin size={16} />
                  <strong>{selectedCountry.name}</strong>
                  <span>{selectedCountry.pct.toFixed(1)}% of portfolio</span>
                  <span className="map-country-detail__val">
                    {fmt((selectedCountry.pct / 100) * totalValue)}
                  </span>
                  <button className="map-country-detail__close" onClick={() => setSelectedCountry(null)}>&times;</button>
                </div>
              )}
            </GlassContainer>

            {/* Country Breakdown List */}
            <GlassContainer padding="24px" borderRadius={16}>
              <h3 className="risk-section-title">Country Breakdown</h3>
              <div className="country-breakdown">
                {Object.entries(countryPct).sort(([,a],[,b]) => b - a).map(([country, pct]) => (
                  <div key={country} className="country-row">
                    <span className="country-row__flag">{countryFlag(country)}</span>
                    <span className="country-row__name">{country}</span>
                    <div className="country-row__bar-bg">
                      <div className="country-row__bar" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="country-row__pct">{pct.toFixed(1)}%</span>
                    <span className="country-row__val">{fmt((pct / 100) * totalValue)}</span>
                  </div>
                ))}
              </div>
            </GlassContainer>

            {/* Sector + Type pie charts */}
            {[
              { title: 'Sector Exposure', icon: <PieIcon size={16} />, data: pieData(sectorAlloc, SECTOR_LABELS as Record<string, string>) },
              { title: 'Asset Type Breakdown', icon: <Layers size={16} />, data: pieData(typeAlloc, ASSET_TYPE_LABELS as Record<string, string>) },
            ].map(({ title, icon, data }) => (
              <GlassContainer key={title} padding="24px" borderRadius={16}>
                <h3 className="risk-section-title">{icon} {title}</h3>
                <div className="exposure-row">
                  <div className="exposure-chart">
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={45}>
                          {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                        </Pie>
                        <Tooltip contentStyle={{ background: 'var(--glass-bg-strong)', border: '1px solid var(--glass-border)', borderRadius: 10, fontSize: 12 }}
                          formatter={(v: number) => [fmt(v), 'Value']} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="exposure-legend">
                    {data.map((d, i) => (
                      <div key={d.name} className="exposure-legend__item">
                        <div className="exposure-legend__dot" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                        <span className="exposure-legend__name">{d.name}</span>
                        <span className="exposure-legend__val">{fmt(d.value)}</span>
                        <span className="exposure-legend__pct">{totalValue > 0 ? ((d.value / totalValue) * 100).toFixed(1) : 0}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </GlassContainer>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

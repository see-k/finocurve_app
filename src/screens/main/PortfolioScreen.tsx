import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
  Sankey, Rectangle, Layer,
  ComposedChart, Line,
} from 'recharts'
import {
  ArrowUpRight, ArrowDownRight, Plus, Briefcase, ChevronRight, GitBranch,
} from 'lucide-react'
import GlassContainer from '../../components/glass/GlassContainer'
import GlassButton from '../../components/glass/GlassButton'
import AssetLogo from '../../components/AssetLogo'
import { usePortfolio } from '../../store/usePortfolio'
import { usePortfolioValueHistory } from '../../store/usePortfolioValueHistory'
import { useHistoricalPrices } from '../../hooks/useHistoricalPrices'
import { getPerformanceChartData } from '../../utils/performanceChartData'
import { augmentSeriesWithLinearTrend } from '../../lib/chartTrendForecast'
import type { PerformancePeriod, Asset } from '../../types'
import {
  assetCurrentValue, assetGainLossPercent, isLoan,
  ASSET_TYPE_LABELS, ASSET_TYPE_ICONS, SECTOR_LABELS,
  portfolioAllocationByType, portfolioAllocationBySector, portfolioAllocationByCountry,
} from '../../types'
import './PortfolioScreen.css'

const PORTFOLIO_BG = 'https://images.unsplash.com/photo-1515266591878-f93e32bc5937?q=80&w=1287&auto=format&fit=crop'

const COLORS = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#a78bfa', '#ec4899', '#64748b', '#84cc16']
const periods: PerformancePeriod[] = ['1D', '1W', '1M', '1Y']

export default function PortfolioScreen() {
  const navigate = useNavigate()
  const { portfolio, totalValue, totalCost, totalGainLoss, totalGainLossPercent, loadDemo } = usePortfolio()

  const [selectedPeriod, setSelectedPeriod] = useState<PerformancePeriod>('1M')
  const [allocView, setAllocView] = useState<'type' | 'sector' | 'country'>('type')
  const [showAddModal, setShowAddModal] = useState(false)
  const [selectedSankeyNode, setSelectedSankeyNode] = useState<number | null>(null)

  const hasAssets = portfolio && portfolio.assets.length > 0
  const nonLoanAssets = portfolio?.assets.filter(a => !isLoan(a)) || []
  const loanAssets = portfolio?.assets.filter(a => isLoan(a)) || []
  const totalInvestableValue = nonLoanAssets.reduce((s, a) => s + assetCurrentValue(a), 0)

  const { history } = usePortfolioValueHistory(totalValue, totalInvestableValue, !!hasAssets)
  const { data: historicalApiData, loading: historicalLoading } = useHistoricalPrices(
    portfolio?.assets ?? [],
    selectedPeriod,
    totalValue,
    !!hasAssets && !!window.electronAPI?.priceHistorical
  )
  const { data: chartData, hasRealData } = useMemo(
    () => getPerformanceChartData(history, totalValue, selectedPeriod, historicalApiData),
    [history, totalValue, selectedPeriod, historicalApiData]
  )

  const chartDataWithTrend = useMemo(
    () =>
      augmentSeriesWithLinearTrend(chartData, {
        forecastSteps: 4,
        minPoints: 3,
      }),
    [chartData]
  )

  const allocData = useMemo(() => {
    if (!hasAssets || !portfolio) return []
    let alloc: Record<string, number>
    let labels: Record<string, string>
    if (allocView === 'type') {
      alloc = portfolioAllocationByType(portfolio)
      labels = ASSET_TYPE_LABELS as Record<string, string>
    } else if (allocView === 'sector') {
      alloc = portfolioAllocationBySector(portfolio)
      labels = SECTOR_LABELS as Record<string, string>
    } else {
      alloc = portfolioAllocationByCountry(portfolio)
      labels = {}
    }
    return Object.entries(alloc)
      .map(([key, val]) => ({ name: labels[key] || key, value: +val.toFixed(2) }))
      .sort((a, b) => b.value - a.value)
  }, [hasAssets, portfolio, allocView])

  /* ── Sankey data: Individual Holdings → Asset Categories → Total Portfolio ── */
  interface SankeyMeta { fullName: string; value: number; percent?: number; kind: 'asset' | 'category' | 'portfolio' | 'liability' | 'loan' }
  const sankeyResult = useMemo(() => {
    if (!hasAssets || !portfolio) return null
    const MAX_INDIVIDUAL = 6
    const investments = [...nonLoanAssets].sort((a, b) => assetCurrentValue(b) - assetCurrentValue(a))
    const grossAssets = investments.reduce((s, a) => s + assetCurrentValue(a), 0)

    const typeTotals: Record<string, number> = {}
    for (const a of investments) {
      const label = ASSET_TYPE_LABELS[a.type] || a.type
      typeTotals[label] = (typeTotals[label] || 0) + assetCurrentValue(a)
    }
    const categories = Object.keys(typeTotals)

    const nodes: { name: string }[] = []
    const links: { source: number; target: number; value: number }[] = []
    const meta: SankeyMeta[] = []

    // Layer 1: individual assets
    const top = investments.slice(0, MAX_INDIVIDUAL)
    const rest = investments.slice(MAX_INDIVIDUAL)
    const restByType: Record<string, number> = {}
    for (const a of rest) {
      const label = ASSET_TYPE_LABELS[a.type] || a.type
      restByType[label] = (restByType[label] || 0) + assetCurrentValue(a)
    }

    for (const a of top) {
      const v = assetCurrentValue(a)
      nodes.push({ name: a.symbol || a.name })
      meta.push({ fullName: a.name, value: v, percent: grossAssets > 0 ? (v / grossAssets) * 100 : 0, kind: 'asset' })
    }
    const othersKeys = Object.keys(restByType).filter(k => restByType[k] > 0)
    for (const k of othersKeys) {
      nodes.push({ name: `Others (${k})` })
      meta.push({ fullName: `Others (${k})`, value: restByType[k], percent: grossAssets > 0 ? (restByType[k] / grossAssets) * 100 : 0, kind: 'asset' })
    }

    // Layer 2: categories
    const catStartIdx = nodes.length
    for (const cat of categories) {
      nodes.push({ name: cat })
      meta.push({ fullName: cat, value: typeTotals[cat], percent: grossAssets > 0 ? (typeTotals[cat] / grossAssets) * 100 : 0, kind: 'category' })
    }

    // Layer 3: portfolio
    const portfolioIdx = nodes.length
    nodes.push({ name: 'Portfolio' })
    meta.push({ fullName: 'Total Portfolio', value: grossAssets, kind: 'portfolio' })

    // Links
    for (let i = 0; i < top.length; i++) {
      const catLabel = ASSET_TYPE_LABELS[top[i].type] || top[i].type
      links.push({ source: i, target: catStartIdx + categories.indexOf(catLabel), value: Math.max(assetCurrentValue(top[i]), 1) })
    }
    let othersOffset = top.length
    for (const k of othersKeys) {
      links.push({ source: othersOffset, target: catStartIdx + categories.indexOf(k), value: Math.max(restByType[k], 1) })
      othersOffset++
    }
    for (let i = 0; i < categories.length; i++) {
      links.push({ source: catStartIdx + i, target: portfolioIdx, value: Math.max(typeTotals[categories[i]], 1) })
    }

    // Loans
    if (loanAssets.length > 0) {
      const totalLiab = loanAssets.reduce((s, l) => s + Math.abs(l.currentPrice), 0)
      const liabIdx = nodes.length
      nodes.push({ name: 'Liabilities' })
      meta.push({ fullName: 'Total Liabilities', value: totalLiab, kind: 'liability' })
      for (const loan of loanAssets) {
        const loanIdx = nodes.length
        const bal = Math.abs(loan.currentPrice)
        nodes.push({ name: loan.name })
        meta.push({ fullName: loan.name, value: bal, percent: totalLiab > 0 ? (bal / totalLiab) * 100 : 0, kind: 'loan' })
        links.push({ source: loanIdx, target: liabIdx, value: Math.max(bal, 1) })
      }
    }

    return { data: { nodes, links }, meta }
  }, [hasAssets, portfolio, nonLoanAssets, loanAssets])
  const sankeyData = sankeyResult?.data ?? null
  const sankeyMeta = sankeyResult?.meta ?? []

  const sortedAssets = useMemo(() => {
    if (!hasAssets) return []
    return [...nonLoanAssets].sort((a, b) => assetCurrentValue(b) - assetCurrentValue(a))
  }, [hasAssets, nonLoanAssets])

  const fmt = (n: number) => '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  if (!hasAssets) {
    return (
      <div className="portfolio-empty">
        <div className="portfolio-empty__icon"><Briefcase size={48} /></div>
        <h2>No Assets Yet</h2>
        <p>Add assets to start tracking your portfolio.</p>
        <button className="portfolio-empty__cta" onClick={loadDemo}>Load Demo Portfolio</button>
      </div>
    )
  }

  const isPositive = totalGainLoss >= 0

  return (
    <div className="portfolio">
      {/* Background image */}
      <div className="portfolio-bg">
        <img src={PORTFOLIO_BG} alt="" className="portfolio-bg__img" />
        <div className="portfolio-bg__overlay" />
      </div>

      <div className="portfolio-header">
        <div>
          <h1 className="portfolio-header__title">Portfolio</h1>
          <p className="portfolio-header__subtitle">{portfolio!.name}</p>
        </div>
        <button className="portfolio-add-btn" onClick={() => setShowAddModal(true)}>
          <Plus size={16} /><span>Add Asset</span>
        </button>
      </div>

      {/* TPV + Allocation — two columns */}
      <div className="portfolio-tpv-alloc-row">
        <GlassContainer padding="24px" borderRadius={20} className="portfolio-summary">
          <div className="portfolio-summary__main">
            <span className="portfolio-summary__label">Total Portfolio Value</span>
            <span className="portfolio-summary__value">{fmt(totalValue)}</span>
            <div className={`portfolio-summary__change ${isPositive ? 'portfolio-summary__change--up' : 'portfolio-summary__change--down'}`}>
              {isPositive ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
              <span>{isPositive ? '+' : '-'}{fmt(totalGainLoss)} ({isPositive ? '+' : ''}{totalGainLossPercent.toFixed(2)}%)</span>
            </div>
          </div>
          <div className="portfolio-summary__meta">
            <span>{portfolio!.assets.length} assets</span>
            <span>{portfolio!.currency}</span>
            <span>Cost: {fmt(totalCost)}</span>
          </div>
        </GlassContainer>

        {/* Allocation */}
        <GlassContainer padding="24px" borderRadius={20} className="portfolio-allocation-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 className="section-title">Allocation</h2>
            <div className="period-selector">
              {(['type', 'sector', 'country'] as const).map(v => (
                <button key={v} className={`period-btn ${allocView === v ? 'period-btn--active' : ''}`} onClick={() => setAllocView(v)}>
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <div style={{ width: 160, height: 160, flexShrink: 0 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={allocData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3} dataKey="value" stroke="none">
                    {allocData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: 'var(--glass-bg-strong)', border: '1px solid var(--glass-border)', borderRadius: 12, fontSize: 13 }}
                    formatter={(v) => {
                      if (v == null || typeof v !== 'number' || Number.isNaN(v)) return ['—', '']
                      return [fmt(v), '']
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
              {allocData.map((d, i) => (
                <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 3, background: COLORS[i % COLORS.length], flexShrink: 0 }} />
                  <span style={{ color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)', flexShrink: 0 }}>{fmt(d.value)}</span>
                  <span style={{ color: 'var(--text-tertiary)', fontSize: 11, minWidth: 36, textAlign: 'right', flexShrink: 0 }}>
                    {totalValue > 0 ? ((d.value / totalValue) * 100).toFixed(1) : 0}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </GlassContainer>
      </div>

      {/* Performance Chart */}
      <GlassContainer padding="24px" borderRadius={20}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 className="section-title">Performance</h2>
          <div className="period-selector">
            {periods.map(p => (
              <button key={p} className={`period-btn ${selectedPeriod === p ? 'period-btn--active' : ''}`} onClick={() => setSelectedPeriod(p)}>{p}</button>
            ))}
          </div>
        </div>
        {!hasRealData && !historicalLoading && (
          <p className="performance-chart-disclaimer">History builds as you use the app. Add stocks or ETFs with symbols to see live historical performance.</p>
        )}
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={chartDataWithTrend} margin={{ top: 8, right: 8, left: 8, bottom: 24 }}>
            <defs>
              <linearGradient id="portfolioGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--brand-primary)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--brand-primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="dateLabel"
              tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
              axisLine={{ stroke: 'var(--glass-border)' }}
              tickLine={{ stroke: 'var(--glass-border)' }}
              interval="preserveStartEnd"
              label={{ value: 'Date', position: 'insideBottom', offset: -8, fill: 'var(--text-tertiary)', fontSize: 11 }}
            />
            <YAxis
              tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
              axisLine={{ stroke: 'var(--glass-border)' }}
              tickLine={{ stroke: 'var(--glass-border)' }}
              tickFormatter={(v) => (v >= 0 ? `$${(v / 1000).toFixed(0)}k` : `-$${(Math.abs(v) / 1000).toFixed(0)}k`)}
              width={56}
              tickCount={5}
              domain={([dataMin, dataMax]) => {
                const range = dataMax - dataMin
                const pad = range > 0
                  ? Math.max(range * 0.15, Math.abs(dataMin + dataMax) / 2 * 0.005, 50)
                  : Math.max(Math.abs(dataMin) * 0.02, 100)
                return [dataMin - pad, dataMax + pad]
              }}
              label={{ value: 'Portfolio Value ($)', angle: -90, position: 'insideLeft', fill: 'var(--text-tertiary)', fontSize: 11 }}
            />
            <Tooltip
              contentStyle={{ background: 'var(--glass-bg-strong)', border: '1px solid var(--glass-border)', borderRadius: 12, fontSize: 13 }}
              formatter={(v, name) => {
                if (v == null || typeof v !== 'number' || Number.isNaN(v)) return ['—', name ?? '']
                return [`$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, name ?? '']
              }}
              labelFormatter={(label) => `Date: ${label}`}
            />
            <Area type="monotone" dataKey="value" stroke="var(--brand-primary)" strokeWidth={2} fill="url(#portfolioGrad)" connectNulls={false} />
            <Line type="monotone" dataKey="histTrend" stroke="var(--text-tertiary)" strokeWidth={1.5} dot={false} name="Linear trend" connectNulls />
            <Line
              type="monotone"
              dataKey="futTrend"
              stroke="#f59e0b"
              strokeWidth={1.5}
              strokeDasharray="5 4"
              dot={false}
              name="Projection (extrapolated)"
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
        <p className="performance-chart-disclaimer" style={{ marginTop: 8, marginBottom: 0 }}>
          Gray: linear fit to the series. Dashed amber: extrapolation — illustrative only.
        </p>
      </GlassContainer>

      {/* Sankey – Interactive Portfolio Flow */}
      {sankeyData && sankeyData.nodes.length > 2 && (
        <GlassContainer padding="24px" borderRadius={20}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <GitBranch size={20} style={{ color: 'var(--brand-primary)' }} />
              <h2 className="section-title">Portfolio Flow</h2>
            </div>
            <div style={{
              padding: '4px 12px', borderRadius: 8,
              background: 'rgba(99,102,241,0.12)', color: 'var(--brand-primary)',
              fontSize: 12, fontWeight: 600,
            }}>
              {portfolio!.assets.length} assets
            </div>
          </div>
          <div style={{ width: '100%', overflowX: 'auto' }} onClick={() => setSelectedSankeyNode(null)}>
            <ResponsiveContainer width="100%" height={Math.max(300, (sankeyData.nodes.length * 28) + 60)}>
              <Sankey
                data={sankeyData}
                nodeWidth={14}
                nodePadding={18}
                linkCurvature={0.5}
                node={<SankeyNodeInteractive selected={selectedSankeyNode} onSelect={setSelectedSankeyNode} meta={sankeyMeta} fmt={fmt} />}
                link={<SankeyLinkInteractive selected={selectedSankeyNode} />}
              >
                <Tooltip
                  contentStyle={{
                    background: 'var(--glass-bg-strong)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: 12, fontSize: 13,
                    boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                  }}
                  formatter={(v) => {
                    if (v == null || typeof v !== 'number' || Number.isNaN(v)) return ['—', 'Value']
                    return [fmt(v), 'Value']
                  }}
                />
              </Sankey>
            </ResponsiveContainer>
          </div>
          {/* Selected node detail bar */}
          {selectedSankeyNode != null && sankeyMeta[selectedSankeyNode] && (
            <div className="sankey-detail-bar">
              <div className="sankey-detail-bar__color" style={{
                background: sankeyMeta[selectedSankeyNode].kind === 'liability' ? '#ef4444'
                  : sankeyMeta[selectedSankeyNode].kind === 'loan' ? '#ff8a65'
                  : COLORS[selectedSankeyNode % COLORS.length]
              }} />
              <div className="sankey-detail-bar__info">
                <span className="sankey-detail-bar__name">{sankeyMeta[selectedSankeyNode].fullName}</span>
                <span className="sankey-detail-bar__kind">{sankeyMeta[selectedSankeyNode].kind}</span>
              </div>
              <span className="sankey-detail-bar__value">{fmt(sankeyMeta[selectedSankeyNode].value)}</span>
              {sankeyMeta[selectedSankeyNode].percent != null && (
                <span className="sankey-detail-bar__pct">{sankeyMeta[selectedSankeyNode].percent!.toFixed(1)}%</span>
              )}
              <button className="sankey-detail-bar__close" onClick={() => setSelectedSankeyNode(null)}>&times;</button>
            </div>
          )}
          <div style={{ marginTop: 12, display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: '#6366f1', display: 'inline-block' }} />
              Holdings → Categories → Portfolio
            </span>
            {loanAssets.length > 0 && (
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: '#ef4444', display: 'inline-block' }} />
                Loans → Liabilities
              </span>
            )}
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)', opacity: 0.6 }}>Click a node for details</span>
          </div>
        </GlassContainer>
      )}

      {/* Holdings & Loans — two columns */}
      <div className="portfolio-two-col">
        <div className="portfolio-holdings">
          <h2 className="section-title">Holdings ({sortedAssets.length})</h2>
          <div className="port-asset-list">
            {sortedAssets.map(asset => {
              const val = assetCurrentValue(asset)
              const pct = assetGainLossPercent(asset)
              const pos = pct >= 0
              return (
                <GlassContainer
                  key={asset.id}
                  className="port-asset-card"
                  padding="16px"
                  borderRadius={14}
                  onClick={() => navigate(`/asset/${asset.id}`)}
                >
                  <AssetLogo symbol={asset.symbol} name={asset.name} type={asset.type} size={40} borderRadius={12} />
                  <div className="port-asset-card__info">
                    <div className="port-asset-card__name">{asset.name}</div>
                    <div className="port-asset-card__meta">
                      {asset.symbol && <span>{asset.symbol}</span>}
                      <span className="port-asset-card__badge">{ASSET_TYPE_LABELS[asset.type]}</span>
                      <span>{asset.quantity} shares</span>
                    </div>
                  </div>
                  <div className="port-asset-card__right">
                    <div className="port-asset-card__value">{fmt(val)}</div>
                    <div className={`port-asset-card__change ${pos ? 'port-asset-card__change--up' : 'port-asset-card__change--down'}`}>
                      {pos ? '+' : ''}{pct.toFixed(2)}%
                    </div>
                  </div>
                  <ChevronRight size={16} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                </GlassContainer>
              )
            })}
          </div>
        </div>

        <div className="portfolio-holdings">
          <h2 className="section-title">Loans ({loanAssets.length})</h2>
          {loanAssets.length > 0 ? (
            <div className="port-asset-list">
              {loanAssets.map(asset => (
                <GlassContainer
                  key={asset.id}
                  className="port-asset-card"
                  padding="16px"
                  borderRadius={14}
                  onClick={() => navigate(`/loan/${asset.id}`)}
                >
                  <div className="port-asset-card__icon">{asset.loanType ? '🏦' : '📋'}</div>
                  <div className="port-asset-card__info">
                    <div className="port-asset-card__name">{asset.name}</div>
                    <div className="port-asset-card__meta">
                      <span className="port-asset-card__badge">Loan</span>
                      {asset.interestRate && <span>{asset.interestRate}% APR</span>}
                    </div>
                  </div>
                  <div className="port-asset-card__right">
                    <div className="port-asset-card__value" style={{ color: 'var(--status-error)' }}>{fmt(Math.abs(asset.currentPrice))}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>balance</div>
                  </div>
                  <ChevronRight size={16} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                </GlassContainer>
              ))}
            </div>
          ) : (
            <GlassContainer padding="32px" borderRadius={14} className="port-empty-loans">
              <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🏦</div>
                No loans tracked yet
              </div>
            </GlassContainer>
          )}
        </div>
      </div>

      {/* Add Asset Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <GlassContainer className="modal-content" onClick={undefined}>
            <div onClick={e => e.stopPropagation()}>
              <h2 style={{ color: 'var(--text-primary)', marginBottom: 16, fontSize: 20, fontWeight: 700 }}>Add Asset</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <GlassButton text="Search Public Asset" onClick={() => { setShowAddModal(false); navigate('/add-asset/search') }} icon={<span>🔍</span>} />
                <GlassButton text="Add Manual Asset" onClick={() => { setShowAddModal(false); navigate('/add-asset/manual') }} icon={<span>✏️</span>} />
                <GlassButton text="Add a Loan" onClick={() => { setShowAddModal(false); navigate('/add-asset/loan') }} icon={<span>🏦</span>} />
                <GlassButton text="Cancel" onClick={() => setShowAddModal(false)} />
              </div>
            </div>
          </GlassContainer>
        </div>
      )}
    </div>
  )
}

/* ── Interactive Sankey Node ─── */
const SANKEY_NODE_COLORS = [
  '#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b',
  '#ef4444', '#a78bfa', '#ec4899', '#64748b', '#84cc16',
]

function getNodeFill(index: number, meta: any[]) {
  const m = meta[index]
  if (!m) return SANKEY_NODE_COLORS[index % SANKEY_NODE_COLORS.length]
  if (m.kind === 'liability') return '#ef4444'
  if (m.kind === 'loan') return '#ff8a65'
  if (m.kind === 'portfolio') return '#6366f1'
  return SANKEY_NODE_COLORS[index % SANKEY_NODE_COLORS.length]
}

function SankeyNodeInteractive(props: any) {
  const { x, y, width, height, index, payload, selected, onSelect, meta, fmt } = props
  if (x == null || y == null || width == null || height == null) return null
  const fill = getNodeFill(index, meta)
  const label = payload?.name || ''
  const displayLabel = label.length > 14 ? label.slice(0, 12) + '…' : label
  const isSelected = selected === index
  const isDimmed = selected != null && !isSelected

  return (
    <Layer key={`node-${index}`}>
      {/* Hover/click highlight glow */}
      {isSelected && (
        <Rectangle
          x={x - 3} y={y - 3} width={width + 6} height={height + 6}
          fill="none" stroke={fill} strokeWidth={2} rx={6} ry={6}
          strokeOpacity={0.6}
        />
      )}
      <Rectangle
        x={x} y={y} width={width} height={height}
        fill={fill} fillOpacity={isDimmed ? 0.3 : 0.9}
        rx={4} ry={4}
        style={{ cursor: 'pointer', transition: 'fill-opacity 0.2s' }}
        onClick={(e: any) => { e.stopPropagation(); onSelect(isSelected ? null : index) }}
      />
      <text
        x={x + width + 8}
        y={y + height / 2}
        textAnchor="start"
        dominantBaseline="central"
        style={{
          fontSize: 11, fontWeight: isSelected ? 700 : 600,
          fill: isDimmed ? 'var(--text-tertiary)' : 'var(--text-secondary)',
          cursor: 'pointer', transition: 'fill 0.2s',
        }}
        onClick={(e: any) => { e.stopPropagation(); onSelect(isSelected ? null : index) }}
      >
        {displayLabel}{isSelected && meta[index] ? ` (${fmt(meta[index].value)})` : ''}
      </text>
    </Layer>
  )
}

function SankeyLinkInteractive(props: any) {
  const { sourceX, sourceY, sourceControlX, targetX, targetY, targetControlX, linkWidth, selected, index, payload } = props
  if (sourceX == null || targetX == null) return null

  // Determine if this link connects to the selected node
  const sourceIdx = payload?.source?.index ?? -1
  const targetIdx = payload?.target?.index ?? -1
  const isHighlighted = selected != null && (sourceIdx === selected || targetIdx === selected)
  const isDimmed = selected != null && !isHighlighted

  const fill = isHighlighted ? 'var(--brand-primary)' : 'var(--brand-primary)'
  const opacity = isDimmed ? 0.05 : isHighlighted ? 0.35 : 0.15

  return (
    <Layer key={`link-${index}`}>
      <path
        d={`M${sourceX},${sourceY}
            C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`}
        fill="none"
        stroke={fill}
        strokeWidth={linkWidth}
        strokeOpacity={opacity}
        style={{ transition: 'stroke-opacity 0.3s' }}
      />
    </Layer>
  )
}

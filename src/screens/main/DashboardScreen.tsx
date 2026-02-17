import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import {
  TrendingUp, TrendingDown, DollarSign, BarChart3,
  ArrowUpRight, ArrowDownRight, Activity, Bell, Shield,
  Newspaper, ChevronRight,
} from 'lucide-react'
import { analyzePortfolio } from '../../services/riskAnalysis'
import GlassContainer from '../../components/glass/GlassContainer'
import GlassIconButton from '../../components/glass/GlassIconButton'
import AssetLogo from '../../components/AssetLogo'
import UserAvatar, { getInitials } from '../../components/UserAvatar'
import { usePortfolio } from '../../store/usePortfolio'
import { usePreferences } from '../../store/usePreferences'
import { useNotifications } from '../../store/useNotifications'
import type { PerformancePeriod, Asset } from '../../types'
import { assetCurrentValue, assetGainLossPercent, ASSET_TYPE_ICONS, isLoan } from '../../types'
import './DashboardScreen.css'

const DASHBOARD_BG = 'https://images.unsplash.com/photo-1515266591878-f93e32bc5937?q=80&w=1287&auto=format&fit=crop'

const periods: PerformancePeriod[] = ['1D', '1W', '1M', '1Y']
const COLORS = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#a78bfa', '#ec4899']

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export default function DashboardScreen() {
  const navigate = useNavigate()
  const {
    portfolio, totalValue, totalCost, totalGainLoss, totalGainLossPercent, loadDemo,
  } = usePortfolio()
  const { prefs } = usePreferences()
  const { unreadCount } = useNotifications()

  const [selectedPeriod, setSelectedPeriod] = useState<PerformancePeriod>('1M')

  const userName = prefs.userName || prefs.userEmail?.split('@')[0] || 'Investor'

  const hasAssets = portfolio && portfolio.assets.length > 0
  const nonLoanAssets = portfolio?.assets.filter(a => !isLoan(a)) || []
  const loanAssets = portfolio?.assets.filter(a => isLoan(a)) || []

  const chartData = useMemo(() => {
    if (!hasAssets) return []
    const days = selectedPeriod === '1D' ? 24 : selectedPeriod === '1W' ? 7 : selectedPeriod === '1M' ? 30 : 365
    const base = totalValue * 0.92
    return Array.from({ length: days }, (_, i) => ({
      name: `${i + 1}`,
      value: +(base + (Math.sin(i * 0.3) * totalValue * 0.04) + (i / days) * (totalValue - base)).toFixed(2),
    }))
  }, [hasAssets, totalValue, selectedPeriod])

  const allocationData = useMemo(() => {
    if (!hasAssets) return []
    const groups = new Map<string, number>()
    for (const asset of nonLoanAssets) {
      const val = assetCurrentValue(asset)
      const label = asset.type.charAt(0).toUpperCase() + asset.type.slice(1).replace('_', ' ')
      groups.set(label, (groups.get(label) || 0) + val)
    }
    return Array.from(groups.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  }, [hasAssets, nonLoanAssets])

  const topMovers = useMemo(() => {
    if (!hasAssets) return []
    return [...nonLoanAssets]
      .map(a => ({ asset: a, pct: assetGainLossPercent(a) }))
      .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
      .slice(0, 6)
  }, [hasAssets, nonLoanAssets])

  // Real risk analysis
  const riskResult = useMemo(() => hasAssets ? analyzePortfolio(nonLoanAssets, totalValue, totalGainLossPercent) : null, [hasAssets, nonLoanAssets, totalValue, totalGainLossPercent])
  const riskScore = riskResult?.riskScore ?? 0
  const riskLevelLabel = riskResult ? ({ conservative: 'Conservative', moderate: 'Moderate', growth: 'Growth', aggressive: 'Aggressive' }[riskResult.riskLevel]) : 'N/A'
  const riskColor = riskResult ? ({ conservative: 'var(--status-success)', moderate: 'var(--brand-primary)', growth: 'var(--status-warning)', aggressive: 'var(--status-error)' }[riskResult.riskLevel]) : 'var(--text-tertiary)'

  if (!hasAssets) {
    return (
      <div className="dashboard-empty">
        <div className="dashboard-empty__icon"><BarChart3 size={48} /></div>
        <h2>Welcome to FinoCurve</h2>
        <p>Add assets to your portfolio to see your dashboard come alive.</p>
        <button className="dashboard-empty__cta" onClick={loadDemo}>Load Demo Portfolio</button>
      </div>
    )
  }

  const isPositive = totalGainLoss >= 0
  const fmt = (n: number) => '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <div className="dashboard">
      {/* Background image */}
      <div className="dash-bg">
        <img src={DASHBOARD_BG} alt="" className="dash-bg__img" />
        <div className="dash-bg__overlay" />
      </div>

      {/* Greeting Header */}
      <div className="dash-greeting">
        <div className="dash-greeting__left">
          <UserAvatar src={prefs.profilePicturePath} initials={getInitials(userName)} size={48} className="dash-avatar" />
          <div>
            <h1 className="dash-greeting__title">{getGreeting()}, {userName}</h1>
            <p className="dash-greeting__subtitle">Here's your portfolio at a glance</p>
          </div>
        </div>
        <div className="dash-greeting__actions">
          <GlassIconButton icon={<Newspaper size={20} />} onClick={() => navigate('/news')} size={42} title="News" />
          <div style={{ position: 'relative' }}>
            <GlassIconButton icon={<Bell size={20} />} onClick={() => navigate('/notifications')} size={42} title="Notifications" />
            {unreadCount > 0 && (
              <span className="dash-notif-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
            )}
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="dashboard-stats">
        <GlassContainer padding="20px" borderRadius={16} className="stat-card">
          <div className="stat-card__icon stat-card__icon--primary"><DollarSign size={20} /></div>
          <div className="stat-card__info">
            <span className="stat-card__label">Total Value</span>
            <span className="stat-card__value">{fmt(totalValue)}</span>
          </div>
        </GlassContainer>
        <GlassContainer padding="20px" borderRadius={16} className="stat-card">
          <div className={`stat-card__icon ${isPositive ? 'stat-card__icon--success' : 'stat-card__icon--error'}`}>
            {isPositive ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
          </div>
          <div className="stat-card__info">
            <span className="stat-card__label">Total Gain/Loss</span>
            <span className={`stat-card__value ${isPositive ? 'stat-card__value--success' : 'stat-card__value--error'}`}>
              {isPositive ? '+' : '-'}{fmt(totalGainLoss)}
            </span>
          </div>
        </GlassContainer>
        <GlassContainer padding="20px" borderRadius={16} className="stat-card">
          <div className={`stat-card__icon ${isPositive ? 'stat-card__icon--success' : 'stat-card__icon--error'}`}>
            <Activity size={20} />
          </div>
          <div className="stat-card__info">
            <span className="stat-card__label">Return</span>
            <span className={`stat-card__value ${isPositive ? 'stat-card__value--success' : 'stat-card__value--error'}`}>
              {isPositive ? '+' : ''}{totalGainLossPercent.toFixed(2)}%
            </span>
          </div>
        </GlassContainer>
        <GlassContainer padding="20px" borderRadius={16} className="stat-card">
          <div className="stat-card__icon stat-card__icon--primary"><BarChart3 size={20} /></div>
          <div className="stat-card__info">
            <span className="stat-card__label">Assets</span>
            <span className="stat-card__value">{portfolio!.assets.length}</span>
          </div>
        </GlassContainer>
      </div>

      {/* Performance Chart */}
      <GlassContainer padding="24px" borderRadius={20} className="dashboard-chart-card">
        <div className="dashboard-chart-header">
          <h2 className="section-title">Portfolio Performance</h2>
          <div className="period-selector">
            {periods.map(p => (
              <button key={p} className={`period-btn ${selectedPeriod === p ? 'period-btn--active' : ''}`} onClick={() => setSelectedPeriod(p)}>{p}</button>
            ))}
          </div>
        </div>
        <div className="dashboard-chart">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--brand-primary)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--brand-primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis hide />
              <Tooltip
                contentStyle={{ background: 'var(--glass-bg-strong)', border: '1px solid var(--glass-border)', borderRadius: 12, color: 'var(--text-primary)', fontSize: 13 }}
                formatter={(value: number) => [`$${value.toLocaleString()}`, 'Value']}
                labelFormatter={() => ''}
              />
              <Area type="monotone" dataKey="value" stroke="var(--brand-primary)" strokeWidth={2} fill="url(#chartGradient)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </GlassContainer>

      {/* Risk Score + Allocation row */}
      <div className="dashboard-bottom-row">
        {/* Risk Score Card */}
        <GlassContainer padding="24px" borderRadius={20} className="dash-risk-card" onClick={() => navigate('/risk-analysis')}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 className="section-title"><Shield size={18} style={{ marginRight: 8, verticalAlign: 'middle' }} />Risk Score</h2>
            <ChevronRight size={18} style={{ color: 'var(--text-tertiary)' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <div style={{ position: 'relative', width: 100, height: 100 }}>
              <svg width="100" height="100" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="42" fill="none" stroke="var(--glass-border)" strokeWidth="8" />
                <circle cx="50" cy="50" r="42" fill="none"
                  stroke={riskColor}
                  strokeWidth="8" strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 42}
                  strokeDashoffset={2 * Math.PI * 42 * (1 - riskScore / 100)}
                  transform="rotate(-90 50 50)"
                  style={{ transition: 'stroke-dashoffset 1s ease' }}
                />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                <span style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)' }}>{riskScore}</span>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: riskColor, textTransform: 'capitalize', marginBottom: 8 }}>
                {riskLevelLabel}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>View full analysis</div>
            </div>
          </div>
        </GlassContainer>

        {/* Allocation */}
        <GlassContainer padding="24px" borderRadius={20} className="dashboard-allocation">
          <h2 className="section-title">Allocation</h2>
          <div className="allocation-chart">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={allocationData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value" stroke="none">
                  {allocationData.map((_, idx) => <Cell key={idx} fill={COLORS[idx % COLORS.length]} />)}
                </Pie>
                <Tooltip
                  contentStyle={{ background: 'var(--glass-bg-strong)', border: '1px solid var(--glass-border)', borderRadius: 12, color: 'var(--text-primary)', fontSize: 13 }}
                  formatter={(value: number) => [`$${value.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, '']}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="allocation-legend">
              {allocationData.map((item, idx) => (
                <div key={item.name} className="allocation-legend__item">
                  <span className="allocation-legend__dot" style={{ background: COLORS[idx % COLORS.length] }} />
                  <span className="allocation-legend__name">{item.name}</span>
                </div>
              ))}
            </div>
          </div>
        </GlassContainer>
      </div>

      {/* Top Movers (centered) */}
      <div className="dash-section dash-section--centered">
        <h2 className="section-title" style={{ textAlign: 'center' }}>Top Movers</h2>
        <div className="dash-movers-scroll">
          {topMovers.map(({ asset, pct }) => {
            const pos = pct >= 0
            return (
              <GlassContainer
                key={asset.id}
                className="dash-mover-card"
                padding="16px"
                borderRadius={16}
                onClick={() => navigate(`/asset/${asset.id}`)}
              >
                <AssetLogo symbol={asset.symbol} name={asset.name} type={asset.type} size={36} borderRadius={10} />
                <div className="dash-mover-card__symbol">{asset.symbol || asset.name.slice(0, 4)}</div>
                <div className="dash-mover-card__price">${asset.currentPrice.toLocaleString()}</div>
                <div className={`dash-mover-card__change ${pos ? 'dash-mover-card__change--up' : 'dash-mover-card__change--down'}`}>
                  {pos ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                  {pos ? '+' : ''}{pct.toFixed(2)}%
                </div>
              </GlassContainer>
            )
          })}
        </div>
      </div>

      {/* Holdings & Loans — two columns */}
      <div className="dash-two-col">
        <div className="dash-section">
          <h2 className="section-title">Holdings ({nonLoanAssets.length})</h2>
          <div className="dash-holdings">
            {nonLoanAssets.map(asset => {
              const val = assetCurrentValue(asset)
              const pct = assetGainLossPercent(asset)
              const pos = pct >= 0
              return (
                <GlassContainer
                  key={asset.id}
                  className="dash-holding-card"
                  padding="16px"
                  borderRadius={14}
                  onClick={() => navigate(`/asset/${asset.id}`)}
                >
                  <AssetLogo symbol={asset.symbol} name={asset.name} type={asset.type} size={40} borderRadius={12} />
                  <div className="dash-holding-card__info">
                    <div className="dash-holding-card__name">{asset.name}</div>
                    <div className="dash-holding-card__meta">{asset.symbol || asset.type} &middot; {asset.quantity} shares</div>
                  </div>
                  <div className="dash-holding-card__right">
                    <div className="dash-holding-card__value">${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    <div className={`dash-holding-card__change ${pos ? 'dash-holding-card__change--up' : 'dash-holding-card__change--down'}`}>
                      {pos ? '+' : ''}{pct.toFixed(2)}%
                    </div>
                  </div>
                </GlassContainer>
              )
            })}
          </div>
        </div>

        <div className="dash-section">
          <h2 className="section-title">Loans ({loanAssets.length})</h2>
          {loanAssets.length > 0 ? (
            <div className="dash-holdings">
              {loanAssets.map(asset => (
                <GlassContainer
                  key={asset.id}
                  className="dash-holding-card"
                  padding="16px"
                  borderRadius={14}
                  onClick={() => navigate(`/loan/${asset.id}`)}
                >
                  <div className="dash-holding-card__icon">{asset.loanType ? '🏦' : '📋'}</div>
                  <div className="dash-holding-card__info">
                    <div className="dash-holding-card__name">{asset.name}</div>
                    <div className="dash-holding-card__meta">
                      {asset.interestRate ? `${asset.interestRate}% APR` : 'Loan'}
                    </div>
                  </div>
                  <div className="dash-holding-card__right">
                    <div className="dash-holding-card__value" style={{ color: 'var(--status-error)' }}>
                      ${Math.abs(asset.currentPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>balance</div>
                  </div>
                </GlassContainer>
              ))}
            </div>
          ) : (
            <GlassContainer padding="32px" borderRadius={14} className="dash-empty-loans">
              <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🏦</div>
                No loans tracked yet
              </div>
            </GlassContainer>
          )}
        </div>
      </div>
    </div>
  )
}

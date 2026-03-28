import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Edit3, Trash2, BarChart2 } from 'lucide-react'
import { Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ComposedChart, Line } from 'recharts'
import GlassContainer from '../../components/glass/GlassContainer'
import GlassButton from '../../components/glass/GlassButton'
import GlassTextField from '../../components/glass/GlassTextField'
import GlassIconButton from '../../components/glass/GlassIconButton'
import CountrySelect from '../../components/CountrySelect'
import AssetLogo from '../../components/AssetLogo'
import TradingViewChart, { getTradingViewSymbol } from '../../components/TradingViewChart'
import type { Asset, AssetSector, PerformancePeriod } from '../../types'
import { assetCurrentValue, assetGainLoss, assetGainLossPercent, ASSET_TYPE_ICONS, SECTOR_LABELS, isLoan } from '../../types'
import { augmentSeriesWithLinearTrend } from '../../lib/chartTrendForecast'
import './DetailScreen.css'
import '../add-asset/AddAsset.css'

function generateMockChart(basePrice: number, period: PerformancePeriod) {
  const points = period === '1D' ? 24 : period === '1W' ? 7 : period === '1M' ? 30 : 365
  const data = []
  let price = basePrice * 0.92
  for (let i = 0; i < points; i++) {
    price += (Math.random() - 0.45) * (basePrice * 0.015)
    price = Math.max(price, basePrice * 0.7)
    const label = period === '1D'
      ? `${i}:00`
      : period === '1W'
        ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i % 7]
        : `Day ${i + 1}`
    data.push({ date: label, value: +price.toFixed(2) })
  }
  data[data.length - 1].value = basePrice
  return data
}

export default function AssetDetailScreen() {
  const navigate = useNavigate()
  const { assetId } = useParams()
  const [visible, setVisible] = useState(false)
  const [period, setPeriod] = useState<PerformancePeriod>('1M')
  const [showEdit, setShowEdit] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showTvChart, setShowTvChart] = useState(false)

  // Load asset from portfolio
  const portfolio = JSON.parse(localStorage.getItem('finocurve-portfolio') || '{}')
  const asset: Asset | undefined = (portfolio.assets || []).find((a: Asset) => a.id === assetId)

  const [editQty, setEditQty] = useState(asset?.quantity.toString() || '')
  const [editCost, setEditCost] = useState(asset?.costBasis.toString() || '')
  const [editPrice, setEditPrice] = useState(asset?.currentPrice.toString() || '')
  const [editSector, setEditSector] = useState<AssetSector>(asset?.sector || 'other')
  const [editCountry, setEditCountry] = useState(asset?.country || '')

  useEffect(() => { requestAnimationFrame(() => setVisible(true)) }, [])

  const chartData = useMemo(() => {
    if (!asset) return []
    return generateMockChart(asset.currentPrice, period)
  }, [asset, period])

  const chartDataWithTrend = useMemo(() => {
    const base = chartData.map((d) => ({ ...d, dateLabel: d.date }))
    return augmentSeriesWithLinearTrend(base, { forecastSteps: 4, minPoints: 3 }).map((row) => ({
      ...row,
      date: row.dateLabel,
    }))
  }, [chartData])

  if (!asset) {
    return (
      <div className="detail-screen">
        <GlassContainer>
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>Asset not found</p>
          <GlassButton text="Go Back" onClick={() => navigate(-1)} />
        </GlassContainer>
      </div>
    )
  }

  if (isLoan(asset)) {
    navigate(`/loan/${assetId}`, { replace: true })
    return null
  }

  const value = assetCurrentValue(asset)
  const gain = assetGainLoss(asset)
  const gainPct = assetGainLossPercent(asset)
  const isPositive = gain >= 0
  const fmt = (n: number) => '$' + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const handleSaveEdit = () => {
    const updated = {
      ...asset,
      quantity: parseFloat(editQty) || asset.quantity,
      costBasis: parseFloat(editCost) || asset.costBasis,
      currentPrice: parseFloat(editPrice) || asset.currentPrice,
      sector: editSector,
      country: editCountry || undefined,
    }
    const p = JSON.parse(localStorage.getItem('finocurve-portfolio') || '{}')
    p.assets = (p.assets || []).map((a: Asset) => a.id === updated.id ? updated : a)
    p.updatedAt = new Date().toISOString()
    localStorage.setItem('finocurve-portfolio', JSON.stringify(p))
    setShowEdit(false)
    window.location.reload()
  }

  const handleDelete = () => {
    const p = JSON.parse(localStorage.getItem('finocurve-portfolio') || '{}')
    p.assets = (p.assets || []).filter((a: Asset) => a.id !== asset.id)
    p.updatedAt = new Date().toISOString()
    localStorage.setItem('finocurve-portfolio', JSON.stringify(p))
    navigate('/main', { replace: true })
  }

  const periods: PerformancePeriod[] = ['1D', '1W', '1M', '1Y']
  const tradeableTypes = new Set(['stock', 'etf', 'crypto'])
  const canShowChart = tradeableTypes.has(asset.type) && !!asset.symbol

  return (
    <div className="detail-screen">
      <div className="detail-bg-glow detail-bg-glow--1" />
      <div className="detail-bg-glow detail-bg-glow--2" />
      <div className={`detail-content ${visible ? 'detail-content--visible' : ''}`}>
        <div className="detail-header">
          <GlassIconButton icon={<ArrowLeft size={20} />} onClick={() => navigate(-1)} size={44} />
          <div className="detail-header-right">
            {canShowChart && (
              <GlassIconButton icon={<BarChart2 size={18} />} onClick={() => setShowTvChart(true)} size={40} title="TradingView Chart" />
            )}
            <GlassIconButton icon={<Edit3 size={18} />} onClick={() => setShowEdit(true)} size={40} title="Edit" />
            <GlassIconButton icon={<Trash2 size={18} />} onClick={() => setShowDeleteConfirm(true)} size={40} title="Delete" />
          </div>
        </div>

        <GlassContainer>
          <div className="asset-hero">
            <AssetLogo symbol={asset.symbol} name={asset.name} type={asset.type} size={52} borderRadius={14} />
            <div>
              <div className="asset-hero__name">
                {asset.name}
                <span className="asset-hero__category">{asset.category}</span>
              </div>
              <div className="asset-hero__symbol">{asset.symbol || asset.type}</div>
            </div>
          </div>

          <div className="price-display">
            <span className="price-display__current">{fmt(value)}</span>
            <span className={`price-display__change ${isPositive ? 'price-display__change--positive' : 'price-display__change--negative'}`}>
              {isPositive ? '+' : ''}{fmt(gain)} ({gainPct.toFixed(2)}%)
            </span>
            <div className="price-display__subtitle">
              {asset.quantity} shares @ {fmt(asset.currentPrice)} per share
            </div>
          </div>

          <div className="period-selector">
            {periods.map(p => (
              <button key={p} className={`period-btn ${period === p ? 'period-btn--active' : ''}`} onClick={() => setPeriod(p)}>
                {p}
              </button>
            ))}
          </div>

          <div className="detail-chart-area">
            <ResponsiveContainer>
              <ComposedChart data={chartDataWithTrend}>
                <defs>
                  <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--brand-primary)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--brand-primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis hide domain={['dataMin', 'dataMax']} />
                <Tooltip
                  contentStyle={{
                    background: 'var(--glass-bg-strong)', border: '1px solid var(--glass-border)',
                    borderRadius: 12, fontSize: 13, color: 'var(--text-primary)',
                  }}
                  formatter={(v: number | string, name: string) => {
                    if (v == null || typeof v !== 'number' || Number.isNaN(v)) return ['—', name]
                    return ['$' + v.toLocaleString(), name]
                  }}
                />
                <Area type="monotone" dataKey="value" stroke="var(--brand-primary)" fill="url(#colorVal)" strokeWidth={2} connectNulls={false} name="Price" />
                <Line type="monotone" dataKey="histTrend" stroke="var(--text-tertiary)" strokeWidth={1.5} dot={false} name="Linear trend" connectNulls />
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
          </div>
        </GlassContainer>

        <GlassContainer style={{ marginTop: 16 }}>
          <div className="detail-section-title">Key Statistics</div>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-card__label">Current Price</div>
              <div className="stat-card__value">{fmt(asset.currentPrice)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-card__label">Cost Basis</div>
              <div className="stat-card__value">{fmt(asset.costBasis)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-card__label">Quantity</div>
              <div className="stat-card__value">{asset.quantity}</div>
            </div>
            <div className="stat-card">
              <div className="stat-card__label">Total Value</div>
              <div className="stat-card__value">{fmt(value)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-card__label">Gain/Loss</div>
              <div className="stat-card__value" style={{ color: isPositive ? 'var(--status-success)' : 'var(--status-error)' }}>
                {isPositive ? '+' : ''}{fmt(gain)}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-card__label">Return</div>
              <div className="stat-card__value" style={{ color: isPositive ? 'var(--status-success)' : 'var(--status-error)' }}>
                {gainPct.toFixed(2)}%
              </div>
            </div>
          </div>
        </GlassContainer>

        {(asset.sector || asset.brokerage || asset.country || asset.notes) && (
          <GlassContainer style={{ marginTop: 16 }}>
            <div className="detail-section-title">Details</div>
            <div className="info-rows">
              {asset.sector && <div className="info-row"><span className="info-row__label">Sector</span><span className="info-row__value">{SECTOR_LABELS[asset.sector] || asset.sector}</span></div>}
              {asset.brokerage && <div className="info-row"><span className="info-row__label">Brokerage</span><span className="info-row__value">{asset.brokerage}</span></div>}
              {asset.country && <div className="info-row"><span className="info-row__label">Country</span><span className="info-row__value">{asset.country}</span></div>}
              {asset.currency && <div className="info-row"><span className="info-row__label">Currency</span><span className="info-row__value">{asset.currency}</span></div>}
              {asset.notes && <div className="info-row"><span className="info-row__label">Notes</span><span className="info-row__value">{asset.notes}</span></div>}
              {asset.tags?.length > 0 && <div className="info-row"><span className="info-row__label">Tags</span><span className="info-row__value">{asset.tags.join(', ')}</span></div>}
            </div>
          </GlassContainer>
        )}

        <div className="detail-actions">
          <GlassButton text="Edit Asset" onClick={() => setShowEdit(true)} icon={<Edit3 size={16} />} />
          <GlassButton text="Delete Asset" onClick={() => setShowDeleteConfirm(true)} icon={<Trash2 size={16} />} />
        </div>
      </div>

      {/* Edit Modal */}
      {showEdit && (
        <div className="modal-overlay" onClick={() => setShowEdit(false)}>
          <GlassContainer className="modal-content" onClick={undefined}>
            <div onClick={e => e.stopPropagation()}>
              <h2 style={{ color: 'var(--text-primary)', marginBottom: 16 }}>Edit Asset</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label className="add-asset-label">Quantity</label>
                  <GlassTextField value={editQty} onChange={setEditQty} type="number" />
                </div>
                <div>
                  <label className="add-asset-label">Cost Basis</label>
                  <GlassTextField value={editCost} onChange={setEditCost} type="number" />
                </div>
                <div>
                  <label className="add-asset-label">Current Price</label>
                  <GlassTextField value={editPrice} onChange={setEditPrice} type="number" />
                </div>
                <div>
                  <label className="add-asset-label">Sector</label>
                  <select className="add-asset-select" value={editSector} onChange={e => setEditSector(e.target.value as AssetSector)}>
                    {(Object.keys(SECTOR_LABELS) as AssetSector[]).map(s => (
                      <option key={s} value={s}>{SECTOR_LABELS[s]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="add-asset-label">Country</label>
                  <CountrySelect value={editCountry} onChange={setEditCountry} placeholder="Select country..." />
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <GlassButton text="Cancel" onClick={() => setShowEdit(false)} />
                  <GlassButton text="Save" onClick={handleSaveEdit} isPrimary />
                </div>
              </div>
            </div>
          </GlassContainer>
        </div>
      )}

      {/* Delete Confirm */}
      {showDeleteConfirm && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <GlassContainer className="modal-content" onClick={undefined}>
            <div onClick={e => e.stopPropagation()}>
              <h2 style={{ color: 'var(--text-primary)', marginBottom: 8 }}>Delete Asset?</h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>
                Are you sure you want to remove <strong>{asset.name}</strong> from your portfolio? This action cannot be undone.
              </p>
              <div style={{ display: 'flex', gap: 12 }}>
                <GlassButton text="Cancel" onClick={() => setShowDeleteConfirm(false)} />
                <GlassButton text="Delete" onClick={handleDelete} isPrimary />
              </div>
            </div>
          </GlassContainer>
        </div>
      )}

      {/* TradingView Full Chart */}
      {showTvChart && asset.symbol && (
        <TradingViewChart
          symbol={getTradingViewSymbol(asset.symbol, asset.type)}
          onClose={() => setShowTvChart(false)}
        />
      )}
    </div>
  )
}

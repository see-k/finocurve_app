import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Edit3, Trash2 } from 'lucide-react'
import GlassContainer from '../../components/glass/GlassContainer'
import GlassButton from '../../components/glass/GlassButton'
import GlassIconButton from '../../components/glass/GlassIconButton'
import type { Asset, AmortizationEntry } from '../../types'
import { loanPrincipal, loanBalance, loanPaidOff, loanPayoffPercent, LOAN_TYPE_LABELS, LOAN_TYPE_ICONS } from '../../types'
import './DetailScreen.css'

function computeAmortization(principal: number, annualRate: number, termMonths: number, monthlyPayment: number): AmortizationEntry[] {
  const schedule: AmortizationEntry[] = []
  let balance = principal
  const monthlyRate = annualRate / 100 / 12

  for (let m = 1; m <= termMonths && balance > 0; m++) {
    const interest = balance * monthlyRate
    const principalPay = Math.min(monthlyPayment - interest, balance)
    balance -= principalPay
    schedule.push({
      month: m,
      payment: monthlyPayment,
      principal: +principalPay.toFixed(2),
      interest: +interest.toFixed(2),
      balance: +Math.max(balance, 0).toFixed(2),
    })
  }
  return schedule
}

function computePayoffSavings(principal: number, annualRate: number, termMonths: number, monthlyPayment: number, extra: number) {
  const monthlyRate = annualRate / 100 / 12
  let balanceNormal = principal
  let balanceExtra = principal
  let normalMonths = 0
  let extraMonths = 0
  let normalInterest = 0
  let extraInterest = 0

  for (let m = 0; m < termMonths * 2 && (balanceNormal > 0 || balanceExtra > 0); m++) {
    if (balanceNormal > 0) {
      const intN = balanceNormal * monthlyRate
      normalInterest += intN
      balanceNormal -= (monthlyPayment - intN)
      if (balanceNormal <= 0) { balanceNormal = 0; normalMonths = m + 1 }
    }
    if (balanceExtra > 0) {
      const intE = balanceExtra * monthlyRate
      extraInterest += intE
      balanceExtra -= (monthlyPayment + extra - intE)
      if (balanceExtra <= 0) { balanceExtra = 0; extraMonths = m + 1 }
    }
  }
  if (normalMonths === 0) normalMonths = termMonths
  if (extraMonths === 0) extraMonths = termMonths

  return {
    normalMonths, extraMonths,
    normalInterest: +normalInterest.toFixed(2),
    extraInterest: +extraInterest.toFixed(2),
    monthsSaved: normalMonths - extraMonths,
    interestSaved: +(normalInterest - extraInterest).toFixed(2),
  }
}

export default function LoanDetailScreen() {
  const navigate = useNavigate()
  const { assetId } = useParams()
  const [visible, setVisible] = useState(false)
  const [tab, setTab] = useState<'overview' | 'amortization' | 'payoff'>('overview')
  const [extraPay, setExtraPay] = useState(0)

  const portfolio = JSON.parse(localStorage.getItem('finocure-portfolio') || '{}')
  const asset: Asset | undefined = (portfolio.assets || []).find((a: Asset) => a.id === assetId)

  useEffect(() => { requestAnimationFrame(() => setVisible(true)) }, [])

  const principal = asset ? loanPrincipal(asset) : 0
  const balance = asset ? loanBalance(asset) : 0
  const paidOff = asset ? loanPaidOff(asset) : 0
  const payoffPct = asset ? loanPayoffPercent(asset) : 0
  const rate = asset?.interestRate || 0
  const term = asset?.loanTermMonths || 360
  const payment = asset?.monthlyPayment || 0

  const amortSchedule = useMemo(() => {
    if (!principal || !rate || !payment) return []
    return computeAmortization(principal, rate, term, payment)
  }, [principal, rate, term, payment])

  const payoffCalc = useMemo(() => {
    if (!principal || !rate || !payment) return null
    return computePayoffSavings(principal, rate, term, payment, extraPay)
  }, [principal, rate, term, payment, extraPay])

  const fmt = (n: number) => '$' + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  if (!asset) {
    return (
      <div className="detail-screen">
        <GlassContainer>
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>Loan not found</p>
          <GlassButton text="Go Back" onClick={() => navigate(-1)} />
        </GlassContainer>
      </div>
    )
  }

  const handleDelete = () => {
    const p = JSON.parse(localStorage.getItem('finocure-portfolio') || '{}')
    p.assets = (p.assets || []).filter((a: Asset) => a.id !== asset.id)
    p.updatedAt = new Date().toISOString()
    localStorage.setItem('finocure-portfolio', JSON.stringify(p))
    navigate('/main', { replace: true })
  }

  const circumference = 2 * Math.PI * 60
  const strokeDashoffset = circumference * (1 - payoffPct / 100)

  return (
    <div className="detail-screen">
      <div className="detail-bg-glow detail-bg-glow--1" />
      <div className="detail-bg-glow detail-bg-glow--2" />
      <div className={`detail-content ${visible ? 'detail-content--visible' : ''}`}>
        <div className="detail-header">
          <GlassIconButton icon={<ArrowLeft size={20} />} onClick={() => navigate(-1)} size={44} />
          <div className="detail-header-right">
            <GlassIconButton icon={<Trash2 size={18} />} onClick={handleDelete} size={40} title="Delete" />
          </div>
        </div>

        <GlassContainer>
          <div className="asset-hero">
            <div className="asset-hero__icon">{asset.loanType ? LOAN_TYPE_ICONS[asset.loanType] : '🏦'}</div>
            <div>
              <div className="asset-hero__name">{asset.name}</div>
              <div className="asset-hero__symbol">{asset.loanType ? LOAN_TYPE_LABELS[asset.loanType] : 'Loan'}</div>
            </div>
          </div>

          <div className="tab-bar">
            <button className={`tab-btn ${tab === 'overview' ? 'tab-btn--active' : ''}`} onClick={() => setTab('overview')}>Overview</button>
            <button className={`tab-btn ${tab === 'amortization' ? 'tab-btn--active' : ''}`} onClick={() => setTab('amortization')}>Amortization</button>
            <button className={`tab-btn ${tab === 'payoff' ? 'tab-btn--active' : ''}`} onClick={() => setTab('payoff')}>Payoff</button>
          </div>

          {tab === 'overview' && (
            <>
              <div className="progress-ring-container">
                <svg width="140" height="140" viewBox="0 0 140 140" className="risk-score-svg" style={{ position: 'relative' }}>
                  <circle cx="70" cy="70" r="60" fill="none" stroke="var(--glass-border)" strokeWidth="8" />
                  <circle
                    cx="70" cy="70" r="60" fill="none"
                    stroke="var(--brand-primary)" strokeWidth="8" strokeLinecap="round"
                    strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
                    transform="rotate(-90 70 70)"
                    style={{ transition: 'stroke-dashoffset 0.8s ease' }}
                  />
                </svg>
                <div style={{ position: 'absolute', textAlign: 'center' }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)' }}>{payoffPct.toFixed(1)}%</div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Paid Off</div>
                </div>
              </div>

              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-card__label">Principal</div>
                  <div className="stat-card__value">{fmt(principal)}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-card__label">Balance</div>
                  <div className="stat-card__value">{fmt(balance)}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-card__label">Paid Off</div>
                  <div className="stat-card__value" style={{ color: 'var(--status-success)' }}>{fmt(paidOff)}</div>
                </div>
              </div>

              <div className="info-rows">
                <div className="info-row"><span className="info-row__label">Interest Rate</span><span className="info-row__value">{rate}%</span></div>
                <div className="info-row"><span className="info-row__label">Monthly Payment</span><span className="info-row__value">{fmt(payment)}</span></div>
                <div className="info-row"><span className="info-row__label">Term</span><span className="info-row__value">{term} months ({(term / 12).toFixed(0)} yrs)</span></div>
                {asset.loanStartDate && <div className="info-row"><span className="info-row__label">Start Date</span><span className="info-row__value">{asset.loanStartDate}</span></div>}
              </div>
            </>
          )}

          {tab === 'amortization' && (
            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              {amortSchedule.length > 0 ? (
                <table className="amort-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Payment</th>
                      <th>Principal</th>
                      <th>Interest</th>
                      <th>Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {amortSchedule.map(row => (
                      <tr key={row.month}>
                        <td>{row.month}</td>
                        <td>{fmt(row.payment)}</td>
                        <td>{fmt(row.principal)}</td>
                        <td>{fmt(row.interest)}</td>
                        <td>{fmt(row.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p style={{ color: 'var(--text-tertiary)', textAlign: 'center', padding: 20 }}>
                  Enter interest rate and monthly payment to see the amortization schedule.
                </p>
              )}
            </div>
          )}

          {tab === 'payoff' && (
            <>
              <div className="detail-section-title">Extra Monthly Payment</div>
              <div className="payoff-slider-row">
                <input
                  type="range"
                  className="payoff-slider"
                  min={0}
                  max={Math.max(payment * 2, 2000)}
                  step={50}
                  value={extraPay}
                  onChange={e => setExtraPay(+e.target.value)}
                />
                <span className="payoff-slider-label">{fmt(extraPay)}/mo</span>
              </div>

              {payoffCalc && (
                <div className="stats-grid">
                  <div className="stat-card">
                    <div className="stat-card__label">Original Term</div>
                    <div className="stat-card__value">{payoffCalc.normalMonths} mo</div>
                    <div className="stat-card__sub">{(payoffCalc.normalMonths / 12).toFixed(1)} years</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-card__label">New Term</div>
                    <div className="stat-card__value" style={{ color: 'var(--status-success)' }}>{payoffCalc.extraMonths} mo</div>
                    <div className="stat-card__sub">{(payoffCalc.extraMonths / 12).toFixed(1)} years</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-card__label">Months Saved</div>
                    <div className="stat-card__value" style={{ color: 'var(--status-success)' }}>{payoffCalc.monthsSaved}</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-card__label">Total Interest (Normal)</div>
                    <div className="stat-card__value">{fmt(payoffCalc.normalInterest)}</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-card__label">Total Interest (Extra)</div>
                    <div className="stat-card__value" style={{ color: 'var(--status-success)' }}>{fmt(payoffCalc.extraInterest)}</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-card__label">Interest Saved</div>
                    <div className="stat-card__value" style={{ color: 'var(--status-success)' }}>{fmt(payoffCalc.interestSaved)}</div>
                  </div>
                </div>
              )}

              {!payoffCalc && (
                <p style={{ color: 'var(--text-tertiary)', textAlign: 'center', padding: 20 }}>
                  Enter loan details to see the payoff analysis.
                </p>
              )}
            </>
          )}
        </GlassContainer>
      </div>
    </div>
  )
}

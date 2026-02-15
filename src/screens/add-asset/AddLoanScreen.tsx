import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Landmark } from 'lucide-react'
import GlassContainer from '../../components/glass/GlassContainer'
import GlassButton from '../../components/glass/GlassButton'
import GlassTextField from '../../components/glass/GlassTextField'
import GlassIconButton from '../../components/glass/GlassIconButton'
import type { Asset, LoanType } from '../../types'
import { LOAN_TYPE_LABELS } from '../../types'
import './AddAsset.css'

export default function AddLoanScreen() {
  const navigate = useNavigate()
  const [visible, setVisible] = useState(false)

  const [name, setName] = useState('')
  const [loanType, setLoanType] = useState<LoanType>('mortgage')
  const [principal, setPrincipal] = useState('')
  const [balance, setBalance] = useState('')
  const [interestRate, setInterestRate] = useState('')
  const [termMonths, setTermMonths] = useState('')
  const [monthlyPayment, setMonthlyPayment] = useState('')
  const [startDate, setStartDate] = useState('')
  const [extraPayment, setExtraPayment] = useState('')

  useEffect(() => { requestAnimationFrame(() => setVisible(true)) }, [])

  const handleAdd = () => {
    if (!name || !principal || !balance) return
    const asset: Asset = {
      id: crypto.randomUUID(),
      name,
      type: 'other',
      category: 'loan',
      quantity: 1,
      costBasis: -Math.abs(parseFloat(principal)),
      currentPrice: -Math.abs(parseFloat(balance)),
      currency: 'USD',
      tags: [],
      loanType,
      interestRate: interestRate ? parseFloat(interestRate) : undefined,
      loanTermMonths: termMonths ? parseInt(termMonths) : undefined,
      monthlyPayment: monthlyPayment ? parseFloat(monthlyPayment) : undefined,
      loanStartDate: startDate || undefined,
      extraMonthlyPayment: extraPayment ? parseFloat(extraPayment) : undefined,
    }
    const portfolio = JSON.parse(localStorage.getItem('finocure-portfolio') || '{}')
    portfolio.assets = [...(portfolio.assets || []), asset]
    portfolio.updatedAt = new Date().toISOString()
    localStorage.setItem('finocure-portfolio', JSON.stringify(portfolio))
    navigate('/main', { replace: true })
  }

  return (
    <div className="add-asset-screen">
      <div className="add-asset-bg-glow add-asset-bg-glow--1" />
      <div className="add-asset-bg-glow add-asset-bg-glow--2" />
      <div className={`add-asset-content ${visible ? 'add-asset-content--visible' : ''}`}>
        <div className="add-asset-header">
          <GlassIconButton icon={<ArrowLeft size={20} />} onClick={() => navigate(-1)} size={44} />
        </div>
        <GlassContainer>
          <h1 className="add-asset-title">Add a Loan</h1>
          <p className="add-asset-subtitle">Track your mortgage, student loan, or other debt</p>

          <div className="add-asset-form">
            <div>
              <label className="add-asset-label">Loan Name *</label>
              <GlassTextField value={name} onChange={setName} placeholder="e.g. Home Mortgage" prefixIcon={<Landmark size={16} />} />
            </div>

            <div>
              <label className="add-asset-label">Loan Type</label>
              <select className="add-asset-select" value={loanType} onChange={e => setLoanType(e.target.value as LoanType)}>
                {(Object.keys(LOAN_TYPE_LABELS) as LoanType[]).map(t => (
                  <option key={t} value={t}>{LOAN_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>

            <div className="add-asset-row">
              <div>
                <label className="add-asset-label">Original Principal *</label>
                <GlassTextField value={principal} onChange={setPrincipal} placeholder="350000" type="number" />
              </div>
              <div>
                <label className="add-asset-label">Current Balance *</label>
                <GlassTextField value={balance} onChange={setBalance} placeholder="280000" type="number" />
              </div>
            </div>

            <div className="add-asset-row">
              <div>
                <label className="add-asset-label">Interest Rate (%)</label>
                <GlassTextField value={interestRate} onChange={setInterestRate} placeholder="6.5" type="number" />
              </div>
              <div>
                <label className="add-asset-label">Term (months)</label>
                <GlassTextField value={termMonths} onChange={setTermMonths} placeholder="360" type="number" />
              </div>
            </div>

            <div className="add-asset-row">
              <div>
                <label className="add-asset-label">Monthly Payment</label>
                <GlassTextField value={monthlyPayment} onChange={setMonthlyPayment} placeholder="2212" type="number" />
              </div>
              <div>
                <label className="add-asset-label">Start Date</label>
                <GlassTextField value={startDate} onChange={setStartDate} placeholder="2023-01-15" type="date" />
              </div>
            </div>

            <div>
              <label className="add-asset-label">Extra Monthly Payment</label>
              <GlassTextField value={extraPayment} onChange={setExtraPayment} placeholder="0" type="number" />
            </div>

            <div className="add-asset-actions">
              <GlassButton text="Cancel" onClick={() => navigate(-1)} />
              <GlassButton
                text="Add Loan"
                onClick={handleAdd}
                isPrimary
                disabled={!name || !principal || !balance}
              />
            </div>
          </div>
        </GlassContainer>
      </div>
    </div>
  )
}

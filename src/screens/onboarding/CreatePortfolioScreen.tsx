import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Briefcase } from 'lucide-react'
import GlassContainer from '../../components/glass/GlassContainer'
import GlassButton from '../../components/glass/GlassButton'
import GlassTextField from '../../components/glass/GlassTextField'
import GlassIconButton from '../../components/glass/GlassIconButton'
import { CURRENCIES } from '../../types'
import './OnboardingScreen.css'

export default function CreatePortfolioScreen() {
  const navigate = useNavigate()
  const [visible, setVisible] = useState(false)
  const [name, setName] = useState('My Portfolio')
  const [currency, setCurrency] = useState('USD')

  useEffect(() => { requestAnimationFrame(() => setVisible(true)) }, [])

  const handleContinue = () => {
    const prefs = JSON.parse(localStorage.getItem('finocurve-preferences') || '{}')
    prefs.defaultCurrency = currency

    const portfolio = {
      id: crypto.randomUUID(),
      name,
      currency,
      assets: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    localStorage.setItem('finocurve-portfolio', JSON.stringify(portfolio))
    localStorage.setItem('finocurve-preferences', JSON.stringify(prefs))
    navigate('/onboarding/add-first-asset')
  }

  return (
    <div className="onboarding-screen">
      <div className="onboarding-bg-glow onboarding-bg-glow--1" />
      <div className="onboarding-bg-glow onboarding-bg-glow--2" />

      <div className={`onboarding-content ${visible ? 'onboarding-content--visible' : ''}`}>
        <div className="onboarding-header">
          <GlassIconButton icon={<ArrowLeft size={20} />} onClick={() => navigate(-1)} size={44} />
          <div className="onboarding-step-indicator">
            <div className="onboarding-step-dot" />
            <div className="onboarding-step-dot onboarding-step-dot--active" />
            <div className="onboarding-step-dot" />
          </div>
        </div>

        <GlassContainer className="onboarding-card">
          <h1 className="onboarding-title">Create Portfolio</h1>
          <p className="onboarding-subtitle">Name your portfolio and choose a base currency</p>

          <div className="onboarding-section-label">Portfolio Name</div>
          <GlassTextField
            value={name}
            onChange={setName}
            placeholder="Enter portfolio name"
            prefixIcon={<Briefcase size={18} />}
          />

          <div className="onboarding-section-label">Base Currency</div>
          <div className="currency-list">
            {CURRENCIES.map(c => (
              <div
                key={c.code}
                className={`currency-item ${currency === c.code ? 'currency-item--selected' : ''}`}
                onClick={() => setCurrency(c.code)}
              >
                <div>
                  <span className="currency-item__code">{c.code}</span>
                  <span className="currency-item__name" style={{ marginLeft: 8 }}>{c.name}</span>
                </div>
                <span className="currency-item__symbol">{c.symbol}</span>
              </div>
            ))}
          </div>

          <div className="onboarding-actions">
            <GlassButton text="Back" onClick={() => navigate(-1)} />
            <GlassButton text="Continue" onClick={handleContinue} isPrimary disabled={!name.trim()} />
          </div>
        </GlassContainer>
      </div>
    </div>
  )
}

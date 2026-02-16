import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import GlassContainer from '../../components/glass/GlassContainer'
import GlassButton from '../../components/glass/GlassButton'
import GlassIconButton from '../../components/glass/GlassIconButton'
import {
  ASSET_TYPE_LABELS, ASSET_TYPE_ICONS, INVESTMENT_GOAL_INFO,
} from '../../types'
import type { AssetType, InvestmentGoal, DataEntryMethod } from '../../types'
import './OnboardingScreen.css'

const ASSET_TYPES = Object.keys(ASSET_TYPE_LABELS) as AssetType[]
const GOALS = Object.keys(INVESTMENT_GOAL_INFO) as InvestmentGoal[]
const DATA_METHODS: { value: DataEntryMethod; label: string; desc: string }[] = [
  { value: 'manual', label: 'Manual Entry', desc: 'Enter your holdings one by one' },
  { value: 'csv', label: 'CSV Import', desc: 'Import from a spreadsheet file' },
  { value: 'demo', label: 'Demo Data', desc: 'Start with sample portfolio to explore' },
]

export default function SetupWizardScreen() {
  const navigate = useNavigate()
  const [visible, setVisible] = useState(false)
  const [selectedTypes, setSelectedTypes] = useState<AssetType[]>(['stock', 'etf'])
  const [goal, setGoal] = useState<InvestmentGoal>('growth')
  const [dataMethod, setDataMethod] = useState<DataEntryMethod>('manual')

  useEffect(() => { requestAnimationFrame(() => setVisible(true)) }, [])

  const toggleType = (t: AssetType) => {
    setSelectedTypes(prev =>
      prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]
    )
  }

  const handleContinue = () => {
    const prefs = JSON.parse(localStorage.getItem('finocurve-preferences') || '{}')
    prefs.selectedAssetTypes = selectedTypes
    prefs.primaryGoal = goal
    prefs.preferredDataEntry = dataMethod
    localStorage.setItem('finocurve-preferences', JSON.stringify(prefs))
    navigate('/onboarding/create-portfolio')
  }

  return (
    <div className="onboarding-screen">
      <div className="onboarding-bg-glow onboarding-bg-glow--1" />
      <div className="onboarding-bg-glow onboarding-bg-glow--2" />

      <div className={`onboarding-content ${visible ? 'onboarding-content--visible' : ''}`}>
        <div className="onboarding-header">
          <GlassIconButton icon={<ArrowLeft size={20} />} onClick={() => navigate(-1)} size={44} />
          <div className="onboarding-step-indicator">
            <div className="onboarding-step-dot onboarding-step-dot--active" />
            <div className="onboarding-step-dot" />
            <div className="onboarding-step-dot" />
          </div>
        </div>

        <GlassContainer className="onboarding-card">
          <h1 className="onboarding-title">Set Up Your Profile</h1>
          <p className="onboarding-subtitle">Tell us about your investment interests</p>

          <div className="onboarding-section-label">Asset Types You Own</div>
          <div className="asset-type-grid">
            {ASSET_TYPES.map(t => (
              <div
                key={t}
                className={`asset-type-chip ${selectedTypes.includes(t) ? 'asset-type-chip--selected' : ''}`}
                onClick={() => toggleType(t)}
              >
                <span className="asset-type-chip__icon">{ASSET_TYPE_ICONS[t]}</span>
                {ASSET_TYPE_LABELS[t]}
              </div>
            ))}
          </div>

          <div className="onboarding-section-label">Investment Goal</div>
          <div className="goal-grid">
            {GOALS.map(g => {
              const info = INVESTMENT_GOAL_INFO[g]
              return (
                <div
                  key={g}
                  className={`goal-card ${goal === g ? 'goal-card--selected' : ''}`}
                  onClick={() => setGoal(g)}
                >
                  <span className="goal-card__icon">{info.icon}</span>
                  <span className="goal-card__label">{info.label}</span>
                  <span className="goal-card__desc">{info.desc}</span>
                </div>
              )
            })}
          </div>

          <div className="onboarding-section-label">How Would You Like To Start?</div>
          <div className="data-entry-options">
            {DATA_METHODS.map(m => (
              <div
                key={m.value}
                className={`data-entry-option ${dataMethod === m.value ? 'data-entry-option--selected' : ''}`}
                onClick={() => setDataMethod(m.value)}
              >
                <div className={`data-entry-radio ${dataMethod === m.value ? 'data-entry-radio--checked' : ''}`} />
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{m.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{m.desc}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="onboarding-actions">
            <GlassButton text="Continue" onClick={handleContinue} isPrimary disabled={selectedTypes.length === 0} />
          </div>
        </GlassContainer>
      </div>
    </div>
  )
}

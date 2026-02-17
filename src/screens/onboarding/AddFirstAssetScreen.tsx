import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Search, PenLine, Landmark, Sparkles } from 'lucide-react'
import GlassContainer from '../../components/glass/GlassContainer'
import GlassIconButton from '../../components/glass/GlassIconButton'
import GlassButton from '../../components/glass/GlassButton'
import './OnboardingScreen.css'

const OPTIONS = [
  {
    id: 'search', icon: <Search size={24} />, emoji: '🔍',
    title: 'Search Public Asset', desc: 'Find stocks, ETFs, crypto by name or symbol',
    route: '/add-asset/search',
  },
  {
    id: 'manual', icon: <PenLine size={24} />, emoji: '✏️',
    title: 'Add Manual Asset', desc: 'Enter custom holdings like real estate or private equity',
    route: '/add-asset/manual',
  },
  {
    id: 'loan', icon: <Landmark size={24} />, emoji: '🏦',
    title: 'Add a Loan', desc: 'Track mortgages, student loans, and other debt',
    route: '/add-asset/loan',
  },
  {
    id: 'demo', icon: <Sparkles size={24} />, emoji: '✨',
    title: 'Load Demo Portfolio', desc: 'Start with sample data to explore the app',
    route: 'demo',
  },
]

export default function AddFirstAssetScreen() {
  const navigate = useNavigate()
  const [visible, setVisible] = useState(false)

  useEffect(() => { requestAnimationFrame(() => setVisible(true)) }, [])

  const handleOption = (route: string) => {
    if (route === 'demo') {
      // Load demo portfolio via localStorage
      const demoAssets = [
        {
          id: '1', name: 'Apple Inc.', symbol: 'AAPL', type: 'stock', category: 'public',
          quantity: 50, costBasis: 7500, currentPrice: 227.63, currency: 'USD',
          tags: [], sector: 'technology', country: 'US',
        },
        {
          id: '2', name: 'Vanguard S&P 500', symbol: 'VOO', type: 'etf', category: 'public',
          quantity: 25, costBasis: 9000, currentPrice: 478.35, currency: 'USD',
          tags: [], sector: 'diversified', country: 'US',
        },
        {
          id: '3', name: 'Bitcoin', symbol: 'BTC', type: 'crypto', category: 'public',
          quantity: 0.5, costBasis: 15000, currentPrice: 97450, currency: 'USD',
          tags: [], sector: 'crypto',
        },
        {
          id: '4', name: 'Tesla Inc.', symbol: 'TSLA', type: 'stock', category: 'public',
          quantity: 20, costBasis: 4800, currentPrice: 352.80, currency: 'USD',
          tags: [], sector: 'consumer_discretionary', country: 'US',
        },
      ]
      const existing = JSON.parse(localStorage.getItem('finocurve-portfolio') || '{}')
      existing.assets = demoAssets
      existing.updatedAt = new Date().toISOString()
      localStorage.setItem('finocurve-portfolio', JSON.stringify(existing))

      const prefs = JSON.parse(localStorage.getItem('finocurve-preferences') || '{}')
      prefs.hasCompletedOnboarding = true
      localStorage.setItem('finocurve-preferences', JSON.stringify(prefs))
      navigate('/main', { replace: true })
    } else {
      const prefs = JSON.parse(localStorage.getItem('finocurve-preferences') || '{}')
      prefs.hasCompletedOnboarding = true
      localStorage.setItem('finocurve-preferences', JSON.stringify(prefs))
      navigate(route)
    }
  }

  const handleSkip = () => {
    const prefs = JSON.parse(localStorage.getItem('finocurve-preferences') || '{}')
    prefs.hasCompletedOnboarding = true
    localStorage.setItem('finocurve-preferences', JSON.stringify(prefs))
    navigate('/main', { replace: true })
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
            <div className="onboarding-step-dot" />
            <div className="onboarding-step-dot onboarding-step-dot--active" />
          </div>
        </div>

        <GlassContainer className="onboarding-card">
          <h1 className="onboarding-title">Add Your First Asset</h1>
          <p className="onboarding-subtitle">Choose how you'd like to get started</p>

          <div className="first-asset-options">
            {OPTIONS.map(opt => (
              <div key={opt.id} className="first-asset-card" onClick={() => handleOption(opt.route)}>
                <div className="first-asset-card__icon">{opt.emoji}</div>
                <div className="first-asset-card__text">
                  <div className="first-asset-card__title">{opt.title}</div>
                  <div className="first-asset-card__desc">{opt.desc}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="onboarding-actions">
            <GlassButton text="Skip for Now" onClick={handleSkip} />
          </div>
        </GlassContainer>
      </div>
    </div>
  )
}

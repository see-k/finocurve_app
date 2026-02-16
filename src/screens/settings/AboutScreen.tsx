import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import finocurveLogo from '/images/finocurve-logo.png'
import {
  ArrowLeft, ChevronRight, BarChart3, Shield, Globe,
  Wallet, TrendingUp, Bell, Download, Moon,
} from 'lucide-react'
import GlassContainer from '../../components/glass/GlassContainer'
import GlassIconButton from '../../components/glass/GlassIconButton'
import './SettingsSubScreen.css'

const FEATURES = [
  { icon: <BarChart3 size={16} />, label: 'Portfolio tracking with real-time values' },
  { icon: <Shield size={16} />, label: 'Risk analysis and stress testing' },
  { icon: <Globe size={16} />, label: 'Multi-currency support (18 currencies)' },
  { icon: <Wallet size={16} />, label: 'Loan tracking with amortization' },
  { icon: <TrendingUp size={16} />, label: 'Performance charts and allocation views' },
  { icon: <Bell size={16} />, label: 'Smart notifications and alerts' },
  { icon: <Download size={16} />, label: 'Export to CSV or text' },
  { icon: <Moon size={16} />, label: 'Light and dark mode with liquid glass UI' },
]

export default function AboutScreen() {
  const navigate = useNavigate()
  const [visible, setVisible] = useState(false)

  useEffect(() => { requestAnimationFrame(() => setVisible(true)) }, [])

  return (
    <div className="settings-sub">
      <div className="settings-sub-bg settings-sub-bg--1" />
      <div className="settings-sub-bg settings-sub-bg--2" />
      <div className={`settings-sub-content ${visible ? 'settings-sub-content--visible' : ''}`}>
        <div className="settings-sub-header">
          <GlassIconButton icon={<ArrowLeft size={20} />} onClick={() => navigate(-1)} size={44} />
          <h1 className="settings-sub-title">About</h1>
        </div>

        <GlassContainer>
          <img src={finocurveLogo} alt="FinoCurve" className="about-logo-img" draggable={false} />
          <div className="about-app-name">FinoCurve</div>
          <div className="about-version">Version 1.0.0 (Desktop)</div>
          <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: 14, marginTop: 12, lineHeight: 1.6 }}>
            Your personal portfolio companion. Track investments, analyze risk, and make informed financial decisions — all in one beautiful app.
          </p>

          <div className="about-features">
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 8 }}>
              Features
            </div>
            {FEATURES.map((f, i) => (
              <div key={i} className="about-feature-item">
                <div className="about-feature-icon">{f.icon}</div>
                {f.label}
              </div>
            ))}
          </div>

          <div className="about-links">
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
              Legal
            </div>
            <div className="about-link">
              Terms of Service <ChevronRight size={16} style={{ color: 'var(--text-tertiary)' }} />
            </div>
            <div className="about-link">
              Privacy Policy <ChevronRight size={16} style={{ color: 'var(--text-tertiary)' }} />
            </div>
            <div className="about-link">
              Open Source Licenses <ChevronRight size={16} style={{ color: 'var(--text-tertiary)' }} />
            </div>
          </div>

          <p style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12, marginTop: 24 }}>
            Made with care. All data stored locally on your device.
          </p>
        </GlassContainer>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TrendingUp, Shield, Zap } from 'lucide-react'
import GlassButton from '../components/glass/GlassButton'
import finocurveLogo from '/images/finocurve-logo.png'
import './WelcomeScreen.css'

const WELCOME_BG = 'https://images.unsplash.com/photo-1515266591878-f93e32bc5937?q=80&w=1287&auto=format&fit=crop'

export default function WelcomeScreen() {
  const navigate = useNavigate()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
  }, [])

  return (
    <div className="welcome-screen">
      {/* Background image */}
      <div className="welcome-bg">
        <img src={WELCOME_BG} alt="" className="welcome-bg__img" />
        <div className="welcome-bg__overlay" />
      </div>

      {/* Glow effects */}
      <div className="welcome-bg-glow welcome-bg-glow--1" />
      <div className="welcome-bg-glow welcome-bg-glow--2" />

      <div className={`welcome-content ${visible ? 'welcome-content--visible' : ''}`}>
        {/* Logo */}
        <div className="welcome-logo">
          <img src={finocurveLogo} alt="FinoCurve" className="welcome-logo__img" draggable={false} />
        </div>

        <h1 className="welcome-title">FinoCurve</h1>
        <p className="welcome-tagline">
          Your Gateway to<br />Modern Investment Banking
        </p>

        <div className="welcome-features">
          <FeatureRow icon={<TrendingUp size={20} />} text="Smart Investments" />
          <FeatureRow icon={<Shield size={20} />} text="Bank-Grade Security" />
          <FeatureRow icon={<Zap size={20} />} text="Real-Time Analytics" />
        </div>

        <div className="welcome-actions">
          <GlassButton text="Get Started" onClick={() => navigate('/signup')} isPrimary />
          <GlassButton text="Sign In" onClick={() => navigate('/login')} />
        </div>

        <p className="welcome-terms">
          By continuing, you agree to our{' '}
          <a href="#">Terms of Service</a> and{' '}
          <a href="#">Privacy Policy</a>
        </p>
      </div>
    </div>
  )
}

function FeatureRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="feature-row">
      <div className="feature-row__icon">{icon}</div>
      <span className="feature-row__text">{text}</span>
    </div>
  )
}

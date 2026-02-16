import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import finocurveLogo from '/images/finocurve-logo.png'
import './SplashScreen.css'

const SPLASH_BG = 'https://images.unsplash.com/photo-1515266591878-f93e32bc5937?q=80&w=1287&auto=format&fit=crop'

export default function SplashScreen() {
  const navigate = useNavigate()
  const [fadeIn, setFadeIn] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => setFadeIn(true))

    const timer = setTimeout(() => {
      const prefs = localStorage.getItem('finocure-preferences')
      if (prefs) {
        try {
          const parsed = JSON.parse(prefs)
          if (parsed.hasCompletedOnboarding) {
            navigate('/main', { replace: true })
            return
          }
        } catch {
          // fall through
        }
      }
      navigate('/welcome', { replace: true })
    }, 2500)

    return () => clearTimeout(timer)
  }, [navigate])

  return (
    <div className="splash-screen">
      {/* Background image */}
      <div className="splash-bg">
        <img src={SPLASH_BG} alt="" className="splash-bg__img" />
        <div className="splash-bg__overlay" />
      </div>

      <div className={`splash-content ${fadeIn ? 'splash-content--visible' : ''}`}>
        <div className="splash-logo">
          <img src={finocurveLogo} alt="FinoCurve" className="splash-logo__img" draggable={false} />
          <h1 className="splash-title">FinoCurve</h1>
          <p className="splash-subtitle">Modern Investment Banking</p>
        </div>
        <div className="splash-loader">
          <div className="splash-loader__bar" />
        </div>
      </div>
    </div>
  )
}

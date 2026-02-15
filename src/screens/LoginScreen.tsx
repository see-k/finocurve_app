import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Mail, Lock, Eye, EyeOff } from 'lucide-react'
import GlassButton from '../components/glass/GlassButton'
import GlassTextField from '../components/glass/GlassTextField'
import GlassContainer from '../components/glass/GlassContainer'
import GlassIconButton from '../components/glass/GlassIconButton'
import './AuthScreen.css'

export default function LoginScreen() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
  }, [])

  const handleLogin = () => {
    setIsLoading(true)
    setTimeout(() => {
      setIsLoading(false)
      const prefs = JSON.parse(localStorage.getItem('finocure-preferences') || '{}')
      prefs.userEmail = email
      localStorage.setItem('finocure-preferences', JSON.stringify(prefs))
      if (prefs.hasCompletedOnboarding) {
        navigate('/main', { replace: true })
      } else {
        navigate('/onboarding/setup', { replace: true })
      }
    }, 1500)
  }

  return (
    <div className="auth-screen">
      <div className="auth-bg-glow auth-bg-glow--1" />
      <div className="auth-bg-glow auth-bg-glow--2" />

      <div className={`auth-content ${visible ? 'auth-content--visible' : ''}`}>
        <div className="auth-header">
          <GlassIconButton
            icon={<ArrowLeft size={20} />}
            onClick={() => navigate(-1)}
            size={44}
          />
        </div>

        <img src="/images/finocurve-logo.png" alt="FinoCurve" className="auth-logo" draggable={false} />

        <GlassContainer className="auth-card">
          <h1 className="auth-title">Welcome Back</h1>
          <p className="auth-subtitle">Sign in to your account</p>

          <div className="auth-form">
            <GlassTextField
              value={email}
              onChange={setEmail}
              placeholder="Email address"
              type="email"
              prefixIcon={<Mail size={18} />}
            />
            <GlassTextField
              value={password}
              onChange={setPassword}
              placeholder="Password"
              type={showPassword ? 'text' : 'password'}
              prefixIcon={<Lock size={18} />}
              suffixIcon={
                <button
                  className="auth-toggle-pw"
                  onClick={() => setShowPassword(!showPassword)}
                  type="button"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              }
            />

            <a href="#" className="auth-forgot">Forgot Password?</a>

            <GlassButton
              text="Sign In"
              onClick={handleLogin}
              isPrimary
              isLoading={isLoading}
              disabled={!email || !password}
            />
          </div>

          <p className="auth-switch">
            Don't have an account?{' '}
            <a onClick={() => navigate('/signup')}>Sign Up</a>
          </p>
        </GlassContainer>
      </div>
    </div>
  )
}

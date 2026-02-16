import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, User, Mail, Lock, Eye, EyeOff } from 'lucide-react'
import GlassButton from '../components/glass/GlassButton'
import finocurveLogo from '/images/finocurve-logo.png'
import GlassTextField from '../components/glass/GlassTextField'
import GlassContainer from '../components/glass/GlassContainer'
import GlassIconButton from '../components/glass/GlassIconButton'
import './AuthScreen.css'

export default function SignupScreen() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
  }, [])

  const passwordsMatch = password === confirmPassword
  const canSubmit = name && email && password && confirmPassword && passwordsMatch

  const handleSignup = () => {
    if (!canSubmit) return
    setIsLoading(true)
    setTimeout(() => {
      setIsLoading(false)
      const prefs = JSON.parse(localStorage.getItem('finocurve-preferences') || '{}')
      prefs.userName = name
      prefs.userEmail = email
      localStorage.setItem('finocurve-preferences', JSON.stringify(prefs))
      navigate('/onboarding/setup', { replace: true })
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

        <img src={finocurveLogo} alt="FinoCurve" className="auth-logo" draggable={false} />

        <GlassContainer className="auth-card">
          <h1 className="auth-title">Create Account</h1>
          <p className="auth-subtitle">Start your investment journey</p>

          <div className="auth-form">
            <GlassTextField
              value={name}
              onChange={setName}
              placeholder="Full name"
              prefixIcon={<User size={18} />}
            />
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
            <GlassTextField
              value={confirmPassword}
              onChange={setConfirmPassword}
              placeholder="Confirm password"
              type={showPassword ? 'text' : 'password'}
              prefixIcon={<Lock size={18} />}
              error={confirmPassword && !passwordsMatch ? 'Passwords do not match' : undefined}
            />

            <GlassButton
              text="Create Account"
              onClick={handleSignup}
              isPrimary
              isLoading={isLoading}
              disabled={!canSubmit}
            />
          </div>

          <p className="auth-switch">
            Already have an account?{' '}
            <a onClick={() => navigate('/login')}>Sign In</a>
          </p>
        </GlassContainer>
      </div>
    </div>
  )
}

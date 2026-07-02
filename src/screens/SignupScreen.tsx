import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, User, Mail, Lock, Eye, EyeOff } from 'lucide-react'
import GlassButton from '../components/glass/GlassButton'
import finocurveLogo from '/images/finocurve-logo.png'
import GlassTextField from '../components/glass/GlassTextField'
import GlassContainer from '../components/glass/GlassContainer'
import GlassIconButton from '../components/glass/GlassIconButton'
import { DEFAULT_PREFS } from '../store/usePreferences'
import type { UserPreferences } from '../types'
import { normalizeStoredTheme } from '../theme/themes'
import { canSubmitSignupForm } from '../lib/authFormValidation'
import { hashPassword, isPasswordLongEnough, PASSWORD_MIN_LENGTH } from '../lib/localPasswordAuth'
import { getSavedLocalAccount, upsertSavedLocalAccount } from '../lib/savedLocalAccounts'
import './AuthScreen.css'

export default function SignupScreen() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [signupError, setSignupError] = useState<string | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
  }, [])

  const trimmedName = name.trim()
  const trimmedEmail = email.trim()
  const passwordsMatch = password === confirmPassword
  const passwordLongEnough = isPasswordLongEnough(password)
  const canSubmit = canSubmitSignupForm({ name, email, password, confirmPassword })

  const savedProfileForEmail = useMemo(() => {
    if (!trimmedEmail) return undefined
    return getSavedLocalAccount(trimmedEmail)
  }, [trimmedEmail])

  const handleSignup = async () => {
    if (!canSubmit) return
    setSignupError(null)
    setIsLoading(true)
    try {
      let priorTheme: string | undefined
      try {
        const raw = localStorage.getItem('finocurve-preferences')
        if (raw) {
          const o = JSON.parse(raw) as Partial<UserPreferences>
          if (typeof o.theme === 'string') priorTheme = o.theme
        }
      } catch { /* ignore */ }

      const { saltB64, hashB64 } = await hashPassword(password)

      const prefs: UserPreferences = {
        ...DEFAULT_PREFS,
        theme: normalizeStoredTheme(priorTheme ?? null),
        userName: trimmedName,
        userEmail: trimmedEmail,
        hasCompletedOnboarding: false,
        isGuest: false,
      }
      localStorage.setItem('finocurve-preferences', JSON.stringify(prefs))
      upsertSavedLocalAccount({
        email: trimmedEmail,
        userName: trimmedName,
        hasCompletedOnboarding: false,
        localAuthSaltB64: saltB64,
        localAuthDigestB64: hashB64,
        localAuthKdf: 'pbkdf2-sha256-210k',
      })
      navigate('/onboarding/setup', { replace: true })
    } catch {
      setSignupError('This device or browser does not support secure password hashing. Try updating it or using a different device.')
    } finally {
      setIsLoading(false)
    }
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
            {savedProfileForEmail && (
              <p className="auth-signup-hint" role="status">
                This email already has a saved profile on this device. Use Sign in to open it, or
                enter a different email to add another profile without touching other saved profiles.
              </p>
            )}
            <GlassTextField
              value={password}
              onChange={setPassword}
              placeholder="Password"
              type={showPassword ? 'text' : 'password'}
              prefixIcon={<Lock size={18} />}
              error={
                password.length > 0 && !passwordLongEnough
                  ? `At least ${PASSWORD_MIN_LENGTH} characters`
                  : undefined
              }
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

            {signupError && (
              <p className="auth-error" role="alert">
                {signupError}
              </p>
            )}

            <GlassButton
              text="Create Account"
              onClick={() => void handleSignup()}
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

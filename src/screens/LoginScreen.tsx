import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Mail, Lock, Eye, EyeOff } from 'lucide-react'
import GlassButton from '../components/glass/GlassButton'
import finocurveLogo from '/images/finocurve-logo.png'
import GlassTextField from '../components/glass/GlassTextField'
import GlassContainer from '../components/glass/GlassContainer'
import GlassIconButton from '../components/glass/GlassIconButton'
import { DEFAULT_PREFS } from '../store/usePreferences'
import type { UserPreferences } from '../types'
import { normalizeStoredTheme } from '../theme/themes'
import {
  getSavedLocalAccount,
  loadSavedLocalAccounts,
  upsertSavedLocalAccount,
} from '../lib/savedLocalAccounts'
import { shouldEnterMainAfterSignIn } from '../lib/onboardingRouting'
import { restoreActiveSessionForEmail } from '../lib/perUserLocalArchive'
import type { SavedLocalAccount } from '../lib/savedLocalAccounts'
import './AuthScreen.css'

function initialsFromName(name: string, email: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase().slice(0, 2)
  }
  if (parts.length === 1 && parts[0].length >= 2) {
    return parts[0].slice(0, 2).toUpperCase()
  }
  const local = email.split('@')[0] || email
  return local.slice(0, 2).toUpperCase() || '?'
}

function SavedAccountBubble({
  acct,
  active,
  onSelect,
}: {
  acct: SavedLocalAccount
  active: boolean
  onSelect: () => void
}) {
  const [imgFailed, setImgFailed] = useState(false)
  const pic = acct.profilePicturePath?.trim()
  const showPic = !!pic && !imgFailed

  return (
    <button
      type="button"
      role="listitem"
      className={`auth-account-bubble ${active ? 'auth-account-bubble--active' : ''}`}
      title={acct.email}
      onClick={onSelect}
    >
      <span className="auth-account-bubble__ring">
        {showPic ? (
          <img
            src={pic}
            alt=""
            className="auth-account-bubble__avatar"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <span className="auth-account-bubble__initials">
            {initialsFromName(acct.userName || '', acct.email)}
          </span>
        )}
      </span>
      <span className="auth-account-bubble__name">
        {acct.userName?.trim() || acct.email.split('@')[0]}
      </span>
    </button>
  )
}

export default function LoginScreen() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [visible, setVisible] = useState(false)
  const [savedAccounts, setSavedAccounts] = useState(() => loadSavedLocalAccounts())
  const [pickedSavedOnly, setPickedSavedOnly] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
  }, [])

  const handleLogin = () => {
    setIsLoading(true)
    setTimeout(() => {
      setIsLoading(false)
      const raw = localStorage.getItem('finocurve-preferences')
      let parsed: Partial<UserPreferences> = {}
      try {
        if (raw) parsed = JSON.parse(raw) as Partial<UserPreferences>
      } catch { /* ignore */ }
      const theme = normalizeStoredTheme(
        typeof parsed.theme === 'string' ? parsed.theme : null,
      )
      const saved = getSavedLocalAccount(email)
      const merged: UserPreferences = {
        ...DEFAULT_PREFS,
        ...parsed,
        theme,
      }
      merged.userEmail = email.trim()
      if (saved?.userName) merged.userName = saved.userName
      if (saved?.profilePicturePath) merged.profilePicturePath = saved.profilePicturePath

      const goMain = shouldEnterMainAfterSignIn(merged, saved ?? null)
      merged.hasCompletedOnboarding = goMain

      localStorage.setItem('finocurve-preferences', JSON.stringify(merged))
      restoreActiveSessionForEmail(merged.userEmail || '')
      upsertSavedLocalAccount({
        email: merged.userEmail,
        userName: merged.userName,
        profilePicturePath: merged.profilePicturePath,
        hasCompletedOnboarding: merged.hasCompletedOnboarding,
      })
      setSavedAccounts(loadSavedLocalAccounts())

      if (goMain) {
        navigate('/main', { replace: true })
      } else {
        navigate('/onboarding/setup', { replace: true })
      }
    }, 1500)
  }

  const selectSavedAccount = (acct: { email: string; userName?: string }) => {
    setEmail(acct.email)
    setPickedSavedOnly(true)
    setPassword('')
  }

  const useDifferentAccount = () => {
    setPickedSavedOnly(false)
    setEmail('')
    setPassword('')
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
          <h1 className="auth-title">Welcome Back</h1>
          <p className="auth-subtitle">Sign in to your account</p>

          {savedAccounts.length > 0 && (
            <div className="auth-saved-accounts">
              <p className="auth-saved-accounts__label">Profiles on this device</p>
              <div className="auth-saved-accounts__bubbles" role="list">
                {savedAccounts.map(acct => (
                  <SavedAccountBubble
                    key={acct.email}
                    acct={acct}
                    active={pickedSavedOnly && email === acct.email}
                    onSelect={() => selectSavedAccount(acct)}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="auth-form">
            {pickedSavedOnly ? (
              <div className="auth-picked-account">
                <p className="auth-picked-account__label">Signing in as</p>
                <p className="auth-picked-account__email">{email}</p>
                <button type="button" className="auth-picked-account__switch" onClick={useDifferentAccount}>
                  Use a different email
                </button>
              </div>
            ) : (
              <GlassTextField
                value={email}
                onChange={setEmail}
                placeholder="Email address"
                type="email"
                prefixIcon={<Mail size={18} />}
              />
            )}
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
              disabled={!email.trim() || !password}
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

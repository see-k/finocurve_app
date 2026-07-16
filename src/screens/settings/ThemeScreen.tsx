import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Check } from 'lucide-react'
import GlassContainer from '../../components/glass/GlassContainer'
import GlassIconButton from '../../components/glass/GlassIconButton'
import { useTheme } from '../../theme/ThemeContext'
import { THEME_OPTIONS, type AppThemeId } from '../../theme/themes'
import { usePreferences } from '../../store/usePreferences'
import './SettingsSubScreen.css'
import '../main/SettingsScreen.css'

export default function ThemeScreen() {
  const navigate = useNavigate()
  const { theme, setTheme } = useTheme()
  const { updatePreferences } = usePreferences()
  const [visible, setVisible] = useState(false)

  useEffect(() => { requestAnimationFrame(() => setVisible(true)) }, [])

  const applyTheme = (id: AppThemeId) => {
    setTheme(id)
    updatePreferences({ theme: id })
  }

  return (
    <div className="settings-sub">
      <div className="settings-sub-bg settings-sub-bg--1" />
      <div className="settings-sub-bg settings-sub-bg--2" />
      <div className={`settings-sub-content ${visible ? 'settings-sub-content--visible' : ''}`}>
        <div className="settings-sub-header">
          <GlassIconButton icon={<ArrowLeft size={20} />} onClick={() => navigate(-1)} size={44} />
          <h1 className="settings-sub-title">Theme</h1>
        </div>

        <GlassContainer padding="16px" borderRadius={16} className="settings-group settings-group--theme">
          <p className="settings-theme-hint">Choose a color theme for the app. Your choice is saved on this device.</p>
          <div className="settings-theme-grid">
            {THEME_OPTIONS.map(opt => (
              <button
                key={opt.id}
                type="button"
                aria-pressed={theme === opt.id}
                className={`settings-theme-card ${theme === opt.id ? 'settings-theme-card--active' : ''}`}
                onClick={() => applyTheme(opt.id)}
              >
                <span className={`settings-theme-card__swatch settings-theme-card__swatch--${opt.id}`} aria-hidden />
                <span className="settings-theme-card__label">{opt.label}</span>
                <span className="settings-theme-card__sub">{opt.subtitle}</span>
                {theme === opt.id && <Check className="settings-theme-card__check" size={18} strokeWidth={2.5} aria-hidden />}
              </button>
            ))}
          </div>
        </GlassContainer>
      </div>
    </div>
  )
}

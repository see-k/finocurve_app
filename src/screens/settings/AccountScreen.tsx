import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, User, Mail } from 'lucide-react'
import GlassContainer from '../../components/glass/GlassContainer'
import GlassButton from '../../components/glass/GlassButton'
import GlassTextField from '../../components/glass/GlassTextField'
import GlassIconButton from '../../components/glass/GlassIconButton'
import { usePreferences } from '../../store/usePreferences'
import './SettingsSubScreen.css'

export default function AccountScreen() {
  const navigate = useNavigate()
  const { prefs, updatePreferences } = usePreferences()
  const [visible, setVisible] = useState(false)
  const [name, setName] = useState(prefs.userName || '')
  const [email, setEmail] = useState(prefs.userEmail || '')

  useEffect(() => {
    setName(prefs.userName || '')
    setEmail(prefs.userEmail || '')
  }, [prefs])

  useEffect(() => { requestAnimationFrame(() => setVisible(true)) }, [])

  const handleSave = () => {
    updatePreferences({ userName: name, userEmail: email })
    navigate(-1)
  }

  const initials = (name || 'U').split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div className="settings-sub">
      <div className="settings-sub-bg settings-sub-bg--1" />
      <div className="settings-sub-bg settings-sub-bg--2" />
      <div className={`settings-sub-content ${visible ? 'settings-sub-content--visible' : ''}`}>
        <div className="settings-sub-header">
          <GlassIconButton icon={<ArrowLeft size={20} />} onClick={() => navigate(-1)} size={44} />
          <h1 className="settings-sub-title">Account</h1>
        </div>

        <GlassContainer>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 24 }}>
            <div style={{
              width: 80, height: 80, borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-secondary))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 28, fontWeight: 800, color: 'white', marginBottom: 8,
            }}>
              {initials}
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Tap to change photo</p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Name</label>
              <GlassTextField value={name} onChange={setName} placeholder="Your name" prefixIcon={<User size={16} />} />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Email</label>
              <GlassTextField value={email} onChange={setEmail} placeholder="your@email.com" prefixIcon={<Mail size={16} />} type="email" />
            </div>
            <GlassButton text="Save Changes" onClick={handleSave} isPrimary />
          </div>
        </GlassContainer>
      </div>
    </div>
  )
}

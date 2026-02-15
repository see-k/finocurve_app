import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Check } from 'lucide-react'
import GlassContainer from '../../components/glass/GlassContainer'
import GlassIconButton from '../../components/glass/GlassIconButton'
import { CURRENCIES } from '../../types'
import './SettingsSubScreen.css'

export default function CurrencyPickerScreen() {
  const navigate = useNavigate()
  const [visible, setVisible] = useState(false)
  const prefs = JSON.parse(localStorage.getItem('finocure-preferences') || '{}')
  const [selected, setSelected] = useState(prefs.defaultCurrency || 'USD')

  useEffect(() => { requestAnimationFrame(() => setVisible(true)) }, [])

  const handleSelect = (code: string) => {
    setSelected(code)
    const p = JSON.parse(localStorage.getItem('finocure-preferences') || '{}')
    p.defaultCurrency = code
    localStorage.setItem('finocure-preferences', JSON.stringify(p))
  }

  return (
    <div className="settings-sub">
      <div className="settings-sub-bg settings-sub-bg--1" />
      <div className="settings-sub-bg settings-sub-bg--2" />
      <div className={`settings-sub-content ${visible ? 'settings-sub-content--visible' : ''}`}>
        <div className="settings-sub-header">
          <GlassIconButton icon={<ArrowLeft size={20} />} onClick={() => navigate(-1)} size={44} />
          <h1 className="settings-sub-title">Currency</h1>
        </div>

        <GlassContainer>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {CURRENCIES.map(c => (
              <div
                key={c.code}
                onClick={() => handleSelect(c.code)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '14px 16px', borderRadius: 12, cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  background: selected === c.code ? 'rgba(99, 102, 241, 0.12)' : 'transparent',
                  border: `1.5px solid ${selected === c.code ? 'var(--brand-primary)' : 'transparent'}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 20, width: 28, textAlign: 'center' }}>{c.symbol}</span>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{c.code}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{c.name}</div>
                  </div>
                </div>
                {selected === c.code && <Check size={18} style={{ color: 'var(--brand-primary)' }} />}
              </div>
            ))}
          </div>
        </GlassContainer>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Sun, Moon, User, DollarSign, Bell, HelpCircle, Info,
  LogOut, ChevronRight, Download, RefreshCw, Trash2, Shield, Cloud,
} from 'lucide-react'
import GlassContainer from '../../components/glass/GlassContainer'
import GlassButton from '../../components/glass/GlassButton'
import UserAvatar from '../../components/UserAvatar'
import { useTheme } from '../../theme/ThemeContext'
import { usePreferences } from '../../store/usePreferences'
import { usePortfolio } from '../../store/usePortfolio'
import './SettingsScreen.css'

export default function SettingsScreen() {
  const { theme, setTheme } = useTheme()
  const { prefs, updatePreferences, resetPreferences } = usePreferences()
  const { portfolio } = usePortfolio()
  const navigate = useNavigate()
  const [showExportModal, setShowExportModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const userName = prefs.userName || 'Guest User'
  const userEmail = prefs.userEmail || 'Not signed in'
  const initials = userName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)

  const handleSignOut = async () => {
    await window.electronAPI?.s3ClearCredentials?.()
    resetPreferences()
    localStorage.removeItem('finocure-portfolio')
    localStorage.removeItem('finocure-watchlist')
    localStorage.removeItem('finocure-notifications')
    navigate('/', { replace: true })
  }

  const handleRefreshPrices = () => {
    setRefreshing(true)
    // Simulate price refresh
    setTimeout(() => setRefreshing(false), 2000)
  }

  const handleExport = (format: 'csv' | 'text') => {
    if (!portfolio) return
    let content = ''
    if (format === 'csv') {
      content = 'Name,Symbol,Type,Category,Quantity,Cost Basis,Current Price,Currency\n'
      for (const a of portfolio.assets) {
        content += `"${a.name}","${a.symbol || ''}","${a.type}","${a.category}",${a.quantity},${a.costBasis},${a.currentPrice},"${a.currency}"\n`
      }
    } else {
      content = `Portfolio: ${portfolio.name}\nCurrency: ${portfolio.currency}\nAssets: ${portfolio.assets.length}\n\n`
      for (const a of portfolio.assets) {
        content += `${a.name} (${a.symbol || a.type}): ${a.quantity} @ $${a.currentPrice}\n`
      }
    }
    const blob = new Blob([content], { type: format === 'csv' ? 'text/csv' : 'text/plain' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `finocure-portfolio.${format === 'csv' ? 'csv' : 'txt'}`
    link.click()
    URL.revokeObjectURL(url)
    setShowExportModal(false)
  }

  const handleDeleteAccount = async () => {
    await window.electronAPI?.s3ClearCredentials?.()
    resetPreferences()
    localStorage.removeItem('finocure-portfolio')
    localStorage.removeItem('finocure-watchlist')
    localStorage.removeItem('finocure-notifications')
    navigate('/', { replace: true })
  }

  return (
    <div className="settings">
      <div className="settings-header">
        <h1 className="settings-header__title">Settings</h1>
        <p className="settings-header__subtitle">Manage your preferences</p>
      </div>

      {/* Profile */}
      <GlassContainer padding="20px 24px" borderRadius={20} className="settings-profile" onClick={() => navigate('/settings/account')}>
        <UserAvatar src={prefs.profilePicturePath} initials={initials} size={52} className="settings-avatar" />
        <div className="settings-profile__info">
          <span className="settings-profile__name">{userName}</span>
          <span className="settings-profile__email">{userEmail}</span>
        </div>
        <ChevronRight size={18} className="settings-profile__arrow" />
      </GlassContainer>

      {/* Quick actions */}
      <div className="settings-quick-actions">
        <GlassContainer padding="16px" borderRadius={14} className="settings-quick-btn" onClick={handleRefreshPrices}>
          <RefreshCw size={20} className={refreshing ? 'spin' : ''} />
          <span>{refreshing ? 'Refreshing...' : 'Refresh Prices'}</span>
        </GlassContainer>
        <GlassContainer padding="16px" borderRadius={14} className="settings-quick-btn" onClick={() => setShowExportModal(true)}>
          <Download size={20} />
          <span>Export Data</span>
        </GlassContainer>
      </div>

      {/* Appearance */}
      <div className="settings-section">
        <h2 className="settings-section__title">Appearance</h2>
        <GlassContainer padding="0" borderRadius={16} className="settings-group">
          <div className="settings-theme-picker">
            <button className={`theme-option ${theme === 'light' ? 'theme-option--active' : ''}`} onClick={() => setTheme('light')}>
              <Sun size={20} /><span>Light</span>
            </button>
            <button className={`theme-option ${theme === 'dark' ? 'theme-option--active' : ''}`} onClick={() => setTheme('dark')}>
              <Moon size={20} /><span>Dark</span>
            </button>
          </div>
        </GlassContainer>
      </div>

      {/* Preferences */}
      <div className="settings-section">
        <h2 className="settings-section__title">Preferences</h2>
        <GlassContainer padding="0" borderRadius={16} className="settings-group">
          <SettingsRow icon={<DollarSign size={18} />} label="Currency" value={prefs.defaultCurrency} onClick={() => navigate('/settings/currency')} />
          <SettingsRow icon={<Bell size={18} />} label="Notifications" value={prefs.notificationsEnabled ? 'On' : 'Off'}
            toggle toggled={prefs.notificationsEnabled}
            onToggle={() => updatePreferences({ notificationsEnabled: !prefs.notificationsEnabled })} />
          <SettingsRow icon={<Shield size={18} />} label="Price Alerts" value={prefs.priceAlerts ? 'On' : 'Off'}
            toggle toggled={prefs.priceAlerts}
            onToggle={() => updatePreferences({ priceAlerts: !prefs.priceAlerts })} />
          {typeof window !== 'undefined' && window.electronAPI?.s3List && (
            <SettingsRow icon={<Cloud size={18} />} label="Cloud Storage" value={prefs.s3Bucket ? 'Connected' : 'Not connected'} onClick={() => navigate('/settings/cloud-storage')} />
          )}
        </GlassContainer>
      </div>

      {/* Support */}
      <div className="settings-section">
        <h2 className="settings-section__title">Support</h2>
        <GlassContainer padding="0" borderRadius={16} className="settings-group">
          <SettingsRow icon={<HelpCircle size={18} />} label="Help & FAQ" onClick={() => navigate('/settings/help')} />
          <SettingsRow icon={<Info size={18} />} label="About FinoCurve" value="v1.0.0" onClick={() => navigate('/settings/about')} />
        </GlassContainer>
      </div>

      {/* Danger Zone */}
      <div className="settings-section">
        <h2 className="settings-section__title" style={{ color: 'var(--status-error)' }}>Danger Zone</h2>
        <GlassContainer padding="0" borderRadius={16} className="settings-group">
          <SettingsRow icon={<Trash2 size={18} />} label="Delete Account" danger onClick={() => setShowDeleteConfirm(true)} />
        </GlassContainer>
      </div>

      {/* Sign Out */}
      <button className="settings-signout" onClick={handleSignOut}>
        <LogOut size={18} /><span>Sign Out</span>
      </button>

      {/* Export Modal */}
      {showExportModal && (
        <div className="modal-overlay" onClick={() => setShowExportModal(false)}>
          <GlassContainer className="modal-content" onClick={undefined}>
            <div onClick={e => e.stopPropagation()}>
              <h2 style={{ color: 'var(--text-primary)', marginBottom: 16 }}>Export Data</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <GlassButton text="Export as CSV" onClick={() => handleExport('csv')} icon={<Download size={16} />} />
                <GlassButton text="Export as Text" onClick={() => handleExport('text')} icon={<Download size={16} />} />
                <GlassButton text="Cancel" onClick={() => setShowExportModal(false)} />
              </div>
            </div>
          </GlassContainer>
        </div>
      )}

      {/* Delete Confirm */}
      {showDeleteConfirm && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <GlassContainer className="modal-content" onClick={undefined}>
            <div onClick={e => e.stopPropagation()}>
              <h2 style={{ color: 'var(--status-error)', marginBottom: 8 }}>Delete Account?</h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: 20, fontSize: 14 }}>
                This will permanently delete all your data including your portfolio, watchlist, and preferences. This cannot be undone.
              </p>
              <div style={{ display: 'flex', gap: 12 }}>
                <GlassButton text="Cancel" onClick={() => setShowDeleteConfirm(false)} />
                <GlassButton text="Delete Everything" onClick={handleDeleteAccount} isPrimary />
              </div>
            </div>
          </GlassContainer>
        </div>
      )}
    </div>
  )
}

function SettingsRow({
  icon, label, value, onClick, toggle, toggled, onToggle, danger,
}: {
  icon: React.ReactNode; label: string; value?: string
  onClick?: () => void; toggle?: boolean; toggled?: boolean
  onToggle?: () => void; danger?: boolean
}) {
  return (
    <div className={`settings-row ${danger ? 'settings-row--danger' : ''}`} onClick={toggle ? onToggle : onClick}>
      <span className="settings-row__icon">{icon}</span>
      <span className="settings-row__label">{label}</span>
      {toggle ? (
        <div className={`settings-toggle ${toggled ? 'settings-toggle--on' : ''}`}>
          <div className="settings-toggle__thumb" />
        </div>
      ) : (
        <>
          <span className="settings-row__value">{value || ''}</span>
          <ChevronRight size={16} className="settings-row__arrow" />
        </>
      )}
    </div>
  )
}

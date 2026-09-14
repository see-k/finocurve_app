import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DollarSign, Bell, HelpCircle, Info,
  LogOut, ChevronRight, Download, RefreshCw, Trash2, Shield, Cloud, Cpu, Plug, Target, Bot, Palette, Building2,
} from 'lucide-react'
import GlassContainer from '../../components/glass/GlassContainer'
import GlassButton from '../../components/glass/GlassButton'
import UserAvatar from '../../components/UserAvatar'
import PageGround from '../../components/financial/PageGround'
import Panel from '../../components/financial/Panel'
import { StatusChip } from '../../components/financial/Status'
import { useTheme } from '../../theme/ThemeContext'
import { THEME_OPTIONS } from '../../theme/themes'
import { usePreferences } from '../../store/usePreferences'
import { usePortfolio } from '../../store/usePortfolio'
import { removeSavedLocalAccount, upsertSavedLocalAccount } from '../../lib/savedLocalAccounts'
import { archiveActiveSessionForEmail, clearActiveUserDataStorage, removeArchivedSessionForEmail } from '../../lib/perUserLocalArchive'
import {
  archiveTrackerSessionForEmail,
  clearActiveTrackerSession,
  removeArchivedTrackerSessionForEmail,
} from '../../lib/trackerSessionArchive'
import { useEnterpriseMode } from '../../hooks/useEnterpriseMode'
import './SettingsScreen.css'
import { APP_VERSION } from '../../constants/appVersion'

export default function SettingsScreen() {
  const { theme } = useTheme()
  const { prefs, updatePreferences, resetPreferences } = usePreferences()
  const { isEnterprise } = useEnterpriseMode()

  const currentThemeLabel = THEME_OPTIONS.find(o => o.id === theme)?.label ?? 'Theme'
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
    // Note: do NOT call `localStorageClearPath` here. It clears the Electron
    // device-wide "local storage directory" config, which is shared by every
    // profile on the device. Sign-out should only touch this account's session.
    if (prefs.userEmail?.trim()) {
      const em = prefs.userEmail.trim()
      upsertSavedLocalAccount({
        email: em,
        userName: prefs.userName,
        profilePicturePath: prefs.profilePicturePath,
        hasCompletedOnboarding: prefs.hasCompletedOnboarding,
      })
      archiveActiveSessionForEmail(em)
      await archiveTrackerSessionForEmail(em)
    } else {
      clearActiveUserDataStorage()
      await clearActiveTrackerSession()
    }
    resetPreferences()
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
    link.download = `finocurve-portfolio.${format === 'csv' ? 'csv' : 'txt'}`
    link.click()
    URL.revokeObjectURL(url)
    setShowExportModal(false)
  }

  const handleDeleteAccount = async () => {
    await window.electronAPI?.s3ClearCredentials?.()
    // Same caveat as sign-out: leave the device-wide local storage directory
    // config alone; deleting one account must not disconnect storage for any
    // other saved profiles on this device.
    if (prefs.userEmail?.trim()) {
      const em = prefs.userEmail.trim()
      removeSavedLocalAccount(em)
      removeArchivedSessionForEmail(em)
      await removeArchivedTrackerSessionForEmail(em)
    }
    resetPreferences()
    clearActiveUserDataStorage()
    await clearActiveTrackerSession()
    navigate('/', { replace: true })
  }

  return (
    <div className="fin-page settings">
      <PageGround />

      <header className="fin-masthead">
        <div className="fin-masthead__id">
          <div className="fin-masthead__eyebrow">
            <strong>FinoCurve</strong>
            <span className="fin-masthead__sep">/</span>
            <span>Settings</span>
          </div>
          <h1 className="fin-masthead__title">Preferences</h1>
          <p className="fin-masthead__sub">
            Account, display, data and integrations. Everything here is stored on this device.
          </p>
        </div>
        <div className="fin-masthead__actions">
          <button type="button" className="fin-btn" onClick={handleRefreshPrices} disabled={refreshing}>
            <RefreshCw size={13} aria-hidden className={refreshing ? 'spin' : ''} />
            {refreshing ? 'Refreshing…' : 'Refresh prices'}
          </button>
          <button type="button" className="fin-btn" onClick={() => setShowExportModal(true)}>
            <Download size={13} aria-hidden /> Export data
          </button>
        </div>
      </header>

      <div className="fin-stack settings__stack">
        {/* Account */}
        <Panel title="Account" flushBody>
          <button type="button" className="fin-row settings__account" onClick={() => navigate('/settings/account')}>
            <UserAvatar src={prefs.profilePicturePath} initials={initials} size={38} className="settings-avatar" showEnterpriseIndicator />
            <span className="settings__account-text">
              <span className="fin-row__label">{userName}</span>
              <span className="fin-row__sub">{userEmail}</span>
            </span>
            <ChevronRight size={15} className="fin-row__arrow" aria-hidden />
          </button>
        </Panel>

        {/* Preferences */}
        <Panel title="Display & alerts" flushBody>
          <div className="fin-rows">
            <SettingsRow icon={<Palette size={15} />} label="Theme" value={currentThemeLabel} onClick={() => navigate('/settings/theme')} />
            <SettingsRow icon={<DollarSign size={15} />} label="Currency" value={prefs.defaultCurrency} onClick={() => navigate('/settings/currency')} />
            <SettingsRow
              icon={<Bell size={15} />}
              label="Notifications"
              toggle
              toggled={prefs.notificationsEnabled}
              onToggle={() => updatePreferences({ notificationsEnabled: !prefs.notificationsEnabled })}
            />
            <SettingsRow
              icon={<Shield size={15} />}
              label="Price alerts"
              toggle
              toggled={prefs.priceAlerts}
              onToggle={() => updatePreferences({ priceAlerts: !prefs.priceAlerts })}
            />
          </div>
        </Panel>

        {/* Data & integrations */}
        <Panel title="Data & integrations" flushBody>
          <div className="fin-rows">
            {typeof window !== 'undefined' && (window.electronAPI?.s3List || window.electronAPI?.localStorageChooseDirectory) && (
              <SettingsRow icon={<Cloud size={15} />} label="Storage" value={prefs.s3Bucket ? 'S3 connected' : 'Configure'} onClick={() => navigate('/settings/cloud-storage')} />
            )}
            {typeof window !== 'undefined' && window.electronAPI?.trackerGetState && (
              <SettingsRow icon={<Target size={15} />} label="Tracker backup" value="SQLite + S3" onClick={() => navigate('/settings/tracker-storage')} />
            )}
            {typeof window !== 'undefined' && window.electronAPI?.aiConfigGet && (
              <SettingsRow icon={<Cpu size={15} />} label="AI models" value="Configure" onClick={() => navigate('/settings/ai-config')} />
            )}
            <SettingsRow icon={<Bot size={15} />} label="AI experts" value="Expert network" onClick={() => navigate('/main?tab=experts')} />
            {typeof window !== 'undefined' && window.electronAPI?.pluginsSettingsGet && (
              <SettingsRow icon={<Plug size={15} />} label="Plugins" value="API keys" onClick={() => navigate('/settings/plugins')} />
            )}
            <SettingsRow
              icon={<Building2 size={15} />}
              label="Enterprise service"
              trailing={<StatusChip tone={isEnterprise ? 'ok' : 'neutral'} label={isEnterprise ? 'Connected' : 'Not configured'} />}
              onClick={() => navigate('/settings/enterprise')}
            />
          </div>
        </Panel>

        {/* Support */}
        <Panel title="Support" flushBody>
          <div className="fin-rows">
            <SettingsRow icon={<HelpCircle size={15} />} label="Help & FAQ" onClick={() => navigate('/settings/help')} />
            <SettingsRow icon={<Info size={15} />} label="About FinoCurve" value={`v${APP_VERSION}`} onClick={() => navigate('/settings/about')} />
          </div>
        </Panel>

        {/* Session */}
        <Panel title="Session" note="Signing out keeps this account's data archived on the device." flushBody>
          <div className="fin-rows">
            <SettingsRow icon={<LogOut size={15} />} label="Sign out" onClick={handleSignOut} />
            <SettingsRow icon={<Trash2 size={15} />} label="Delete account" danger onClick={() => setShowDeleteConfirm(true)} />
          </div>
        </Panel>
      </div>

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
  icon, label, value, trailing, onClick, toggle, toggled, onToggle, danger,
}: {
  icon: React.ReactNode
  label: string
  value?: string
  trailing?: React.ReactNode
  onClick?: () => void
  toggle?: boolean
  toggled?: boolean
  onToggle?: () => void
  danger?: boolean
}) {
  if (toggle) {
    return (
      <div className="fin-row fin-row--static">
        <span className="fin-row__icon">{icon}</span>
        <span className="fin-row__label">{label}</span>
        <button
          type="button"
          role="switch"
          aria-checked={!!toggled}
          aria-label={label}
          className={`fin-toggle ${toggled ? 'fin-toggle--on' : ''}`.trim()}
          onClick={onToggle}
        >
          <span className="fin-toggle__thumb" />
        </button>
      </div>
    )
  }

  return (
    <button type="button" className={`fin-row ${danger ? 'fin-row--danger' : ''}`.trim()} onClick={onClick}>
      <span className="fin-row__icon">{icon}</span>
      <span className="fin-row__label">{label}</span>
      {trailing ? <span className="fin-row__trailing">{trailing}</span> : null}
      {value ? <span className="fin-row__value">{value}</span> : null}
      <ChevronRight size={15} className="fin-row__arrow" aria-hidden />
    </button>
  )
}

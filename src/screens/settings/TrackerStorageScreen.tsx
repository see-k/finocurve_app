import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Cloud, HardDrive, RefreshCw } from 'lucide-react'
import GlassContainer from '../../components/glass/GlassContainer'
import GlassButton from '../../components/glass/GlassButton'
import GlassIconButton from '../../components/glass/GlassIconButton'
import { usePreferences } from '../../store/usePreferences'
import './SettingsSubScreen.css'
import '../main/SettingsScreen.css'

const hasTracker = typeof window !== 'undefined' && window.electronAPI?.trackerGetState
const hasS3 = typeof window !== 'undefined' && window.electronAPI?.s3HasCredentials

export default function TrackerStorageScreen() {
  const navigate = useNavigate()
  const { prefs, updatePreferences } = usePreferences()
  const [visible, setVisible] = useState(false)
  const [s3Ok, setS3Ok] = useState(false)
  const [busy, setBusy] = useState<'backup' | 'sync' | null>(null)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
  }, [])

  useEffect(() => {
    if (hasS3 && window.electronAPI?.s3HasCredentials) {
      void window.electronAPI.s3HasCredentials().then(setS3Ok)
    }
  }, [])

  const toggleBackup = () => {
    if (!s3Ok) return
    const next = !prefs.trackerS3AutoBackup
    updatePreferences({ trackerS3AutoBackup: next })
    void window.electronAPI?.trackerSetS3Options?.({
      autoBackup: next,
      autoSync: prefs.trackerS3AutoSync,
    })
  }

  const toggleSync = () => {
    if (!s3Ok) return
    const next = !prefs.trackerS3AutoSync
    updatePreferences({ trackerS3AutoSync: next })
    void window.electronAPI?.trackerSetS3Options?.({
      autoBackup: prefs.trackerS3AutoBackup,
      autoSync: next,
    })
  }

  const backupNow = async () => {
    if (!window.electronAPI?.trackerBackupNow) return
    setBusy('backup')
    setStatusMsg(null)
    try {
      const r = await window.electronAPI.trackerBackupNow()
      setStatusMsg(r.ok ? 'Backup uploaded to S3.' : (r.error ?? 'Backup failed'))
    } finally {
      setBusy(null)
    }
  }

  const syncNow = async () => {
    if (!window.electronAPI?.trackerSyncNow) return
    setBusy('sync')
    setStatusMsg(null)
    try {
      const r = await window.electronAPI.trackerSyncNow()
      if (r.ok) setStatusMsg('Synced from S3 (local database updated).')
      else if (r.reason === 'local_newer_or_equal') setStatusMsg('Local data is already up to date or newer.')
      else setStatusMsg(r.reason ?? 'Sync did not apply.')
    } finally {
      setBusy(null)
    }
  }

  if (!hasTracker) {
    return (
      <div className="settings-sub">
        <div className="settings-sub-bg settings-sub-bg--1" />
        <div className="settings-sub-bg settings-sub-bg--2" />
        <div className={`settings-sub-content ${visible ? 'settings-sub-content--visible' : ''}`}>
          <div className="settings-sub-header">
            <GlassIconButton icon={<ArrowLeft size={20} />} onClick={() => navigate(-1)} size={44} />
            <h1 className="settings-sub-title">Tracker backup</h1>
          </div>
          <GlassContainer>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
              Tracker storage options are available in the desktop app.
            </p>
          </GlassContainer>
        </div>
      </div>
    )
  }

  return (
    <div className="settings-sub">
      <div className="settings-sub-bg settings-sub-bg--1" />
      <div className="settings-sub-bg settings-sub-bg--2" />
      <div className={`settings-sub-content ${visible ? 'settings-sub-content--visible' : ''}`}>
        <div className="settings-sub-header">
          <GlassIconButton icon={<ArrowLeft size={20} />} onClick={() => navigate(-1)} size={44} />
          <h1 className="settings-sub-title">Tracker backup</h1>
        </div>

        <GlassContainer padding="20px 24px" borderRadius={18}>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: '0 0 16px', lineHeight: 1.5 }}>
            Net worth and goals are stored in a local SQLite database on this device. You can optionally back up and sync that
            file to your S3 bucket (same credentials as Storage).
          </p>
          {!s3Ok && (
            <p style={{ color: 'var(--status-warning, #f59e0b)', fontSize: 14, margin: '0 0 16px' }}>
              Connect S3 under{' '}
              <button
                type="button"
                onClick={() => navigate('/settings/cloud-storage')}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  color: 'var(--brand-primary)',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                  font: 'inherit',
                }}
              >
                Settings → Storage
              </button>{' '}
              to enable cloud backup.
            </p>
          )}

          <GlassContainer padding="0" borderRadius={16} className="settings-group" style={{ marginBottom: 16 }}>
            <div
              className="settings-row"
              style={{ opacity: s3Ok ? 1 : 0.5, pointerEvents: s3Ok ? 'auto' : 'none' }}
              onClick={toggleBackup}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  toggleBackup()
                }
              }}
            >
              <span className="settings-row__icon"><HardDrive size={18} /></span>
              <span className="settings-row__label">Auto backup to S3</span>
              <div className={`settings-toggle ${prefs.trackerS3AutoBackup ? 'settings-toggle--on' : ''}`}>
                <div className="settings-toggle__thumb" />
              </div>
            </div>
            <div
              className="settings-row"
              style={{ opacity: s3Ok ? 1 : 0.5, pointerEvents: s3Ok ? 'auto' : 'none' }}
              onClick={toggleSync}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  toggleSync()
                }
              }}
            >
              <span className="settings-row__icon"><Cloud size={18} /></span>
              <span className="settings-row__label">Auto sync from S3</span>
              <div className={`settings-toggle ${prefs.trackerS3AutoSync ? 'settings-toggle--on' : ''}`}>
                <div className="settings-toggle__thumb" />
              </div>
            </div>
          </GlassContainer>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <GlassButton
              text={busy === 'backup' ? 'Backing up…' : 'Backup now'}
              icon={<Cloud size={16} />}
              onClick={() => void backupNow()}
              disabled={!s3Ok || busy !== null}
            />
            <GlassButton
              text={busy === 'sync' ? 'Syncing…' : 'Sync from S3 now'}
              icon={<RefreshCw size={16} className={busy === 'sync' ? 'spin' : ''} />}
              onClick={() => void syncNow()}
              disabled={!s3Ok || busy !== null}
            />
          </div>

          {statusMsg && (
            <p style={{ marginTop: 14, fontSize: 13, color: 'var(--text-secondary)' }}>{statusMsg}</p>
          )}
        </GlassContainer>
      </div>
    </div>
  )
}

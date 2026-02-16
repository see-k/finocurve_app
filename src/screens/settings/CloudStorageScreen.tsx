import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Cloud, FolderOpen } from 'lucide-react'
import GlassContainer from '../../components/glass/GlassContainer'
import GlassButton from '../../components/glass/GlassButton'
import GlassTextField from '../../components/glass/GlassTextField'
import GlassIconButton from '../../components/glass/GlassIconButton'
import { usePreferences } from '../../store/usePreferences'
import './SettingsSubScreen.css'

const hasElectronS3 = typeof window !== 'undefined' && window.electronAPI?.s3SaveCredentials
const hasElectronLocal = typeof window !== 'undefined' && window.electronAPI?.localStorageChooseDirectory

export default function CloudStorageScreen() {
  const navigate = useNavigate()
  const { prefs, updatePreferences } = usePreferences()
  const [visible, setVisible] = useState(false)
  const [localPath, setLocalPath] = useState<string | null>(null)
  const [localChoosing, setLocalChoosing] = useState(false)
  const [s3Bucket, setS3Bucket] = useState(prefs.s3Bucket || '')
  const [s3Region, setS3Region] = useState(prefs.s3Region || '')
  const [s3AccessKeyId, setS3AccessKeyId] = useState(prefs.s3AccessKeyId || '')
  const [s3Secret, setS3Secret] = useState('')
  const [s3Saving, setS3Saving] = useState(false)
  const [s3Error, setS3Error] = useState<string | null>(null)

  useEffect(() => {
    setS3Bucket(prefs.s3Bucket || '')
    setS3Region(prefs.s3Region || '')
    setS3AccessKeyId(prefs.s3AccessKeyId || '')
  }, [prefs])

  useEffect(() => { requestAnimationFrame(() => setVisible(true)) }, [])

  useEffect(() => {
    if (hasElectronLocal && window.electronAPI?.localStorageGetPath) {
      window.electronAPI.localStorageGetPath().then((r) => setLocalPath(r.path))
    }
  }, [])

  const handleS3Save = async () => {
    if (!hasElectronS3 || !window.electronAPI?.s3SaveCredentials) return
    setS3Error(null)
    setS3Saving(true)
    try {
      await window.electronAPI.s3SaveCredentials({
        bucket: s3Bucket.trim(),
        region: s3Region.trim(),
        accessKeyId: s3AccessKeyId.trim(),
        secret: s3Secret,
      })
      updatePreferences({ s3Bucket: s3Bucket.trim(), s3Region: s3Region.trim(), s3AccessKeyId: s3AccessKeyId.trim() })
      setS3Secret('')
    } catch (e) {
      setS3Error(e instanceof Error ? e.message : 'Failed to save credentials')
    } finally {
      setS3Saving(false)
    }
  }

  const handleLocalChoose = async () => {
    if (!hasElectronLocal || !window.electronAPI?.localStorageChooseDirectory) return
    setLocalChoosing(true)
    try {
      const { path: p } = await window.electronAPI.localStorageChooseDirectory()
      setLocalPath(p)
    } finally {
      setLocalChoosing(false)
    }
  }

  const handleLocalClear = async () => {
    if (!hasElectronLocal || !window.electronAPI?.localStorageClearPath) return
    try {
      await window.electronAPI.localStorageClearPath()
      setLocalPath(null)
    } catch { /* ignore */ }
  }

  const handleS3Disconnect = async () => {
    if (!hasElectronS3 || !window.electronAPI?.s3ClearCredentials) return
    setS3Error(null)
    try {
      await window.electronAPI.s3ClearCredentials()
      updatePreferences({ s3Bucket: undefined, s3Region: undefined, s3AccessKeyId: undefined })
      setS3Bucket('')
      setS3Region('')
      setS3AccessKeyId('')
      setS3Secret('')
    } catch (e) {
      setS3Error(e instanceof Error ? e.message : 'Failed to disconnect')
    }
  }

  if (!hasElectronS3) {
    return (
      <div className="settings-sub">
        <div className="settings-sub-bg settings-sub-bg--1" />
        <div className="settings-sub-bg settings-sub-bg--2" />
        <div className={`settings-sub-content ${visible ? 'settings-sub-content--visible' : ''}`}>
          <div className="settings-sub-header">
            <GlassIconButton icon={<ArrowLeft size={20} />} onClick={() => navigate(-1)} size={44} />
            <h1 className="settings-sub-title">Cloud Storage</h1>
          </div>
          <GlassContainer>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
              Cloud storage (S3) and local folder storage are available in the desktop app. Open FinoCurve in the Electron app to configure your bucket or choose a local folder.
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
          <h1 className="settings-sub-title">Cloud Storage</h1>
        </div>

        <GlassContainer>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Cloud size={18} /> AWS S3 Bucket
          </h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
            Connect your AWS S3 bucket to store generated risk reports and upload documents (tax files, financial statements).
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Bucket name</label>
              <GlassTextField value={s3Bucket} onChange={setS3Bucket} placeholder="my-finocurve-bucket" prefixIcon={<Cloud size={16} />} />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Region</label>
              <GlassTextField value={s3Region} onChange={setS3Region} placeholder="us-east-1" />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Access Key ID</label>
              <GlassTextField value={s3AccessKeyId} onChange={setS3AccessKeyId} placeholder="AKIA..." />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Secret Access Key</label>
              <GlassTextField value={s3Secret} onChange={setS3Secret} placeholder="••••••••" type="password" />
            </div>
            {s3Error && <p style={{ fontSize: 13, color: 'var(--status-error)' }}>{s3Error}</p>}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <GlassButton text={s3Saving ? 'Saving...' : 'Save credentials'} onClick={handleS3Save} isPrimary disabled={s3Saving || !s3Bucket.trim() || !s3Region.trim() || !s3AccessKeyId.trim() || !s3Secret} />
              {(prefs.s3Bucket || s3Bucket) && (
                <GlassButton text="Disconnect" onClick={handleS3Disconnect} disabled={s3Saving} />
              )}
            </div>
          </div>
        </GlassContainer>

        {hasElectronLocal && (
          <GlassContainer style={{ marginTop: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <FolderOpen size={18} /> Local storage
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
              Save reports and documents to a folder on your device. Files are stored in a <code>finocurve/</code> subfolder.
            </p>
            {localPath ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{localPath}</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <GlassButton text="Change folder" onClick={handleLocalChoose} disabled={localChoosing} />
                  <GlassButton text="Remove" onClick={handleLocalClear} />
                </div>
              </div>
            ) : (
              <GlassButton text={localChoosing ? 'Choosing...' : 'Choose folder'} onClick={handleLocalChoose} isPrimary disabled={localChoosing} />
            )}
          </GlassContainer>
        )}
      </div>
    </div>
  )
}

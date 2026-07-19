import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Building2, CheckCircle2, Unplug, XCircle } from 'lucide-react'
import GlassContainer from '../../components/glass/GlassContainer'
import GlassButton from '../../components/glass/GlassButton'
import GlassTextField from '../../components/glass/GlassTextField'
import GlassIconButton from '../../components/glass/GlassIconButton'
import { loadEnterpriseServiceUrl, saveEnterpriseServiceUrl } from '../../services/enterprise'
import { useEnterpriseMode } from '../../hooks/useEnterpriseMode'
import './SettingsSubScreen.css'

type TestState = { status: 'idle' | 'testing' | 'ok' | 'failed'; detail?: string }

async function testServiceUrl(rawUrl: string): Promise<TestState> {
  const url = rawUrl.trim().replace(/\/+$/, '')
  if (!url) return { status: 'failed', detail: 'Enter a service URL first.' }
  try {
    if (window.electronAPI?.enterpriseCheck) {
      const result = await window.electronAPI.enterpriseCheck({ url })
      if (!result.available) return { status: 'failed', detail: result.error || `Service responded but is not healthy${result.status ? ` (HTTP ${result.status})` : ''}.` }
      return { status: 'ok' }
    }
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 5000)
    try {
      const response = await fetch(`${url}/healthz`, { signal: controller.signal, headers: { Accept: 'application/json' } })
      if (!response.ok) return { status: 'failed', detail: `Service returned HTTP ${response.status}.` }
      const data = await response.json() as { status?: string }
      return data.status === 'ok' ? { status: 'ok' } : { status: 'failed', detail: 'Service responded but is not healthy.' }
    } finally {
      window.clearTimeout(timeout)
    }
  } catch (reason) {
    return { status: 'failed', detail: reason instanceof Error && reason.name !== 'AbortError' ? reason.message : 'Could not reach the service.' }
  }
}

export default function EnterpriseServiceScreen() {
  const navigate = useNavigate()
  const { isEnterprise, recheck } = useEnterpriseMode()
  const [pageVisible, setPageVisible] = useState(false)
  const [url, setUrl] = useState('')
  const [savedUrl, setSavedUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [test, setTest] = useState<TestState>({ status: 'idle' })
  const [error, setError] = useState<string | null>(null)
  const [savedOk, setSavedOk] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => setPageVisible(true))
  }, [])

  useEffect(() => {
    loadEnterpriseServiceUrl()
      .then(current => { setUrl(current); setSavedUrl(current) })
      .catch(() => setError('Could not load the saved service URL'))
      .finally(() => setLoading(false))
  }, [])

  const handleTest = async () => {
    setError(null)
    setTest({ status: 'testing' })
    setTest(await testServiceUrl(url))
  }

  const handleSave = async () => {
    setError(null)
    setSavedOk(false)
    setSaving(true)
    try {
      const result = await saveEnterpriseServiceUrl(url)
      if (!result.ok) {
        setError(result.error || 'Could not save the service URL')
        return
      }
      setUrl(result.url ?? '')
      setSavedUrl(result.url ?? '')
      setSavedOk(true)
      setTest({ status: 'idle' })
      void recheck()
      setTimeout(() => setSavedOk(false), 2500)
    } finally {
      setSaving(false)
    }
  }

  const handleDisconnect = async () => {
    setUrl('')
    setError(null)
    setSaving(true)
    try {
      const result = await saveEnterpriseServiceUrl('')
      if (!result.ok) {
        setError(result.error || 'Could not clear the service URL')
        return
      }
      setSavedUrl('')
      setTest({ status: 'idle' })
      void recheck()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="settings-sub">
      <div className="settings-sub-bg settings-sub-bg--1" />
      <div className="settings-sub-bg settings-sub-bg--2" />
      <div className={`settings-sub-content ${pageVisible ? 'settings-sub-content--visible' : ''}`}>
        <div className="settings-sub-header">
          <GlassIconButton icon={<ArrowLeft size={20} />} onClick={() => navigate('/main?tab=settings')} title="Back" />
          <h1 className="settings-sub-title">Enterprise service</h1>
        </div>

        {loading ? (
          <GlassContainer padding="24px" borderRadius={16}>
            <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Loading…</p>
          </GlassContainer>
        ) : (
          <>
            <GlassContainer padding="20px 22px" borderRadius={16}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <Building2 size={18} style={{ color: 'var(--brand-primary)' }} />
                <h2 style={{ color: 'var(--text-primary)', fontSize: 16, margin: 0 }}>Finocurve Service</h2>
                {savedUrl && (
                  <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: isEnterprise ? 'var(--status-success)' : 'var(--text-tertiary)' }}>
                    {isEnterprise ? <CheckCircle2 size={14} /> : <Unplug size={14} />}
                    {isEnterprise ? 'Connected' : 'Not connected'}
                  </span>
                )}
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.55, margin: '0 0 18px' }}>
                Connect to your Finocurve Service instance to unlock enterprise mode: consolidated balances,
                institutional activity, and connection health. The URL is stored on this device only.
              </p>

              <span style={{ display: 'block', color: 'var(--text-tertiary)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Service URL</span>
              <GlassTextField
                type="text"
                value={url}
                onChange={setUrl}
                placeholder="http://127.0.0.1:8002"
              />
              <p style={{ color: 'var(--text-tertiary)', fontSize: 13, lineHeight: 1.5, margin: '10px 0 0' }}>
                Usually http://127.0.0.1:8002 when the service runs on this machine. Clear the field and save to
                disable enterprise mode.
              </p>

              {test.status === 'ok' && (
                <p style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--status-success)', fontSize: 14, margin: '14px 0 0' }}>
                  <CheckCircle2 size={15} /> Service is reachable and healthy.
                </p>
              )}
              {test.status === 'failed' && (
                <p style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--status-error)', fontSize: 14, margin: '14px 0 0' }}>
                  <XCircle size={15} /> {test.detail}
                </p>
              )}
              {error && <p style={{ color: 'var(--status-error)', fontSize: 14, margin: '14px 0 0' }}>{error}</p>}
              {savedOk && <p style={{ color: 'var(--status-success)', fontSize: 14, margin: '14px 0 0' }}>Saved.</p>}

              <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
                <GlassButton text={test.status === 'testing' ? 'Testing…' : 'Test connection'} onClick={handleTest} disabled={test.status === 'testing' || saving} />
                <GlassButton text={saving ? 'Saving…' : 'Save'} onClick={handleSave} isPrimary disabled={saving || url.trim().replace(/\/+$/, '') === savedUrl} />
                {savedUrl && <GlassButton text="Disconnect" onClick={handleDisconnect} disabled={saving} />}
              </div>
            </GlassContainer>
          </>
        )}
      </div>
    </div>
  )
}

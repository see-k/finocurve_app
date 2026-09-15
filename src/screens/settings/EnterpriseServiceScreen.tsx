import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Building2, Eye, EyeOff, KeyRound, Link2 } from 'lucide-react'
import Panel from '../../components/financial/Panel'
import { Notice, StatusChip, type StatusTone } from '../../components/financial/Status'
import PageGround from '../../components/financial/PageGround'
import {
  getEnterpriseApiTokenStatus,
  loadEnterpriseServiceUrl,
  saveEnterpriseApiToken,
  saveEnterpriseServiceUrl,
} from '../../services/enterprise'
import { useEnterpriseMode } from '../../hooks/useEnterpriseMode'

type CheckState =
  | { status: 'idle' }
  | { status: 'testing' }
  | { status: 'ok' }
  | { status: 'unauthorized'; detail: string }
  | { status: 'unreachable'; detail: string }

/** Probes the service, distinguishing "cannot reach" from "will not authorize". */
async function testService(rawUrl: string): Promise<CheckState> {
  const url = rawUrl.trim().replace(/\/+$/, '')
  if (!url) return { status: 'unreachable', detail: 'Enter a service URL first.' }

  try {
    if (window.electronAPI?.enterpriseCheck) {
      const result = await window.electronAPI.enterpriseCheck({ url })
      if (result.available) return { status: 'ok' }
      if (result.reachable && result.authorized === false) {
        return { status: 'unauthorized', detail: result.error || 'The service rejected the API token.' }
      }
      return {
        status: 'unreachable',
        detail: result.error || `Service responded but is not healthy${result.status ? ` (HTTP ${result.status})` : ''}.`,
      }
    }

    // Browser fallback: /healthz is public, so reaching it proves nothing about
    // the token. Probe an authenticated route as well.
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 8000)
    try {
      const health = await fetch(`${url}/healthz`, { signal: controller.signal, headers: { Accept: 'application/json' } })
      if (!health.ok) return { status: 'unreachable', detail: `Service returned HTTP ${health.status}.` }
      const data = await health.json() as { status?: string }
      if (data.status !== 'ok') return { status: 'unreachable', detail: 'Service responded but is not healthy.' }

      const { enterpriseFetch } = await import('../../services/enterprise')
      try {
        await enterpriseFetch('/api/health/connections', { baseUrl: url, signal: controller.signal })
        return { status: 'ok' }
      } catch (reason) {
        const message = reason instanceof Error ? reason.message : 'The service rejected the request.'
        if (reason instanceof Error && reason.name === 'AbortError') {
          return { status: 'unreachable', detail: 'Could not reach the service.' }
        }
        return /token/i.test(message)
          ? { status: 'unauthorized', detail: message }
          : { status: 'unreachable', detail: message }
      }
    } finally {
      window.clearTimeout(timeout)
    }
  } catch (reason) {
    return {
      status: 'unreachable',
      detail: reason instanceof Error && reason.name !== 'AbortError' ? reason.message : 'Could not reach the service.',
    }
  }
}

export default function EnterpriseServiceScreen() {
  const navigate = useNavigate()
  const { isEnterprise, recheck } = useEnterpriseMode()

  const [url, setUrl] = useState('')
  const [savedUrl, setSavedUrl] = useState('')
  const [token, setToken] = useState('')
  const [tokenStatus, setTokenStatus] = useState<{ configured: boolean; hint: string }>({ configured: false, hint: '' })
  const [revealToken, setRevealToken] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [check, setCheck] = useState<CheckState>({ status: 'idle' })
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  const refreshTokenStatus = useCallback(async () => {
    setTokenStatus(await getEnterpriseApiTokenStatus())
  }, [])

  useEffect(() => {
    Promise.all([loadEnterpriseServiceUrl(), getEnterpriseApiTokenStatus()])
      .then(([currentUrl, currentToken]) => {
        setUrl(currentUrl)
        setSavedUrl(currentUrl)
        setTokenStatus(currentToken)
      })
      .catch(() => setError('Could not load the saved enterprise settings.'))
      .finally(() => setLoading(false))
  }, [])

  function flash(message: string) {
    setSaved(message)
    window.setTimeout(() => setSaved(null), 2500)
  }

  const handleSaveUrl = async () => {
    setError(null)
    setSaving(true)
    try {
      const result = await saveEnterpriseServiceUrl(url)
      if (!result.ok) {
        setError(result.error || 'Could not save the service URL.')
        return
      }
      setUrl(result.url ?? '')
      setSavedUrl(result.url ?? '')
      setCheck({ status: 'idle' })
      flash('Service URL saved.')
      void recheck()
    } finally {
      setSaving(false)
    }
  }

  const handleSaveToken = async () => {
    setError(null)
    setSaving(true)
    try {
      const result = await saveEnterpriseApiToken(token)
      if (!result.ok) {
        setError(result.error || 'Could not save the API token.')
        return
      }
      // Never keep the plaintext in component state once it is stored.
      setToken('')
      setRevealToken(false)
      await refreshTokenStatus()
      setCheck({ status: 'idle' })
      flash('API token saved.')
      void recheck()
    } finally {
      setSaving(false)
    }
  }

  const handleRemoveToken = async () => {
    setError(null)
    setSaving(true)
    try {
      const result = await saveEnterpriseApiToken('')
      if (!result.ok) {
        setError(result.error || 'Could not remove the API token.')
        return
      }
      setToken('')
      await refreshTokenStatus()
      setCheck({ status: 'idle' })
      flash('API token removed.')
      void recheck()
    } finally {
      setSaving(false)
    }
  }

  const handleDisconnect = async () => {
    setError(null)
    setSaving(true)
    try {
      const urlResult = await saveEnterpriseServiceUrl('')
      const tokenResult = await saveEnterpriseApiToken('')
      if (!urlResult.ok || !tokenResult.ok) {
        setError(urlResult.error || tokenResult.error || 'Could not disconnect the enterprise service.')
        if (urlResult.ok) {
          setUrl('')
          setSavedUrl('')
        }
        if (tokenResult.ok) {
          setToken('')
          await refreshTokenStatus()
        }
        return
      }
      setUrl('')
      setSavedUrl('')
      setToken('')
      await refreshTokenStatus()
      setCheck({ status: 'idle' })
      flash('Disconnected.')
      void recheck()
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    setError(null)
    setCheck({ status: 'testing' })
    setCheck(await testService(url))
  }

  const connectionTone: StatusTone = isEnterprise ? 'ok' : savedUrl ? 'warn' : 'neutral'
  const connectionLabel = isEnterprise
    ? 'Connected'
    : savedUrl
      ? (tokenStatus.configured ? 'Not authorized' : 'Token required')
      : 'Not configured'

  const urlDirty = url.trim().replace(/\/+$/, '') !== savedUrl

  return (
    <div className="fin-page settings-sub-page">
      <PageGround />

      <header className="fin-masthead">
        <div className="fin-masthead__id">
          <div className="fin-masthead__eyebrow">
            <Building2 size={13} aria-hidden />
            <strong>Settings</strong>
            <span className="fin-masthead__sep">/</span>
            <span>Enterprise</span>
          </div>
          <h1 className="fin-masthead__title">Enterprise service</h1>
          <p className="fin-masthead__sub">
            Connect to your Finocurve Service instance for consolidated balances, institutional
            activity and connection health. Both settings are stored on this device only.
          </p>
        </div>
        <div className="fin-masthead__actions">
          <StatusChip tone={connectionTone} label={connectionLabel} />
          <button type="button" className="fin-btn" onClick={() => navigate('/main?tab=settings')}>
            <ArrowLeft size={13} aria-hidden /> Back
          </button>
        </div>
      </header>

      <div className="fin-stack settings-sub-page__stack">
        {loading ? (
          <Panel title="Enterprise service">
            <p className="fin-footnote">Loading…</p>
          </Panel>
        ) : (
          <>
            {error && <Notice tone="bad">{error}</Notice>}
            {saved && <Notice tone="ok">{saved}</Notice>}

            <Panel
              title="Service endpoint"
              icon={<Link2 size={14} aria-hidden />}
              note="Where this device reaches Finocurve Service."
              actions={
                <>
                  <button
                    type="button"
                    className="fin-btn"
                    onClick={handleTest}
                    disabled={check.status === 'testing' || saving || !url.trim()}
                  >
                    {check.status === 'testing' ? 'Testing…' : 'Test connection'}
                  </button>
                  <button
                    type="button"
                    className="fin-btn fin-btn--accent"
                    onClick={handleSaveUrl}
                    disabled={saving || !urlDirty}
                  >
                    Save
                  </button>
                </>
              }
            >
              <div className="fin-field">
                <label className="fin-label" htmlFor="enterprise-url">Service URL</label>
                <input
                  id="enterprise-url"
                  className="fin-input"
                  type="text"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="http://127.0.0.1:8002"
                  spellCheck={false}
                  autoComplete="off"
                />
                <span className="fin-field__hint">
                  Usually http://127.0.0.1:8002 when the service runs on this machine.
                </span>
              </div>

              {check.status === 'ok' && (
                <div className="settings-sub-page__result">
                  <Notice tone="ok">Service is reachable and the API token was accepted.</Notice>
                </div>
              )}
              {check.status === 'unauthorized' && (
                <div className="settings-sub-page__result">
                  <Notice tone="warn">{check.detail} Add or replace the API token below.</Notice>
                </div>
              )}
              {check.status === 'unreachable' && (
                <div className="settings-sub-page__result">
                  <Notice tone="bad">{check.detail}</Notice>
                </div>
              )}
            </Panel>

            <Panel
              title="API token"
              icon={<KeyRound size={14} aria-hidden />}
              note="Finocurve Service requires a bearer token on every request."
              actions={
                <>
                  {tokenStatus.configured && (
                    <button type="button" className="fin-btn" onClick={handleRemoveToken} disabled={saving}>
                      Remove
                    </button>
                  )}
                  <button
                    type="button"
                    className="fin-btn fin-btn--accent"
                    onClick={handleSaveToken}
                    disabled={saving || !token.trim()}
                  >
                    {tokenStatus.configured ? 'Replace token' : 'Save token'}
                  </button>
                </>
              }
              footer={
                <span className="fin-footnote">
                  {window.electronAPI?.enterpriseSetToken
                    ? 'The token is encrypted on this device by the desktop app and is never returned to the window — only the last four characters are shown back to you.'
                    : 'In the browser the token is kept for this tab only and is not written to disk. Use the FinoCurve desktop app to store it securely.'}
                </span>
              }
            >
              {tokenStatus.configured && (
                <div className="settings-sub-page__token-state">
                  <StatusChip tone="ok" label="Token installed" />
                  <span className="fin-mono settings-sub-page__hint">{tokenStatus.hint}</span>
                </div>
              )}

              <div className="fin-field">
                <label className="fin-label" htmlFor="enterprise-token">
                  {tokenStatus.configured ? 'Replacement token' : 'API token'}
                </label>
                <div className="fin-field__row">
                  <input
                    id="enterprise-token"
                    className="fin-input fin-input--secret"
                    type={revealToken ? 'text' : 'password'}
                    value={token}
                    onChange={(event) => setToken(event.target.value)}
                    placeholder={tokenStatus.configured ? 'Paste a new token to replace' : 'Paste your API token'}
                    spellCheck={false}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    className="fin-btn fin-btn--icon"
                    onClick={() => setRevealToken((on) => !on)}
                    title={revealToken ? 'Hide token' : 'Show token'}
                    aria-label={revealToken ? 'Hide token' : 'Show token'}
                    aria-pressed={revealToken}
                  >
                    {revealToken ? <EyeOff size={15} aria-hidden /> : <Eye size={15} aria-hidden />}
                  </button>
                </div>
                <span className="fin-field__hint">
                  Issued by your Finocurve Service deployment as <span className="fin-mono">API_KEY</span>.
                  Sent as an <span className="fin-mono">Authorization: Bearer</span> header.
                </span>
              </div>
            </Panel>

            {savedUrl && (
              <Panel title="Disconnect" note="Clears the service URL and the API token from this device.">
                <button type="button" className="fin-btn" onClick={handleDisconnect} disabled={saving}>
                  Disconnect enterprise service
                </button>
              </Panel>
            )}
          </>
        )}
      </div>
    </div>
  )
}

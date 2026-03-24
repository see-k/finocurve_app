import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ExternalLink, Eye, EyeOff } from 'lucide-react'
import GlassContainer from '../../../components/glass/GlassContainer'
import GlassButton from '../../../components/glass/GlassButton'
import GlassTextField from '../../../components/glass/GlassTextField'
import GlassIconButton from '../../../components/glass/GlassIconButton'
import '../SettingsSubScreen.css'
import './plugins.css'
import { FMP_PLUGIN_API_KEY_MASK } from '../../../shared/fmpPluginMask'
const FMP_DOCS = 'https://site.financialmodelingprep.com/developer/docs/'
const FMP_LOGO_SRC = '/images/fmp-new-logo.svg'

const hasPluginsApi =
  typeof window !== 'undefined' &&
  window.electronAPI?.pluginsSettingsGet &&
  window.electronAPI?.pluginsSettingsSave

export default function FmpPluginPage() {
  const navigate = useNavigate()
  const [pageVisible, setPageVisible] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  const [fmpApiKey, setFmpApiKey] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedOk, setSavedOk] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => setPageVisible(true))
  }, [])

  useEffect(() => {
    if (!hasPluginsApi) {
      setLoading(false)
      return
    }
    window.electronAPI!.pluginsSettingsGet!()
      .then((r) => {
        setFmpApiKey(r.fmpApiKey || '')
      })
      .catch(() => setError('Could not load plugin settings'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (fmpApiKey === FMP_PLUGIN_API_KEY_MASK) setShowApiKey(false)
  }, [fmpApiKey])

  const canToggleKeyVisibility = fmpApiKey !== FMP_PLUGIN_API_KEY_MASK

  const handleSave = async () => {
    if (!hasPluginsApi) return
    setError(null)
    setSavedOk(false)
    setSaving(true)
    try {
      await window.electronAPI!.pluginsSettingsSave!({ fmpApiKey })
      setSavedOk(true)
      const r = await window.electronAPI!.pluginsSettingsGet!()
      setFmpApiKey(r.fmpApiKey || '')
      setTimeout(() => setSavedOk(false), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
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
          <GlassIconButton icon={<ArrowLeft size={20} />} onClick={() => navigate('/settings/plugins')} title="Back" />
          <h1 className="settings-sub-title">Financial Modeling Prep</h1>
        </div>

        {!hasPluginsApi ? (
          <GlassContainer padding="24px" borderRadius={16}>
            <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
              Plugin settings are available in the FinoCurve desktop app.
            </p>
          </GlassContainer>
        ) : loading ? (
          <GlassContainer padding="24px" borderRadius={16}>
            <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Loading…</p>
          </GlassContainer>
        ) : (
          <>
            <div className="plugin-detail__brand">
              <div className="plugin-detail__logo-wrap" aria-hidden>
                <img src={FMP_LOGO_SRC} alt="" className="plugin-detail__logo" />
              </div>
              <div className="plugin-detail__titles">
                <h2>API access</h2>
                <p>Powers Insights → Congressional Trades (Senate &amp; House latest disclosures).</p>
                <a className="plugin-detail__doc-link" href={FMP_DOCS} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={16} />
                  Get an API key (FMP dashboard)
                </a>
              </div>
            </div>

            <GlassContainer padding="20px 22px" borderRadius={16}>
              <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.55, margin: '0 0 18px' }}>
                Create a free Financial Modeling Prep account, open the developer section, and copy your API key. Free
                tier limits apply to refresh frequency. Your key is stored only on this device and is never sent to
                FinoCurve servers.
              </p>

              <span className="plugin-detail__section-label">API key</span>
              <GlassTextField
                type={showApiKey && canToggleKeyVisibility ? 'text' : 'password'}
                value={fmpApiKey}
                onChange={setFmpApiKey}
                placeholder="Paste your FMP API key"
                suffixIcon={
                  canToggleKeyVisibility ? (
                    <button
                      type="button"
                      className="plugin-api-key-visibility"
                      onClick={() => setShowApiKey((v) => !v)}
                      title={showApiKey ? 'Hide API key' : 'Show API key'}
                      aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                      aria-pressed={showApiKey}
                    >
                      {showApiKey ? <EyeOff size={20} strokeWidth={1.75} /> : <Eye size={20} strokeWidth={1.75} />}
                    </button>
                  ) : undefined
                }
              />
              <p className="plugin-detail__hint">
                Leave empty and save to remove the key. If a key is already saved, you will see a masked value; replace
                it to update.
              </p>
              {fmpApiKey === FMP_PLUGIN_API_KEY_MASK && (
                <p className="plugin-detail__hint" style={{ color: 'var(--text-secondary)' }}>
                  Placeholder for your saved key — it isn&apos;t shown here for security. Enter a new key to replace it,
                  or clear and save to remove.
                </p>
              )}
            </GlassContainer>

            {error && <p style={{ color: 'var(--status-error)', fontSize: 14, marginTop: 14 }}>{error}</p>}
            {savedOk && (
              <p style={{ color: 'var(--status-success, #22c55e)', fontSize: 14, marginTop: 14 }}>Saved.</p>
            )}

            <div className="plugin-detail__actions">
              <GlassButton text={saving ? 'Saving…' : 'Save'} onClick={handleSave} isPrimary disabled={saving} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

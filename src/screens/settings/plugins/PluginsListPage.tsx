import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ChevronRight, Puzzle } from 'lucide-react'
import GlassContainer from '../../../components/glass/GlassContainer'
import GlassIconButton from '../../../components/glass/GlassIconButton'
import '../SettingsSubScreen.css'
import './plugins.css'

const FMP_LOGO_SRC = '/images/fmp-new-logo.svg'

const hasPluginsApi =
  typeof window !== 'undefined' &&
  window.electronAPI?.pluginsFmpIsConfigured &&
  window.electronAPI?.pluginsSettingsGet

export default function PluginsListPage() {
  const navigate = useNavigate()
  const [visible, setVisible] = useState(false)
  const [fmpConnected, setFmpConnected] = useState<boolean | null>(null)

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
  }, [])

  useEffect(() => {
    if (!hasPluginsApi) {
      setFmpConnected(null)
      return
    }
    window.electronAPI!.pluginsFmpIsConfigured!().then((r) => setFmpConnected(r.configured))
  }, [])

  return (
    <div className="settings-sub">
      <div className="settings-sub-bg settings-sub-bg--1" />
      <div className="settings-sub-bg settings-sub-bg--2" />
      <div className={`settings-sub-content ${visible ? 'settings-sub-content--visible' : ''}`}>
        <div className="settings-sub-header">
          <GlassIconButton icon={<ArrowLeft size={20} />} onClick={() => navigate('/main')} title="Back" />
          <h1 className="settings-sub-title">Plugins</h1>
        </div>

        <p className="plugins-subtitle">
          Connect third-party data providers. Keys stay on this device; FinoCurve never receives them.
        </p>

        {!hasPluginsApi ? (
          <GlassContainer padding="24px" borderRadius={16}>
            <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
              Plugin settings are available in the FinoCurve desktop app.
            </p>
          </GlassContainer>
        ) : (
          <>
            <div className="plugins-list">
              <button
                type="button"
                className="plugins-list__item"
                onClick={() => navigate('/settings/plugins/fmp')}
              >
                <div className="plugins-list__logo-wrap" aria-hidden>
                  <img src={FMP_LOGO_SRC} alt="" className="plugins-list__logo" />
                </div>
                <div className="plugins-list__body">
                  <span className="plugins-list__name">Financial Modeling Prep</span>
                  <span className="plugins-list__desc">
                    Congressional Trades — Senate &amp; House disclosure feeds (STOCK Act data).
                  </span>
                </div>
                <div className="plugins-list__meta">
                  {fmpConnected === true && (
                    <span className="plugins-list__badge plugins-list__badge--on">Connected</span>
                  )}
                  {fmpConnected === false && (
                    <span className="plugins-list__badge plugins-list__badge--off">Setup</span>
                  )}
                  <ChevronRight size={20} className="plugins-list__chevron" />
                </div>
              </button>

              <div className="plugins-list__soon" role="note">
                <div className="plugins-list__soon-icon">
                  <Puzzle size={24} />
                </div>
                <p className="plugins-list__soon-text">
                  More plugins will appear here as we add integrations. Use <strong>AI Models</strong> to attach MCP
                  servers for custom tools (e.g. search).
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Cpu, Cloud, Shield, ChevronDown, CheckCircle, XCircle, Play, Square, Copy, Loader2, Globe, Info, Terminal } from 'lucide-react'
import GlassContainer from '../../components/glass/GlassContainer'
import GlassButton from '../../components/glass/GlassButton'
import GlassTextField from '../../components/glass/GlassTextField'
import GlassIconButton from '../../components/glass/GlassIconButton'
import {
  hasA2AAPI,
  startA2AServer,
  stopA2AServer,
  getA2AServerStatus,
  getA2ASettings,
  updateA2ASettings,
} from '../../services/a2a'
import type { A2AServerStatus, A2ASettings } from '../../types/A2A'
import AgentTerminal from '../../components/ai/AgentTerminal'
import './SettingsSubScreen.css'

type AIProvider = 'ollama' | 'bedrock' | 'azure'

export default function AIConfigScreen() {
  const navigate = useNavigate()
  const [visible, setVisible] = useState(false)
  const [provider, setProvider] = useState<AIProvider>('ollama')
  const [model, setModel] = useState('llama3.2')
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState('http://localhost:11434')
  const [bedrockRegion, setBedrockRegion] = useState('')
  const [bedrockAccessKeyId, setBedrockAccessKeyId] = useState('')
  const [bedrockSecretKey, setBedrockSecretKey] = useState('')
  const [azureEndpoint, setAzureEndpoint] = useState('')
  const [azureApiKey, setAzureApiKey] = useState('')
  const [azureDeployment, setAzureDeployment] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [ollamaModels, setOllamaModels] = useState<string[]>([])
  const [ollamaModelsLoading, setOllamaModelsLoading] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<{ ok: boolean; message: string } | null>(null)
  const [connectionTesting, setConnectionTesting] = useState(false)
  const [showAdvancedOllama, setShowAdvancedOllama] = useState(false)

  // A2A state
  const [a2aStatus, setA2aStatus] = useState<A2AServerStatus | null>(null)
  const [a2aSettings, setA2aSettings] = useState<A2ASettings | null>(null)
  const [a2aPort, setA2aPort] = useState('3847')
  const [a2aAutoStart, setA2aAutoStart] = useState(false)
  const [a2aLoading, setA2aLoading] = useState(false)
  const [a2aHasChanges, setA2aHasChanges] = useState(false)
  const [a2aSuccess, setA2aSuccess] = useState<string | null>(null)
  const [showLogsModal, setShowLogsModal] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
  }, [])

  useEffect(() => {
    if (window.electronAPI?.aiConfigGet) {
      window.electronAPI.aiConfigGet().then((config) => {
        setProvider(config.provider)
        setModel(config.model || 'llama3.2')
        setOllamaBaseUrl(config.ollamaBaseUrl || 'http://localhost:11434')
        setBedrockRegion(config.bedrockRegion || '')
        setBedrockAccessKeyId(config.bedrockAccessKeyId || '')
        setBedrockSecretKey(config.bedrockSecretKey || '')
        setAzureEndpoint(config.azureEndpoint || '')
        setAzureApiKey(config.azureApiKey || '')
        setAzureDeployment(config.azureDeployment || '')
      }).catch(() => setError('Failed to load config'))
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  // Load and poll A2A status
  useEffect(() => {
    if (hasA2AAPI()) {
      loadA2AStatus()
      loadA2ASettings()
    }
  }, [])

  useEffect(() => {
    if (!hasA2AAPI()) return
    const interval = setInterval(loadA2AStatus, 5000)
    return () => clearInterval(interval)
  }, [])

  // Auto-dismiss A2A success
  useEffect(() => {
    if (a2aSuccess) {
      const timer = setTimeout(() => setA2aSuccess(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [a2aSuccess])

  const loadA2AStatus = async () => {
    try {
      const status = await getA2AServerStatus()
      setA2aStatus(status)
    } catch {
      // Ignore polling errors
    }
  }

  const loadA2ASettings = async () => {
    try {
      const settings = await getA2ASettings()
      setA2aSettings(settings)
      if (settings) {
        setA2aPort(String(settings.port))
        setA2aAutoStart(settings.autoStart)
      }
    } catch {
      // Ignore errors
    }
  }

  const fetchOllamaModels = useCallback(async () => {
    if (!window.electronAPI?.aiOllamaListModels) return
    setOllamaModelsLoading(true)
    try {
      const { models } = await window.electronAPI.aiOllamaListModels(ollamaBaseUrl || undefined)
      setOllamaModels(models)
    } finally {
      setOllamaModelsLoading(false)
    }
  }, [ollamaBaseUrl])

  useEffect(() => {
    if (provider === 'ollama' && window.electronAPI?.aiOllamaListModels) {
      fetchOllamaModels()
    }
  }, [provider, fetchOllamaModels])

  const handleTestConnection = async () => {
    if (!window.electronAPI?.aiOllamaTestConnection) return
    setConnectionStatus(null)
    setConnectionTesting(true)
    try {
      const result = await window.electronAPI.aiOllamaTestConnection({
        baseUrl: provider === 'ollama' ? ollamaBaseUrl : undefined,
        model: provider === 'ollama' ? model : undefined,
      })
      if (result.ok) {
        setConnectionStatus({
          ok: true,
          message: result.modelCount ? `Connected. ${result.modelCount} model(s) available.` : 'Connection successful.',
        })
      } else {
        setConnectionStatus({ ok: false, message: result.error || 'Connection failed' })
      }
    } catch {
      setConnectionStatus({ ok: false, message: 'Connection failed' })
    } finally {
      setConnectionTesting(false)
    }
  }

  const handleSave = async () => {
    if (!window.electronAPI?.aiConfigSave) {
      setError('AI config is only available in the desktop app.')
      return
    }
    setError(null)
    setSaving(true)
    try {
      await window.electronAPI.aiConfigSave({
        provider,
        model: model.trim() || 'llama3.2',
        ollamaBaseUrl: provider === 'ollama' ? ollamaBaseUrl.trim() : undefined,
        bedrockRegion: provider === 'bedrock' ? bedrockRegion.trim() : undefined,
        bedrockAccessKeyId: provider === 'bedrock' ? bedrockAccessKeyId.trim() : undefined,
        bedrockSecretKey: provider === 'bedrock' ? bedrockSecretKey : undefined,
        azureEndpoint: provider === 'azure' ? azureEndpoint.trim() : undefined,
        azureApiKey: provider === 'azure' ? azureApiKey : undefined,
        azureDeployment: provider === 'azure' ? azureDeployment.trim() : undefined,
        a2aEnabled: a2aStatus?.running ?? false,
      })
      navigate(-1)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  // =============================================
  // A2A Handlers
  // =============================================

  const handleA2AStart = async () => {
    setA2aLoading(true)
    setError(null)
    try {
      const result = await startA2AServer({ port: parseInt(a2aPort, 10) })
      if (result.success) {
        setA2aSuccess('A2A Server started!')
        await loadA2AStatus()
      } else {
        setError(result.error || 'Failed to start A2A server')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start A2A server')
    } finally {
      setA2aLoading(false)
    }
  }

  const handleA2AStop = async () => {
    setA2aLoading(true)
    setError(null)
    try {
      const result = await stopA2AServer()
      if (result.success) {
        setA2aSuccess('A2A Server stopped')
        await loadA2AStatus()
      } else {
        setError(result.error || 'Failed to stop A2A server')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop A2A server')
    } finally {
      setA2aLoading(false)
    }
  }

  const handleA2APortChange = (value: string) => {
    setA2aPort(value)
    setA2aHasChanges(
      value !== String(a2aSettings?.port) || a2aAutoStart !== a2aSettings?.autoStart
    )
  }

  const handleA2AAutoStartChange = () => {
    const newVal = !a2aAutoStart
    setA2aAutoStart(newVal)
    setA2aHasChanges(
      a2aPort !== String(a2aSettings?.port) || newVal !== a2aSettings?.autoStart
    )
  }

  const handleA2ASaveSettings = async () => {
    setError(null)
    try {
      const port = parseInt(a2aPort, 10)
      if (isNaN(port) || port < 1024 || port > 65535) {
        setError('Port must be between 1024 and 65535')
        return
      }
      await updateA2ASettings({ port, autoStart: a2aAutoStart })
      setA2aSettings({ port, autoStart: a2aAutoStart })
      setA2aHasChanges(false)
      setA2aSuccess('A2A settings saved!')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save A2A settings')
    }
  }

  const handleCopyUrl = (url: string) => {
    navigator.clipboard.writeText(url)
    setA2aSuccess('URL copied to clipboard!')
  }

  const hasElectronAI = typeof window !== 'undefined' && window.electronAPI?.aiConfigGet

  if (!hasElectronAI) {
    return (
      <div className="settings-sub">
        <div className="settings-sub-bg settings-sub-bg--1" />
        <div className="settings-sub-bg settings-sub-bg--2" />
        <div className={`settings-sub-content ${visible ? 'settings-sub-content--visible' : ''}`}>
          <div className="settings-sub-header">
            <GlassIconButton icon={<ArrowLeft size={20} />} onClick={() => navigate(-1)} size={44} />
            <h1 className="settings-sub-title">AI Model Configuration</h1>
          </div>
          <GlassContainer>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
              AI model configuration is available in the desktop app. Open FinoCurve in the Electron app to configure Ollama, AWS Bedrock, or Azure models.
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
          <h1 className="settings-sub-title">AI Model Configuration</h1>
        </div>

        {loading ? (
          <GlassContainer>
            <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>
          </GlassContainer>
        ) : (
          <>
            <GlassContainer>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Cpu size={18} /> Provider
              </h3>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
                Choose which AI provider to use for document insights and chat. Ollama runs locally; Bedrock and Azure require an API connection.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(['ollama', 'bedrock', 'azure'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`settings-provider-option ${provider === p ? 'settings-provider-option--active' : ''}`}
                    onClick={() => setProvider(p)}
                  >
                    {p === 'ollama' && <Cpu size={20} />}
                    {p === 'bedrock' && <Cloud size={20} />}
                    {p === 'azure' && <Cloud size={20} />}
                    <span>
                      {p === 'ollama' && 'Ollama (local)'}
                      {p === 'bedrock' && 'AWS Bedrock'}
                      {p === 'azure' && 'Azure OpenAI'}
                    </span>
                  </button>
                ))}
              </div>
            </GlassContainer>

            <GlassContainer style={{ marginTop: 24 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>Model</h3>

              {provider === 'ollama' ? (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Model</label>
                    <select
                      className="ai-config-select"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      disabled={ollamaModelsLoading}
                    >
                      {ollamaModelsLoading ? (
                        <option value="">Loading models...</option>
                      ) : ollamaModels.length === 0 ? (
                        <option value={model || ''}>{model || 'No models found'}</option>
                      ) : (
                        <>
                          {!ollamaModels.includes(model) && model && (
                            <option value={model}>{model} (not installed)</option>
                          )}
                          {ollamaModels.map((m) => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </>
                      )}
                    </select>
                    {ollamaModels.length === 0 && !ollamaModelsLoading && (
                      <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6 }}>
                        Run <code>ollama pull llama3.2</code> to install a model, then refresh.
                      </p>
                    )}
                    <div style={{ marginTop: 8 }}>
                      <GlassButton
                        text={ollamaModelsLoading ? 'Refreshing...' : 'Refresh models'}
                        onClick={fetchOllamaModels}
                        disabled={ollamaModelsLoading}
                        width="auto"
                      />
                    </div>
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <GlassButton
                      text={connectionTesting ? 'Testing...' : 'Test connection'}
                      onClick={handleTestConnection}
                      disabled={connectionTesting}
                      width="auto"
                    />
                    {connectionStatus && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 13 }}>
                        {connectionStatus.ok ? (
                          <>
                            <CheckCircle size={18} style={{ color: 'var(--status-success)' }} />
                            <span style={{ color: 'var(--status-success)' }}>{connectionStatus.message}</span>
                          </>
                        ) : (
                          <>
                            <XCircle size={18} style={{ color: 'var(--status-error)' }} />
                            <span style={{ color: 'var(--status-error)' }}>{connectionStatus.message}</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    className="ai-config-advanced-toggle"
                    onClick={() => setShowAdvancedOllama(!showAdvancedOllama)}
                  >
                    <ChevronDown size={16} style={{ transform: showAdvancedOllama ? 'rotate(180deg)' : undefined }} />
                    Advanced (base URL)
                  </button>
                  {showAdvancedOllama && (
                    <div style={{ marginTop: 12 }}>
                      <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Ollama base URL</label>
                      <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 8 }}>
                        Only change if Ollama runs on another machine or port. Default: localhost:11434
                      </p>
                      <GlassTextField value={ollamaBaseUrl} onChange={setOllamaBaseUrl} placeholder="http://localhost:11434" />
                    </div>
                  )}
                </>
              ) : (
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Model name</label>
                  <GlassTextField
                    value={model}
                    onChange={setModel}
                    placeholder={provider === 'bedrock' ? 'anthropic.claude-3-sonnet-20240229-v1:0' : 'gpt-4'}
                  />
                </div>
              )}

              {provider === 'bedrock' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Region</label>
                    <GlassTextField value={bedrockRegion} onChange={setBedrockRegion} placeholder="us-east-1" />
                  </div>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Access Key ID</label>
                    <GlassTextField value={bedrockAccessKeyId} onChange={setBedrockAccessKeyId} placeholder="AKIA..." />
                  </div>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Secret Access Key</label>
                    <GlassTextField value={bedrockSecretKey} onChange={setBedrockSecretKey} placeholder="••••••••" type="password" />
                  </div>
                </div>
              )}

              {provider === 'azure' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Endpoint</label>
                    <GlassTextField value={azureEndpoint} onChange={setAzureEndpoint} placeholder="https://your-resource.openai.azure.com/" />
                  </div>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>API Key</label>
                    <GlassTextField value={azureApiKey} onChange={setAzureApiKey} placeholder="••••••••" type="password" />
                  </div>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Deployment name</label>
                    <GlassTextField value={azureDeployment} onChange={setAzureDeployment} placeholder="gpt-4" />
                  </div>
                </div>
              )}
            </GlassContainer>

            {/* A2A Protocol Control Panel */}
            <GlassContainer style={{ marginTop: 24 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Shield size={18} /> A2A Protocol
              </h3>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
                When enabled, external agents can connect to this AI via the Agent-to-Agent protocol on localhost.
              </p>

              {/* A2A Success Message */}
              {a2aSuccess && (
                <div className="a2a-success-banner" style={{ marginBottom: 16 }}>
                  <CheckCircle size={16} />
                  <span>{a2aSuccess}</span>
                </div>
              )}

              {hasA2AAPI() ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Server Status & Control */}
                  <div className="a2a-status-card">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div className={`a2a-status-dot ${a2aStatus?.running ? 'a2a-status-dot--running' : ''}`} />
                        <div>
                          <p style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 14 }}>
                            {a2aStatus?.running ? 'Server Running' : 'Server Stopped'}
                          </p>
                          {a2aStatus?.running && (
                            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>Port {a2aStatus.port}</p>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button
                          type="button"
                          onClick={() => setShowLogsModal(true)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '8px 12px',
                            borderRadius: 8,
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            color: 'var(--text-secondary)',
                            cursor: 'pointer',
                            fontSize: 13,
                          }}
                          title="View A2A logs"
                        >
                          <Terminal size={16} />
                          Logs
                        </button>
                        <button
                          type="button"
                          className={`a2a-control-btn ${a2aStatus?.running ? 'a2a-control-btn--stop' : 'a2a-control-btn--start'}`}
                          onClick={a2aStatus?.running ? handleA2AStop : handleA2AStart}
                          disabled={a2aLoading}
                        >
                          {a2aLoading ? (
                            <Loader2 size={16} className="a2a-spinner" />
                          ) : a2aStatus?.running ? (
                            <Square size={16} />
                          ) : (
                            <Play size={16} />
                          )}
                          {a2aStatus?.running ? 'Stop' : 'Start'}
                        </button>
                      </div>
                    </div>

                    {/* URLs when running */}
                    {a2aStatus?.running && a2aStatus.url && (
                      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div className="a2a-url-row">
                          <span className="a2a-url-label">Server:</span>
                          <code className="a2a-url-value">{a2aStatus.url}</code>
                          <button
                            type="button"
                            className="a2a-copy-btn"
                            onClick={() => handleCopyUrl(a2aStatus.url!)}
                            title="Copy URL"
                          >
                            <Copy size={14} />
                          </button>
                        </div>
                        {a2aStatus.wellKnownUrl && (
                          <div className="a2a-url-row">
                            <span className="a2a-url-label">Agent Card:</span>
                            <code className="a2a-url-value">{a2aStatus.wellKnownUrl}</code>
                            <button
                              type="button"
                              className="a2a-copy-btn"
                              onClick={() => handleCopyUrl(a2aStatus.wellKnownUrl!)}
                              title="Copy well-known URL"
                            >
                              <Copy size={14} />
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Port Configuration */}
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                      Server Port
                    </label>
                    <input
                      type="number"
                      className="a2a-port-input"
                      value={a2aPort}
                      onChange={(e) => handleA2APortChange(e.target.value)}
                      min="1024"
                      max="65535"
                      disabled={a2aStatus?.running}
                      placeholder="3847"
                    />
                    {a2aStatus?.running && (
                      <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                        Stop server to change port
                      </p>
                    )}
                  </div>

                  {/* Auto-start Toggle */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Auto-start on launch</p>
                      <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>Start A2A server when app opens</p>
                    </div>
                    <div
                      className={`settings-toggle ${a2aAutoStart ? 'settings-toggle--on' : ''}`}
                      style={{ cursor: 'pointer' }}
                      role="switch"
                      aria-checked={a2aAutoStart}
                      onClick={handleA2AAutoStartChange}
                    >
                      <div className="settings-toggle__thumb" />
                    </div>
                  </div>

                  {/* Save A2A Settings Button */}
                  {a2aHasChanges && (
                    <GlassButton
                      text="Save A2A Settings"
                      onClick={handleA2ASaveSettings}
                      isPrimary
                      width="100%"
                    />
                  )}

                  {/* Info */}
                  <div className="a2a-info-box">
                    <Info size={14} style={{ flexShrink: 0, marginTop: 2 }} />
                    <p>
                      The A2A (Agent-to-Agent) protocol allows external AI agents to communicate with FinoCurve's AI capabilities via a local HTTP endpoint.{' '}
                      <a href="https://github.com/a2aproject/a2a-js" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--brand-primary)' }}>
                        Learn more →
                      </a>
                    </p>
                  </div>
                </div>
              ) : (
                /* Fallback when not in Electron */
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Globe size={18} style={{ color: 'var(--text-tertiary)' }} />
                  <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
                    A2A server controls are available in the desktop app.
                  </p>
                </div>
              )}
            </GlassContainer>

            {error && <p style={{ fontSize: 13, color: 'var(--status-error)', marginTop: 16 }}>{error}</p>}

            <AgentTerminal isOpen={showLogsModal} onClose={() => setShowLogsModal(false)} />

            <div style={{ marginTop: 24 }}>
              <GlassButton
                text={saving ? 'Saving...' : 'Save Configuration'}
                onClick={handleSave}
                isPrimary
                disabled={saving}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

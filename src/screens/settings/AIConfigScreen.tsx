import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Cpu, Cloud, Shield, ChevronDown, CheckCircle, XCircle } from 'lucide-react'
import GlassContainer from '../../components/glass/GlassContainer'
import GlassButton from '../../components/glass/GlassButton'
import GlassTextField from '../../components/glass/GlassTextField'
import GlassIconButton from '../../components/glass/GlassIconButton'
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
  const [a2aEnabled, setA2aEnabled] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [ollamaModels, setOllamaModels] = useState<string[]>([])
  const [ollamaModelsLoading, setOllamaModelsLoading] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<{ ok: boolean; message: string } | null>(null)
  const [connectionTesting, setConnectionTesting] = useState(false)
  const [showAdvancedOllama, setShowAdvancedOllama] = useState(false)

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
        setA2aEnabled(config.a2aEnabled ?? false)
      }).catch(() => setError('Failed to load config'))
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

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
        a2aEnabled,
      })
      navigate(-1)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
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

            <GlassContainer style={{ marginTop: 24 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Shield size={18} /> A2A Protocol
              </h3>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
                When enabled, external agents can connect to this AI via the Agent-to-Agent protocol on localhost. Default: off.
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  className={`settings-toggle ${a2aEnabled ? 'settings-toggle--on' : ''}`}
                  style={{ cursor: 'pointer' }}
                  role="switch"
                  aria-checked={a2aEnabled}
                  onClick={() => setA2aEnabled(!a2aEnabled)}
                >
                  <div className="settings-toggle__thumb" />
                </div>
                <span style={{ fontSize: 14, color: 'var(--text-primary)' }}>{a2aEnabled ? 'On' : 'Off'}</span>
              </div>
            </GlassContainer>

            {error && <p style={{ fontSize: 13, color: 'var(--status-error)', marginTop: 16 }}>{error}</p>}

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

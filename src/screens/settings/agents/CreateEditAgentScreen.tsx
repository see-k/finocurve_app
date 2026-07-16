import { useCallback, useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AlertCircle,
  ArrowLeft,
  Bot,
  Camera,
  CheckCircle2,
  Cloud,
  Cpu,
  RefreshCw,
  Sparkles,
  Trash2,
} from 'lucide-react'
import GlassContainer from '../../../components/glass/GlassContainer'
import GlassButton from '../../../components/glass/GlassButton'
import GlassTextField from '../../../components/glass/GlassTextField'
import GlassIconButton from '../../../components/glass/GlassIconButton'
import UserAvatar, { getInitials } from '../../../components/UserAvatar'
import { useAgents } from '../../../store/useAgents'
import type { Agent } from '../../../types/Agent'
import { compressImageForProfile } from '../../../utils/profilePicture'
import '../SettingsSubScreen.css'
import './AgentsScreen.css'

type AgentProviderChoice = 'default' | NonNullable<Agent['provider']>

function providerName(provider: AIConfigFromMain['provider']): string {
  if (provider === 'ollama') return 'Ollama'
  if (provider === 'bedrock') return 'AWS Bedrock'
  return 'Azure OpenAI'
}

export default function CreateEditAgentScreen() {
  const navigate = useNavigate()
  const { agentId } = useParams<{ agentId: string }>()
  const isEditing = !!agentId && agentId !== 'new'
  const { getAgent, createAgent, updateAgent, deleteAgent } = useAgents()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const existing = isEditing ? getAgent(agentId!) : undefined

  const [visible, setVisible] = useState(false)
  const [name, setName] = useState(existing?.name || '')
  const [description, setDescription] = useState(existing?.description || '')
  const [systemPrompt, setSystemPrompt] = useState(existing?.systemPrompt || '')
  const [image, setImage] = useState<string | undefined>(existing?.image)
  const [provider, setProvider] = useState<AgentProviderChoice>(existing?.provider || 'default')
  const [model, setModel] = useState(existing?.model || '')
  const [primaryConfig, setPrimaryConfig] = useState<AIConfigFromMain | null>(null)
  const [ollamaModels, setOllamaModels] = useState<string[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<{ ok: boolean; message: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  useEffect(() => { requestAnimationFrame(() => setVisible(true)) }, [])

  useEffect(() => {
    let active = true
    void window.electronAPI?.aiConfigGet?.().then((config) => {
      if (active) setPrimaryConfig(config)
    })
    return () => { active = false }
  }, [])

  // Keep form in sync if navigated directly to an existing agent's id
  useEffect(() => {
    if (existing) {
      setName(existing.name)
      setDescription(existing.description || '')
      setSystemPrompt(existing.systemPrompt)
      setImage(existing.image)
      setProvider(existing.provider || 'default')
      setModel(existing.model || '')
      setConnectionStatus(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId])

  const loadOllamaModels = useCallback(async () => {
    if (!window.electronAPI?.aiOllamaListModels) return
    setModelsLoading(true)
    setModelsError(null)
    try {
      const result = await window.electronAPI.aiOllamaListModels(
        primaryConfig?.ollamaBaseUrl || 'http://localhost:11434',
      )
      setOllamaModels(result.models)
      setModelsError(result.error || null)
      setModel((current) => current || (
        result.models.includes('llama3.2') ? 'llama3.2' : result.models[0] || 'llama3.2'
      ))
    } finally {
      setModelsLoading(false)
    }
  }, [primaryConfig?.ollamaBaseUrl])

  useEffect(() => {
    if (provider === 'ollama') void loadOllamaModels()
  }, [provider, loadOllamaModels])

  const selectProvider = (nextProvider: AgentProviderChoice) => {
    if (nextProvider === provider) return
    setProvider(nextProvider)
    if (nextProvider === 'default') {
      setModel('')
    } else if (nextProvider === 'ollama') {
      setModel(primaryConfig?.provider === 'ollama' ? primaryConfig.model : 'llama3.2')
    } else if (nextProvider === 'bedrock') {
      setModel(
        primaryConfig?.provider === 'bedrock'
          ? primaryConfig.model
          : 'anthropic.claude-3-haiku-20240307-v1:0',
      )
    } else {
      setModel(
        primaryConfig?.azureDeployment ||
        (primaryConfig?.provider === 'azure' ? primaryConfig.model : 'gpt-4'),
      )
    }
    setConnectionStatus(null)
    setError(null)
  }

  const handleTestModel = async () => {
    if (provider === 'default' || !window.electronAPI?.aiTestConnection) return
    if (!model.trim()) {
      setConnectionStatus({ ok: false, message: 'Choose a model before testing.' })
      return
    }

    setTesting(true)
    setConnectionStatus(null)
    try {
      const result = await window.electronAPI.aiTestConnection({
        provider,
        model: model.trim(),
        ollamaBaseUrl: primaryConfig?.ollamaBaseUrl,
        bedrockRegion: primaryConfig?.bedrockRegion,
        bedrockAccessKeyId: primaryConfig?.bedrockAccessKeyId,
        bedrockSecretKey: primaryConfig?.bedrockSecretKey,
        azureEndpoint: primaryConfig?.azureEndpoint,
        azureApiKey: primaryConfig?.azureApiKey,
        azureDeployment: provider === 'azure' ? model.trim() : primaryConfig?.azureDeployment,
      })
      setConnectionStatus({
        ok: result.ok,
        message: result.ok ? 'Agent model is ready.' : result.error || 'Could not connect to this model.',
      })
    } catch (testError) {
      setConnectionStatus({
        ok: false,
        message: testError instanceof Error ? testError.message : 'Could not test this model.',
      })
    } finally {
      setTesting(false)
    }
  }

  const handleAvatarClick = () => fileInputRef.current?.click()

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    setUploading(true)
    try {
      const dataUrl = await compressImageForProfile(file)
      setImage(dataUrl)
    } catch {
      // Silently fail; user can try again
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const handleSave = () => {
    if (!name.trim()) {
      setError('Agent name is required')
      return
    }
    if (!systemPrompt.trim()) {
      setError('System prompt is required')
      return
    }
    if (provider !== 'default' && !model.trim()) {
      setError('Choose a model for this agent provider')
      return
    }
    setError(null)
    const providerOverride = provider === 'default' ? undefined : provider
    const input = {
      name: name.trim(),
      description: description.trim() || undefined,
      systemPrompt: systemPrompt.trim(),
      image,
      provider: providerOverride,
      model: providerOverride ? model.trim() : undefined,
    }
    if (isEditing && existing) {
      updateAgent(existing.id, input)
    } else {
      createAgent(input)
    }
    navigate('/settings/agents')
  }

  const handleDelete = () => {
    if (existing) deleteAgent(existing.id)
    navigate('/settings/agents')
  }

  return (
    <div className="settings-sub">
      <div className="settings-sub-bg settings-sub-bg--1" />
      <div className="settings-sub-bg settings-sub-bg--2" />
      <div className={`settings-sub-content settings-sub-content--agent-editor ${visible ? 'settings-sub-content--visible' : ''}`}>
        <div className="settings-sub-header">
          <GlassIconButton icon={<ArrowLeft size={20} />} onClick={() => navigate('/settings/agents')} size={44} />
          <h1 className="settings-sub-title">{isEditing ? 'Edit Agent' : 'Create Agent'}</h1>
        </div>

        <GlassContainer>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
          <div
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 24 }}
            role="button"
            tabIndex={0}
            onClick={handleAvatarClick}
            onKeyDown={(e) => e.key === 'Enter' && handleAvatarClick()}
            className="agent-avatar-picker"
          >
            <div className="account-avatar-wrapper">
              <UserAvatar src={image} initials={getInitials(name || 'Agent')} size={80} />
              {uploading && <div className="account-avatar-overlay">Uploading…</div>}
              <div className="account-avatar-badge">
                <Camera size={16} />
              </div>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
              {image ? (
                <>
                  Tap to change photo ·{' '}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setImage(undefined) }}
                    style={{ background: 'none', border: 'none', color: 'var(--status-error)', cursor: 'pointer', fontSize: 12, textDecoration: 'underline' }}
                  >
                    Remove
                  </button>
                </>
              ) : (
                'Tap to add photo'
              )}
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Agent name</label>
              <GlassTextField value={name} onChange={setName} placeholder="e.g. Portfolio Analyst" prefixIcon={<Bot size={16} />} />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Description (optional)</label>
              <GlassTextField value={description} onChange={setDescription} placeholder="Short summary shown in the agents list" />
            </div>

            <section className="agent-model-section" aria-labelledby="agent-model-heading">
              <div className="agent-model-section__heading">
                <span className="agent-model-section__icon"><Cpu size={17} /></span>
                <span>
                  <strong id="agent-model-heading">Model assignment</strong>
                  <small>Choose the intelligence behind this agent.</small>
                </span>
              </div>

              <div className="agent-provider-grid">
                <button
                  type="button"
                  className={`agent-provider-card ${provider === 'default' ? 'agent-provider-card--active' : ''}`}
                  onClick={() => selectProvider('default')}
                >
                  <Sparkles size={18} />
                  <span>
                    <strong>Primary model</strong>
                    <small>
                      {primaryConfig
                        ? `${providerName(primaryConfig.provider)} · ${primaryConfig.model}`
                        : 'Follows AI Model Configuration'}
                    </small>
                  </span>
                </button>
                <button
                  type="button"
                  className={`agent-provider-card ${provider === 'ollama' ? 'agent-provider-card--active' : ''}`}
                  onClick={() => selectProvider('ollama')}
                >
                  <Cpu size={18} />
                  <span><strong>Ollama</strong><small>Private and local</small></span>
                </button>
                <button
                  type="button"
                  className={`agent-provider-card ${provider === 'bedrock' ? 'agent-provider-card--active' : ''}`}
                  onClick={() => selectProvider('bedrock')}
                >
                  <Cloud size={18} />
                  <span><strong>AWS Bedrock</strong><small>Managed foundation models</small></span>
                </button>
                <button
                  type="button"
                  className={`agent-provider-card ${provider === 'azure' ? 'agent-provider-card--active' : ''}`}
                  onClick={() => selectProvider('azure')}
                >
                  <Cloud size={18} />
                  <span><strong>Azure OpenAI</strong><small>Your Azure deployment</small></span>
                </button>
              </div>

              {provider === 'default' ? (
                <div className="agent-model-inheritance">
                  <Sparkles size={14} />
                  <span>
                    This agent automatically follows future changes to your primary provider and model.
                  </span>
                </div>
              ) : (
                <div className="agent-model-controls">
                  <div>
                    <label>
                      {provider === 'azure' ? 'Deployment name' : 'Model'}
                    </label>
                    {provider === 'ollama' ? (
                      <select
                        className="ai-config-select"
                        value={model}
                        onChange={(event) => {
                          setModel(event.target.value)
                          setConnectionStatus(null)
                        }}
                        disabled={modelsLoading}
                      >
                        {modelsLoading ? (
                          <option value={model}>Loading local models…</option>
                        ) : ollamaModels.length === 0 ? (
                          <option value={model}>{model || 'No Ollama models found'}</option>
                        ) : (
                          <>
                            {!ollamaModels.includes(model) && model && (
                              <option value={model}>{model} (not installed)</option>
                            )}
                            {ollamaModels.map((ollamaModel) => (
                              <option key={ollamaModel} value={ollamaModel}>{ollamaModel}</option>
                            ))}
                          </>
                        )}
                      </select>
                    ) : (
                      <GlassTextField
                        value={model}
                        onChange={(value) => {
                          setModel(value)
                          setConnectionStatus(null)
                        }}
                        placeholder={provider === 'bedrock'
                          ? 'e.g. anthropic.claude-3-5-sonnet-20240620-v1:0'
                          : 'e.g. gpt-4o-advisor'}
                      />
                    )}
                    {modelsError && provider === 'ollama' && (
                      <p className="agent-model-error">{modelsError}</p>
                    )}
                  </div>

                  <div className="agent-model-actions">
                    {provider === 'ollama' && (
                      <GlassButton
                        text={modelsLoading ? 'Refreshing…' : 'Refresh models'}
                        icon={<RefreshCw size={14} />}
                        onClick={() => void loadOllamaModels()}
                        disabled={modelsLoading}
                        width="auto"
                      />
                    )}
                    <GlassButton
                      text={testing ? 'Testing…' : 'Test agent model'}
                      onClick={() => void handleTestModel()}
                      isLoading={testing}
                      disabled={!model.trim()}
                      width="auto"
                    />
                  </div>

                  {connectionStatus && (
                    <div className={`agent-model-status ${connectionStatus.ok ? 'agent-model-status--success' : 'agent-model-status--error'}`}>
                      {connectionStatus.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                      <span>{connectionStatus.message}</span>
                    </div>
                  )}

                  <p className="agent-model-note">
                    Uses the {providerName(provider)} connection saved in AI Model Configuration.
                  </p>
                </div>
              )}
            </section>

            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>System prompt</label>
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 8 }}>
                Defines this agent's persona, tone, and instructions. Sent to the model before every conversation.
              </p>
              <GlassTextField
                value={systemPrompt}
                onChange={setSystemPrompt}
                placeholder="You are a helpful assistant that specializes in..."
                maxLines={6}
              />
            </div>

            {error && <p style={{ fontSize: 13, color: 'var(--status-error)' }}>{error}</p>}

            <GlassButton text={isEditing ? 'Save Changes' : 'Create Agent'} onClick={handleSave} isPrimary />

            {isEditing && (
              <GlassButton
                text="Delete Agent"
                icon={<Trash2 size={16} />}
                onClick={() => setShowDeleteConfirm(true)}
              />
            )}
          </div>
        </GlassContainer>
      </div>

      {showDeleteConfirm && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <GlassContainer className="modal-content" onClick={undefined}>
            <div onClick={(e) => e.stopPropagation()}>
              <h2 style={{ color: 'var(--status-error)', marginBottom: 8 }}>Delete Agent?</h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: 20, fontSize: 14 }}>
                This will permanently delete "{existing?.name}". This cannot be undone.
              </p>
              <div style={{ display: 'flex', gap: 12 }}>
                <GlassButton text="Cancel" onClick={() => setShowDeleteConfirm(false)} />
                <GlassButton text="Delete" onClick={handleDelete} isPrimary />
              </div>
            </div>
          </GlassContainer>
        </div>
      )}
    </div>
  )
}

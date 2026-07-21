import { useCallback, useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AlertCircle,
  ArrowLeft,
  BadgeCheck,
  Bot,
  BriefcaseBusiness,
  Camera,
  CheckCircle2,
  Cloud,
  Cpu,
  FileText,
  LockKeyhole,
  Plus,
  Power,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Tag,
  Trash2,
  Wrench,
  X,
  Zap,
} from 'lucide-react'
import GlassContainer from '../../../components/glass/GlassContainer'
import GlassButton from '../../../components/glass/GlassButton'
import GlassTextField from '../../../components/glass/GlassTextField'
import GlassIconButton from '../../../components/glass/GlassIconButton'
import UserAvatar, { getInitials } from '../../../components/UserAvatar'
import { useAgents } from '../../../store/useAgents'
import type { Agent } from '../../../types/Agent'
import {
  EXPERT_TOOL_CATEGORIES,
  mergeExpertToolDefinitions,
  resolveToolResultLimit,
  type ExpertToolCategory,
} from '../../../ai/toolCatalog'
import { compressImageForProfile } from '../../../utils/profilePicture'
import { useEnterpriseMode } from '../../../hooks/useEnterpriseMode'
import AgentPrivateFiles from './AgentPrivateFiles'
import '../SettingsSubScreen.css'
import './AgentsScreen.css'

type AgentProviderChoice = 'default' | NonNullable<Agent['provider']>
type CollapsibleSection = 'specialties' | 'model' | 'guidance'

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
  const { isEnterprise } = useEnterpriseMode()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const existing = isEditing ? getAgent(agentId!) : undefined
  const isDefault = !!existing?.isDefault

  const [visible, setVisible] = useState(false)
  const [name, setName] = useState(existing?.name || '')
  const [description, setDescription] = useState(existing?.description || '')
  const [specialties, setSpecialties] = useState<string[]>(existing?.specialties || [])
  const [specialtyInput, setSpecialtyInput] = useState('')
  const [isActive, setIsActive] = useState(existing?.isActive !== false)
  const [systemPrompt, setSystemPrompt] = useState(existing?.systemPrompt || '')
  const [image, setImage] = useState<string | undefined>(existing?.image)
  const [provider, setProvider] = useState<AgentProviderChoice>(existing?.provider || 'default')
  const [model, setModel] = useState(existing?.model || '')
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState(existing?.ollamaBaseUrl || '')
  const [bedrockRegion, setBedrockRegion] = useState(existing?.bedrockRegion || '')
  const [bedrockAccessKeyId, setBedrockAccessKeyId] = useState(existing?.bedrockAccessKeyId || '')
  const [bedrockSecretKey, setBedrockSecretKey] = useState(existing?.bedrockSecretKey || '')
  const [azureEndpoint, setAzureEndpoint] = useState(existing?.azureEndpoint || '')
  const [azureApiKey, setAzureApiKey] = useState(existing?.azureApiKey || '')
  const [toolAccess, setToolAccess] = useState<NonNullable<Agent['toolAccess']>>(existing?.toolAccess || 'all')
  const [enabledToolNames, setEnabledToolNames] = useState<string[]>(existing?.enabledToolNames || [])
  const [toolLimits, setToolLimits] = useState<Record<string, number>>(existing?.toolLimits || {})
  const [runtimeTools, setRuntimeTools] = useState<{ name: string; description?: string }[]>([])
  const [toolQuery, setToolQuery] = useState('')
  const [activeToolCategory, setActiveToolCategory] = useState<ExpertToolCategory>('Portfolio')
  const [primaryConfig, setPrimaryConfig] = useState<AIConfigFromMain | null>(null)
  const [ollamaModels, setOllamaModels] = useState<string[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<{ ok: boolean; message: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [collapsedSections, setCollapsedSections] = useState<Record<CollapsibleSection, boolean>>({
    specialties: true,
    model: true,
    guidance: true,
  })

  useEffect(() => { requestAnimationFrame(() => setVisible(true)) }, [])

  useEffect(() => {
    let active = true
    void window.electronAPI?.aiConfigGet?.().then((config) => {
      if (!active) return
      setPrimaryConfig(config)
      setOllamaBaseUrl((value) => value || config.ollamaBaseUrl || 'http://localhost:11434')
      setBedrockRegion((value) => value || config.bedrockRegion || '')
      setBedrockAccessKeyId((value) => value || config.bedrockAccessKeyId || '')
      setBedrockSecretKey((value) => value || config.bedrockSecretKey || '')
      setAzureEndpoint((value) => value || config.azureEndpoint || '')
      setAzureApiKey((value) => value || config.azureApiKey || '')
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    void window.mcpAPI?.listTools?.().then(({ tools }) => {
      if (active) setRuntimeTools(tools)
    }).catch(() => {
      // Built-in tools remain configurable if connected capabilities cannot be read.
    })
    return () => { active = false }
  }, [])

  const availableTools = useMemo(
    () => mergeExpertToolDefinitions(runtimeTools, { includeEnterprise: isEnterprise }),
    [runtimeTools, isEnterprise],
  )

  // Keep form in sync if navigated directly to an existing agent's id
  useEffect(() => {
    if (existing) {
      setName(existing.name)
      setDescription(existing.description || '')
      setSpecialties(existing.specialties || [])
      setSpecialtyInput('')
      setIsActive(existing.isActive !== false)
      setSystemPrompt(existing.systemPrompt)
      setImage(existing.image)
      setProvider(existing.provider || 'default')
      setModel(existing.model || '')
      setOllamaBaseUrl(existing.ollamaBaseUrl || primaryConfig?.ollamaBaseUrl || 'http://localhost:11434')
      setBedrockRegion(existing.bedrockRegion || primaryConfig?.bedrockRegion || '')
      setBedrockAccessKeyId(existing.bedrockAccessKeyId || primaryConfig?.bedrockAccessKeyId || '')
      setBedrockSecretKey(existing.bedrockSecretKey || primaryConfig?.bedrockSecretKey || '')
      setAzureEndpoint(existing.azureEndpoint || primaryConfig?.azureEndpoint || '')
      setAzureApiKey(existing.azureApiKey || primaryConfig?.azureApiKey || '')
      setToolAccess(existing.toolAccess || 'all')
      setEnabledToolNames(existing.enabledToolNames || [])
      setToolLimits(existing.toolLimits || {})
      setToolQuery('')
      setActiveToolCategory('Portfolio')
      setConnectionStatus(null)
      setCollapsedSections({ specialties: true, model: true, guidance: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId])

  const loadOllamaModels = useCallback(async () => {
    if (!window.electronAPI?.aiOllamaListModels) return
    setModelsLoading(true)
    setModelsError(null)
    try {
      const result = await window.electronAPI.aiOllamaListModels(
        ollamaBaseUrl || 'http://localhost:11434',
      )
      setOllamaModels(result.models)
      setModelsError(result.error || null)
      setModel((current) => current || (
        result.models.includes('llama3.2') ? 'llama3.2' : result.models[0] || 'llama3.2'
      ))
    } finally {
      setModelsLoading(false)
    }
  }, [ollamaBaseUrl])

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
        ollamaBaseUrl,
        bedrockRegion,
        bedrockAccessKeyId,
        bedrockSecretKey,
        azureEndpoint,
        azureApiKey,
        azureDeployment: provider === 'azure' ? model.trim() : primaryConfig?.azureDeployment,
      })
      setConnectionStatus({
        ok: result.ok,
        message: result.ok ? 'Expert model is ready.' : result.error || 'Could not connect to this model.',
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

  const addSpecialty = () => {
    const specialty = specialtyInput.trim()
    if (!specialty || specialties.some((item) => item.toLocaleLowerCase() === specialty.toLocaleLowerCase())) {
      setSpecialtyInput('')
      return
    }
    setSpecialties((current) => [...current, specialty].slice(0, 8))
    setSpecialtyInput('')
  }

  const selectToolAccess = (access: NonNullable<Agent['toolAccess']>) => {
    setToolAccess(access)
    if (access === 'selected' && enabledToolNames.length === 0) {
      setEnabledToolNames(availableTools.map((tool) => tool.name))
    }
  }

  const toggleTool = (toolName: string) => {
    if (toolAccess === 'all') {
      setToolAccess('selected')
      setEnabledToolNames(availableTools.map((tool) => tool.name).filter((name) => name !== toolName))
      return
    }
    if (toolAccess === 'none') {
      setToolAccess('selected')
      setEnabledToolNames([toolName])
      return
    }
    setEnabledToolNames((current) => current.includes(toolName)
      ? current.filter((name) => name !== toolName)
      : [...current, toolName])
  }

  const setToolLimit = (toolName: string, raw: string, bounds: { min: number; max: number; default: number }) => {
    const trimmed = raw.trim()
    if (!trimmed) {
      setToolLimits((current) => {
        const next = { ...current }
        delete next[toolName]
        return next
      })
      return
    }
    const parsed = Number(trimmed)
    if (!Number.isFinite(parsed)) return
    const clamped = Math.min(bounds.max, Math.max(bounds.min, Math.round(parsed)))
    setToolLimits((current) => (
      clamped === bounds.default
        ? (() => {
          const next = { ...current }
          delete next[toolName]
          return next
        })()
        : { ...current, [toolName]: clamped }
    ))
  }

  const toggleToolCategory = (category: ExpertToolCategory) => {
    const categoryNames = availableTools
      .filter((tool) => tool.category === category)
      .map((tool) => tool.name)
    const categoryEnabled = categoryNames.every((name) => enabledToolNames.includes(name))
    if (toolAccess === 'all') {
      setToolAccess('selected')
      setEnabledToolNames(availableTools
        .map((tool) => tool.name)
        .filter((name) => !categoryNames.includes(name)))
      return
    }
    if (toolAccess === 'none') {
      setToolAccess('selected')
      setEnabledToolNames(categoryNames)
      return
    }
    setToolAccess('selected')
    setEnabledToolNames((current) => categoryEnabled
      ? current.filter((name) => !categoryNames.includes(name))
      : [...new Set([...current, ...categoryNames])])
  }

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
      setError('Expert name is required')
      return
    }
    if (!systemPrompt.trim()) {
      setError('System prompt is required')
      setCollapsedSections((current) => ({ ...current, guidance: false }))
      return
    }
    if (provider !== 'default' && !model.trim()) {
      setError('Choose a model for this expert provider')
      setCollapsedSections((current) => ({ ...current, model: false }))
      return
    }
    setError(null)
    const providerOverride = provider === 'default' ? undefined : provider
    const input = {
      name: name.trim(),
      description: description.trim() || undefined,
      specialties,
      isActive,
      systemPrompt: systemPrompt.trim(),
      image,
      provider: providerOverride,
      model: providerOverride ? model.trim() : undefined,
      ollamaBaseUrl: providerOverride === 'ollama' ? ollamaBaseUrl.trim() || undefined : undefined,
      bedrockRegion: providerOverride === 'bedrock' ? bedrockRegion.trim() || undefined : undefined,
      bedrockAccessKeyId: providerOverride === 'bedrock' ? bedrockAccessKeyId.trim() || undefined : undefined,
      bedrockSecretKey: providerOverride === 'bedrock' ? bedrockSecretKey || undefined : undefined,
      azureEndpoint: providerOverride === 'azure' ? azureEndpoint.trim() || undefined : undefined,
      azureApiKey: providerOverride === 'azure' ? azureApiKey || undefined : undefined,
      toolAccess,
      enabledToolNames: toolAccess === 'selected' ? enabledToolNames : undefined,
      toolLimits: Object.keys(toolLimits).length > 0 ? toolLimits : undefined,
    }
    if (isEditing && existing) {
      updateAgent(existing.id, input)
    } else {
      createAgent(input)
    }
    navigate('/main?tab=experts')
  }

  const handleDelete = () => {
    if (existing) deleteAgent(existing.id)
    navigate('/main?tab=experts')
  }

  const normalizedToolQuery = toolQuery.trim().toLocaleLowerCase()
  const filteredTools = availableTools.filter((tool) => (
    !normalizedToolQuery ||
    `${tool.label} ${tool.description} ${tool.category} ${tool.name}`
      .toLocaleLowerCase()
      .includes(normalizedToolQuery)
  ))
  const toolsByCategory = EXPERT_TOOL_CATEGORIES
    .map((category) => ({
      category,
      tools: filteredTools.filter((tool) => tool.category === category),
    }))
    .filter((group) => group.tools.length > 0)
  const visibleToolGroups = normalizedToolQuery
    ? toolsByCategory
    : toolsByCategory.filter((group) => group.category === activeToolCategory)
  const enabledToolCount = toolAccess === 'all'
    ? availableTools.length
    : toolAccess === 'none'
      ? 0
      : enabledToolNames.filter((name) => availableTools.some((tool) => tool.name === name)).length

  const toggleSection = (section: CollapsibleSection) => {
    setCollapsedSections((current) => ({ ...current, [section]: !current[section] }))
  }

  const handleSectionKeyDown = (
    section: CollapsibleSection,
    event: React.KeyboardEvent<HTMLDivElement>,
  ) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    toggleSection(section)
  }

  return (
    <div className="settings-sub settings-sub--expert-editor">
      <div className="settings-sub-bg settings-sub-bg--1" />
      <div className="settings-sub-bg settings-sub-bg--2" />
      <div className={`settings-sub-content settings-sub-content--agent-editor ${visible ? 'settings-sub-content--visible' : ''}`}>
        <div className="settings-sub-header agent-editor-header">
          <GlassIconButton icon={<ArrowLeft size={20} />} onClick={() => navigate('/main?tab=experts')} size={44} />
          <div>
            <span>Expert workspace</span>
            <h1 className="settings-sub-title">{isEditing ? 'Edit Expert' : 'Create Expert'}</h1>
          </div>
          <div className="agent-editor-header__actions">
            <GlassIconButton
              icon={<Save size={21} />}
              onClick={handleSave}
              size={48}
              className="agent-editor-action agent-editor-action--save"
              title={isEditing ? 'Save expert profile' : 'Create expert profile'}
            />
            {isEditing && !isDefault && (
              <GlassIconButton
                icon={<Trash2 size={20} />}
                onClick={() => setShowDeleteConfirm(true)}
                size={48}
                className="agent-editor-action agent-editor-action--delete"
                title="Delete expert"
              />
            )}
          </div>
        </div>

        <GlassContainer className="agent-editor-card">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
          <div className="agent-profile-hero">
            <div className="agent-profile-hero__cover">
              <span><BriefcaseBusiness size={16} /> FinoCurve expert network</span>
            </div>
            <div className="agent-profile-hero__body">
              <div className="agent-profile-hero__avatar-block">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={handleAvatarClick}
                  onKeyDown={(event) => (event.key === 'Enter' || event.key === ' ') && handleAvatarClick()}
                  className="agent-avatar-picker"
                  aria-label="Change expert profile photo"
                >
                  <div className="account-avatar-wrapper">
                    <UserAvatar src={image} initials={getInitials(name || 'Expert')} size={92} />
                    {uploading && <div className="account-avatar-overlay">Uploading…</div>}
                    <div className="account-avatar-badge"><Camera size={16} /></div>
                  </div>
                </div>
                <button
                  type="button"
                  className="agent-profile-hero__photo-action"
                  onClick={image ? () => setImage(undefined) : handleAvatarClick}
                >
                  {image ? 'Remove photo' : 'Add a professional photo'}
                </button>
              </div>
              <div className="agent-profile-hero__identity">
                <span className="agent-profile-hero__eyebrow"><BadgeCheck size={13} /> Expert profile</span>
                <h2>{name.trim() || 'New expert'}</h2>
                <p>{description.trim() || 'Add a concise professional headline'}</p>
                <div>
                  <span className={isActive ? 'agent-status agent-status--active' : 'agent-status agent-status--inactive'}>
                    <i /> {isActive ? 'Available for conversations' : 'Profile inactive'}
                  </span>
                  <span className="agent-profile-hero__capability"><Wrench size={12} /> {enabledToolCount} tools</span>
                </div>
              </div>
            </div>
          </div>

          <div className="agent-editor-form">
            <section className="agent-availability-card">
              <span className="agent-availability-card__icon"><Power size={16} /></span>
              <span>
                <strong>Expert availability</strong>
                <small>
                  {isDefault
                    ? 'The default assistant is always available and cannot be deactivated.'
                    : 'Inactive experts stay saved but cannot join or respond in conversations.'}
                </small>
              </span>
              <button
                type="button"
                className={`settings-toggle ${isActive ? 'settings-toggle--on' : ''}`}
                role="switch"
                aria-checked={isActive}
                aria-label="Expert availability"
                onClick={() => setIsActive((current) => !current)}
                disabled={isDefault}
              >
                <span className="settings-toggle__thumb" />
              </button>
            </section>

            <div className="agent-profile-fields">
              <div>
                <label>Expert name</label>
                <GlassTextField value={name} onChange={setName} placeholder="e.g. Kevin Coleman" prefixIcon={<Bot size={16} />} />
              </div>
              <div>
                <label>Professional headline</label>
                <GlassTextField value={description} onChange={setDescription} placeholder="e.g. Tax strategist for business owners" prefixIcon={<BriefcaseBusiness size={16} />} />
              </div>
            </div>

            <section className={`agent-specialties agent-collapsible-section ${collapsedSections.specialties ? 'agent-collapsible-section--collapsed' : ''}`} aria-labelledby="agent-specialties-heading">
              <div
                className="agent-section-heading agent-collapsible-section__trigger"
                role="button"
                tabIndex={0}
                aria-expanded={!collapsedSections.specialties}
                aria-controls="agent-specialties-content"
                onClick={() => toggleSection('specialties')}
                onKeyDown={(event) => handleSectionKeyDown('specialties', event)}
              >
                <span className="agent-section-heading__icon"><Tag size={16} /></span>
                <span>
                  <strong id="agent-specialties-heading">Areas of expertise</strong>
                  <small>{collapsedSections.specialties
                    ? specialties.length > 0
                      ? `${specialties.length} ${specialties.length === 1 ? 'specialty' : 'specialties'} configured`
                      : 'No specialties configured'
                    : 'Add searchable specialties that help people and smart routing find the right expert.'}</small>
                </span>
              </div>
              {!collapsedSections.specialties && (
                <div id="agent-specialties-content" className="agent-collapsible-section__content">
                  <div className="agent-specialties__input">
                    <GlassTextField
                      value={specialtyInput}
                      onChange={setSpecialtyInput}
                      placeholder="e.g. Tax planning"
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          addSpecialty()
                        }
                      }}
                    />
                    <button type="button" onClick={addSpecialty} disabled={!specialtyInput.trim() || specialties.length >= 8}>
                      <Plus size={15} /> Add
                    </button>
                  </div>
                  {specialties.length > 0 ? (
                    <div className="agent-specialties__chips">
                      {specialties.map((specialty) => (
                        <span key={specialty}>
                          {specialty}
                          <button
                            type="button"
                            onClick={() => setSpecialties((current) => current.filter((item) => item !== specialty))}
                            aria-label={`Remove ${specialty}`}
                          >
                            <X size={11} />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="agent-specialties__empty">No specialties yet. Add two or three focused capabilities.</p>
                  )}
                </div>
              )}
            </section>

            <section className={`agent-model-section agent-collapsible-section ${collapsedSections.model ? 'agent-collapsible-section--collapsed' : ''}`} aria-labelledby="agent-model-heading">
              <div
                className="agent-model-section__heading agent-collapsible-section__trigger"
                role="button"
                tabIndex={0}
                aria-expanded={!collapsedSections.model}
                aria-controls="agent-model-content"
                onClick={() => toggleSection('model')}
                onKeyDown={(event) => handleSectionKeyDown('model', event)}
              >
                <span className="agent-model-section__icon"><Cpu size={17} /></span>
                <span>
                  <strong id="agent-model-heading">Model assignment</strong>
                  <small>{collapsedSections.model
                    ? provider === 'default'
                      ? 'Using the primary model'
                      : `${providerName(provider)} · ${model || 'Model not selected'}`
                    : 'Choose the intelligence behind this expert.'}</small>
                </span>
              </div>

              {!collapsedSections.model && (
                <div id="agent-model-content" className="agent-collapsible-section__content">
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
                    This expert automatically follows future changes to your primary provider and model.
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

                  <div className="agent-model-credentials">
                    {provider === 'ollama' && (
                      <div>
                        <label>Ollama base URL</label>
                        <GlassTextField
                          value={ollamaBaseUrl}
                          onChange={(value) => { setOllamaBaseUrl(value); setConnectionStatus(null) }}
                          placeholder="http://localhost:11434"
                        />
                      </div>
                    )}
                    {provider === 'bedrock' && (
                      <>
                        <div>
                          <label>Region</label>
                          <GlassTextField value={bedrockRegion} onChange={setBedrockRegion} placeholder="us-east-1" />
                        </div>
                        <div>
                          <label>Access Key ID</label>
                          <GlassTextField value={bedrockAccessKeyId} onChange={setBedrockAccessKeyId} placeholder="AKIA..." />
                        </div>
                        <div>
                          <label>Secret Access Key</label>
                          <GlassTextField value={bedrockSecretKey} onChange={setBedrockSecretKey} placeholder="••••••••" type="password" />
                        </div>
                      </>
                    )}
                    {provider === 'azure' && (
                      <>
                        <div>
                          <label>Endpoint</label>
                          <GlassTextField value={azureEndpoint} onChange={setAzureEndpoint} placeholder="https://your-resource.openai.azure.com/" />
                        </div>
                        <div>
                          <label>API Key</label>
                          <GlassTextField value={azureApiKey} onChange={setAzureApiKey} placeholder="••••••••" type="password" />
                        </div>
                      </>
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
                        text={testing ? 'Testing…' : 'Test expert model'}
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
                    Values are prefilled from AI Model Configuration. Changes here apply only to this expert.
                  </p>
                </div>
                )}
                </div>
              )}
            </section>

            <AgentPrivateFiles agentId={existing?.id} />

            <section className={`agent-guidance-section agent-collapsible-section ${collapsedSections.guidance ? 'agent-collapsible-section--collapsed' : ''}`} aria-labelledby="agent-guidance-heading">
              <div
                className="agent-section-heading agent-collapsible-section__trigger"
                role="button"
                tabIndex={0}
                aria-expanded={!collapsedSections.guidance}
                aria-controls="agent-guidance-content"
                onClick={() => toggleSection('guidance')}
                onKeyDown={(event) => handleSectionKeyDown('guidance', event)}
              >
                <span className="agent-section-heading__icon"><FileText size={16} /></span>
                <span>
                  <strong id="agent-guidance-heading">Expert guidance</strong>
                  <small>{collapsedSections.guidance
                    ? systemPrompt.trim() ? 'Expert instructions configured' : 'No guidance configured · Required'
                    : "Define this expert's point of view, communication style, boundaries, and working method."}</small>
                </span>
              </div>
              {!collapsedSections.guidance && (
                <div id="agent-guidance-content" className="agent-collapsible-section__content">
                  <GlassTextField
                    value={systemPrompt}
                    onChange={setSystemPrompt}
                    placeholder="You are a trusted expert who specializes in… When advising, you should… Never…"
                    maxLines={7}
                  />

                  <div className="agent-guidance-section__tip">
                    <ShieldCheck size={14} />
                    <span>Strong profiles state the expert's scope, evidence standards, response format, and when to acknowledge uncertainty.</span>
                  </div>
                </div>
              )}
            </section>

            <section className="agent-tools-section" aria-labelledby="agent-tools-heading">
              <div className="agent-section-heading agent-section-heading--tools">
                <span className="agent-section-heading__icon"><Wrench size={16} /></span>
                <span>
                  <strong id="agent-tools-heading">Tools and permissions</strong>
                  <small>Give this expert only the capabilities needed for their role. Fewer tools usually means faster, more focused decisions.</small>
                </span>
                <span className="agent-tools-section__count">{enabledToolCount} of {availableTools.length}</span>
              </div>

              <div className="agent-tool-policy" role="radiogroup" aria-label="Tool access policy">
                <button
                  type="button"
                  role="radio"
                  aria-checked={toolAccess === 'all'}
                  className={toolAccess === 'all' ? 'agent-tool-policy__option--active' : ''}
                  onClick={() => selectToolAccess('all')}
                >
                  <Zap size={16} />
                  <span><strong>All tools</strong><small>Automatic access to current and newly connected tools</small></span>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={toolAccess === 'selected'}
                  className={toolAccess === 'selected' ? 'agent-tool-policy__option--active' : ''}
                  onClick={() => selectToolAccess('selected')}
                >
                  <ShieldCheck size={16} />
                  <span><strong>Selected tools</strong><small>Recommended for a focused expert profile</small></span>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={toolAccess === 'none'}
                  className={toolAccess === 'none' ? 'agent-tool-policy__option--active' : ''}
                  onClick={() => selectToolAccess('none')}
                >
                  <LockKeyhole size={16} />
                  <span><strong>No tools</strong><small>Conversation and reasoning only</small></span>
                </button>
              </div>

              <label className="agent-tool-search">
                <Search size={15} />
                <input
                  type="search"
                  value={toolQuery}
                  onChange={(event) => setToolQuery(event.target.value)}
                  placeholder="Search capabilities"
                />
              </label>

              <div className="agent-tool-browser">
                <nav className="agent-tool-categories" aria-label="Tool categories">
                  <span>Categories</span>
                  {EXPERT_TOOL_CATEGORIES.map((category) => {
                    const categoryTools = availableTools.filter((tool) => tool.category === category)
                    if (categoryTools.length === 0) return null
                    const categoryEnabledCount = toolAccess === 'all'
                      ? categoryTools.length
                      : toolAccess === 'none'
                        ? 0
                        : categoryTools.filter((tool) => enabledToolNames.includes(tool.name)).length
                    return (
                      <button
                        key={category}
                        type="button"
                        className={!normalizedToolQuery && activeToolCategory === category ? 'agent-tool-categories__active' : ''}
                        onClick={() => {
                          setActiveToolCategory(category)
                          setToolQuery('')
                        }}
                        aria-current={!normalizedToolQuery && activeToolCategory === category ? 'page' : undefined}
                      >
                        <span><strong>{category}</strong><small>{categoryTools.length} tools</small></span>
                        <em>{categoryEnabledCount}/{categoryTools.length}</em>
                      </button>
                    )
                  })}
                </nav>

                <div className="agent-tool-results">
                  {normalizedToolQuery && (
                    <div className="agent-tool-results__search-summary">
                      <Search size={13} /> Results across all categories
                    </div>
                  )}
                  {visibleToolGroups.map(({ category, tools }) => {
                    const categoryTools = availableTools.filter((tool) => tool.category === category)
                    const categoryEnabled = toolAccess === 'all' || (
                      toolAccess === 'selected' && categoryTools.every((tool) => enabledToolNames.includes(tool.name))
                    )
                    return (
                      <div key={category} className="agent-tool-group">
                        <div className="agent-tool-group__heading">
                          <span><strong>{category}</strong><small>{tools.length} {tools.length === 1 ? 'capability' : 'capabilities'}</small></span>
                          <button
                            type="button"
                            onClick={() => toggleToolCategory(category)}
                            aria-label={`${categoryEnabled ? 'Disable' : 'Enable'} all ${category} tools`}
                          >
                            {categoryEnabled ? 'Disable group' : 'Enable group'}
                          </button>
                        </div>
                        <div className="agent-tool-list">
                          {tools.map((tool) => {
                            const enabled = toolAccess === 'all' || (
                              toolAccess === 'selected' && enabledToolNames.includes(tool.name)
                            )
                            const limitMeta = tool.resultLimit
                            const effectiveLimit = limitMeta
                              ? (resolveToolResultLimit(tool.name, toolLimits[tool.name]) ?? limitMeta.default)
                              : undefined
                            return (
                              <div key={tool.name} className={`agent-tool-row ${enabled ? 'agent-tool-row--enabled' : ''}`}>
                                <span className="agent-tool-row__icon">
                                  {tool.mutatesData ? <Zap size={14} /> : <Wrench size={14} />}
                                </span>
                                <span className="agent-tool-row__copy">
                                  <span>
                                    <strong>{tool.label}</strong>
                                    {tool.mutatesData && <em>Can make changes</em>}
                                  </span>
                                  <small>{tool.description}</small>
                                  {limitMeta && (
                                    <label className={`agent-tool-row__limit ${enabled ? '' : 'agent-tool-row__limit--disabled'}`}>
                                      <span>{limitMeta.label}</span>
                                      <input
                                        type="number"
                                        min={limitMeta.min}
                                        max={limitMeta.max}
                                        step={1}
                                        value={effectiveLimit}
                                        disabled={!enabled}
                                        onChange={(event) => setToolLimit(tool.name, event.target.value, limitMeta)}
                                        aria-label={`${tool.label} ${limitMeta.label}`}
                                      />
                                      <em>{limitMeta.min}–{limitMeta.max}</em>
                                    </label>
                                  )}
                                </span>
                                <button
                                  type="button"
                                  role="switch"
                                  aria-checked={enabled}
                                  aria-label={`${tool.label} access`}
                                  className={`settings-toggle ${enabled ? 'settings-toggle--on' : ''}`}
                                  onClick={() => toggleTool(tool.name)}
                                >
                                  <span className="settings-toggle__thumb" />
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                  {visibleToolGroups.length === 0 && (
                    <p className="agent-tool-groups__empty">No capabilities match “{toolQuery}”.</p>
                  )}
                </div>
              </div>
            </section>

            {error && <p className="agent-editor-error">{error}</p>}
          </div>
        </GlassContainer>
      </div>

      {showDeleteConfirm && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <GlassContainer className="modal-content" onClick={undefined}>
            <div onClick={(e) => e.stopPropagation()}>
              <h2 style={{ color: 'var(--status-error)', marginBottom: 8 }}>Delete Expert?</h2>
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

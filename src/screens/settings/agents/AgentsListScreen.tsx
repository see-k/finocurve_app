import { useMemo, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  BadgeCheck,
  Bot,
  BriefcaseBusiness,
  Eye,
  MessageSquare,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  Users,
  Wrench,
} from 'lucide-react'
import GlassContainer from '../../../components/glass/GlassContainer'
import GlassButton from '../../../components/glass/GlassButton'
import GlassIconButton from '../../../components/glass/GlassIconButton'
import UserAvatar, { getInitials } from '../../../components/UserAvatar'
import { useAgents } from '../../../store/useAgents'
import { useConversations } from '../../../store/useConversations'
import { getAgentToolCount, isAgentActive } from '../../../types/Agent'
import { mergeExpertToolDefinitions } from '../../../ai/toolCatalog'
import '../SettingsSubScreen.css'
import './AgentsScreen.css'

export default function AgentsListScreen() {
  const navigate = useNavigate()
  const { agents, deleteAgent } = useAgents()
  const { findOneOnOne, createConversation } = useConversations()
  const [visible, setVisible] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [aiConfig, setAIConfig] = useState<AIConfigFromMain | null>(null)
  const [showProviderInChat, setShowProviderInChat] = useState(false)
  const [displaySaving, setDisplaySaving] = useState(false)
  const [displayError, setDisplayError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [availableToolCount, setAvailableToolCount] = useState(() => mergeExpertToolDefinitions([]).length)

  useEffect(() => { requestAnimationFrame(() => setVisible(true)) }, [])

  useEffect(() => {
    let active = true
    void window.electronAPI?.aiConfigGet?.().then((config) => {
      if (!active) return
      setAIConfig(config)
      setShowProviderInChat(config.agentShowProvider ?? false)
    }).catch(() => {
      if (active) setDisplayError('Could not load agent display settings.')
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    void window.mcpAPI?.listTools?.().then(({ tools }) => {
      if (active) setAvailableToolCount(mergeExpertToolDefinitions(tools).length)
    }).catch(() => {
      // Built-in capability count remains useful if connected tools cannot be read.
    })
    return () => { active = false }
  }, [])

  const handleShowProviderToggle = async () => {
    if (!aiConfig || !window.electronAPI?.aiConfigSave || displaySaving) return
    const nextValue = !showProviderInChat
    setShowProviderInChat(nextValue)
    setDisplaySaving(true)
    setDisplayError(null)
    try {
      const nextConfig = { ...aiConfig, agentShowProvider: nextValue }
      await window.electronAPI.aiConfigSave(nextConfig)
      setAIConfig(nextConfig)
    } catch {
      setShowProviderInChat(!nextValue)
      setDisplayError('Could not save the agent display setting.')
    } finally {
      setDisplaySaving(false)
    }
  }

  const handleDelete = () => {
    if (deleteTarget) deleteAgent(deleteTarget)
    setDeleteTarget(null)
  }

  const handleChat = (agentId: string, agentName: string) => {
    const existing = findOneOnOne(agentId)
    const conversation = existing || createConversation({ title: agentName, participantAgentIds: [agentId] })
    navigate(`/main?tab=chats&conversationId=${conversation.id}`)
  }

  const normalizedQuery = query.trim().toLocaleLowerCase()
  const visibleAgents = useMemo(() => agents.filter((agent) => (
    !normalizedQuery ||
    `${agent.name} ${agent.description || ''} ${(agent.specialties || []).join(' ')}`
      .toLocaleLowerCase()
      .includes(normalizedQuery)
  )), [agents, normalizedQuery])
  const activeCount = agents.filter(isAgentActive).length
  const specialtyCount = new Set(agents.flatMap((agent) => agent.specialties || [])).size

  return (
    <div className="settings-sub">
      <div className="settings-sub-bg settings-sub-bg--1" />
      <div className="settings-sub-bg settings-sub-bg--2" />
      <div className={`settings-sub-content settings-sub-content--experts ${visible ? 'settings-sub-content--visible' : ''}`}>
        <div className="settings-sub-header expert-directory-header">
          <GlassIconButton icon={<ArrowLeft size={20} />} onClick={() => navigate(-1)} size={44} />
          <div>
            <span>Private expert network</span>
            <h1 className="settings-sub-title">AI Experts</h1>
          </div>
          <GlassButton
            text="Create Expert"
            icon={<Plus size={16} />}
            onClick={() => navigate('/settings/agents/new')}
            isPrimary
            width="auto"
          />
        </div>

        <GlassContainer className="expert-directory-intro">
          <div className="expert-directory-intro__copy">
            <span className="expert-directory-intro__icon"><BriefcaseBusiness size={20} /></span>
            <div>
              <span className="expert-directory-intro__eyebrow"><BadgeCheck size={13} /> Purpose-built expertise</span>
              <h2>Build a bench of specialists you trust</h2>
              <p>
                Give each expert a professional profile, focused instructions, a model, and only the tools they need.
                Bring one expert into a private chat or assemble a multidisciplinary room.
              </p>
            </div>
          </div>

          <div className="expert-directory-stats" aria-label="Expert network summary">
            <div><Users size={16} /><span><strong>{activeCount}</strong><small>Available experts</small></span></div>
            <div><BadgeCheck size={16} /><span><strong>{specialtyCount}</strong><small>Specialties</small></span></div>
            <div><Wrench size={16} /><span><strong>{availableToolCount}</strong><small>Capabilities</small></span></div>
          </div>
        </GlassContainer>

        <div className="expert-directory-controls">
          <label className="expert-directory-search">
            <Search size={15} />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name, role, or specialty"
            />
          </label>

          <div className="expert-directory-display">
            <span className="expert-directory-display__icon"><Eye size={15} /></span>
            <span>
              <strong>Show models in chat</strong>
              <small>Display each expert's provider and model</small>
            </span>
            <button
              type="button"
              className={`settings-toggle ${showProviderInChat ? 'settings-toggle--on' : ''}`}
              role="switch"
              aria-checked={showProviderInChat}
              aria-label="Show expert model providers in chat"
              onClick={() => void handleShowProviderToggle()}
              disabled={!aiConfig || displaySaving}
            >
              <span className="settings-toggle__thumb" />
            </button>
          </div>
        </div>
        {displayError && <p className="agents-display-options__error">{displayError}</p>}

        {agents.length === 0 ? (
          <GlassContainer className="expert-directory-empty">
            <span><Bot size={24} /></span>
            <h2>Your expert network starts here</h2>
            <p>Create a focused specialist with a professional identity, clear working instructions, and a carefully chosen toolset.</p>
            <GlassButton
              text="Create Your First Expert"
              icon={<Plus size={16} />}
              onClick={() => navigate('/settings/agents/new')}
              isPrimary
              width="auto"
            />
          </GlassContainer>
        ) : visibleAgents.length === 0 ? (
          <GlassContainer className="expert-directory-empty">
            <span><Search size={24} /></span>
            <h2>No matching experts</h2>
            <p>Try another name, role, or specialty.</p>
          </GlassContainer>
        ) : (
          <div className="expert-directory-grid">
            {visibleAgents.map((agent) => {
              const active = isAgentActive(agent)
              const toolCount = getAgentToolCount(agent, availableToolCount)
              return (
                <article key={agent.id} className={`expert-card ${active ? '' : 'expert-card--inactive'}`}>
                  <div className="expert-card__cover">
                    <span>{agent.specialties?.[0] || 'FinoCurve expert'}</span>
                    <span className={active ? 'agent-status agent-status--active' : 'agent-status agent-status--inactive'}>
                      <i /> {active ? 'Available' : 'Inactive'}
                    </span>
                  </div>
                  <div className="expert-card__body">
                    <div className="expert-card__avatar">
                      <UserAvatar src={agent.image} initials={getInitials(agent.name)} size={70} />
                      <BadgeCheck size={18} aria-label="Configured expert" />
                    </div>
                    <div className="expert-card__identity">
                      <h2>{agent.name}</h2>
                      <p>{agent.description || 'FinoCurve AI specialist'}</p>
                      <span className="agents-list__provider-badge">
                        {agent.provider === 'ollama' && 'Ollama'}
                        {agent.provider === 'bedrock' && 'AWS Bedrock'}
                        {agent.provider === 'azure' && 'Azure OpenAI'}
                        {!agent.provider && 'Primary model'}
                        {agent.model && <b>· {agent.model}</b>}
                      </span>
                    </div>

                    <div className="expert-card__specialties">
                      {(agent.specialties || []).slice(0, 3).map((specialty) => <span key={specialty}>{specialty}</span>)}
                      {(agent.specialties?.length || 0) > 3 && <span>+{agent.specialties!.length - 3}</span>}
                      {!agent.specialties?.length && <span className="expert-card__specialty-empty">Add specialties</span>}
                    </div>

                    <div className="expert-card__capabilities">
                      <span><Wrench size={13} /><strong>{toolCount}</strong> enabled tools</span>
                      <span><SlidersHorizontal size={13} />{agent.toolAccess === 'selected' ? 'Focused access' : agent.toolAccess === 'none' ? 'Conversation only' : 'Full access'}</span>
                    </div>

                    <div className="expert-card__actions">
                      <button
                        type="button"
                        className="expert-card__message"
                        onClick={() => handleChat(agent.id, agent.name)}
                        disabled={!active}
                        title={active ? 'Chat with this expert' : 'Reactivate this expert to start a chat'}
                      >
                        <MessageSquare size={15} /> Message
                      </button>
                      <button
                        type="button"
                        onClick={() => navigate(`/settings/agents/${agent.id}`)}
                        title="Edit expert profile"
                      >
                        <Pencil size={15} /> Edit
                      </button>
                      <button
                        type="button"
                        className="expert-card__delete"
                        onClick={() => setDeleteTarget(agent.id)}
                        title="Delete expert"
                        aria-label={`Delete ${agent.name}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>

      {deleteTarget && (
        <div className="modal-overlay" onClick={() => setDeleteTarget(null)}>
          <GlassContainer className="modal-content" onClick={undefined}>
            <div onClick={(e) => e.stopPropagation()}>
              <h2 style={{ color: 'var(--status-error)', marginBottom: 8 }}>Delete Expert?</h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: 20, fontSize: 14 }}>
                This will permanently delete this expert profile. Existing conversation messages remain, but the expert cannot respond again.
              </p>
              <div style={{ display: 'flex', gap: 12 }}>
                <GlassButton text="Cancel" onClick={() => setDeleteTarget(null)} />
                <GlassButton text="Delete" onClick={handleDelete} isPrimary />
              </div>
            </div>
          </GlassContainer>
        </div>
      )}
    </div>
  )
}

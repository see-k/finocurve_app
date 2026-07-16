import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Bot, Eye, Plus, Pencil, Trash2, MessageSquare } from 'lucide-react'
import GlassContainer from '../../../components/glass/GlassContainer'
import GlassButton from '../../../components/glass/GlassButton'
import GlassIconButton from '../../../components/glass/GlassIconButton'
import UserAvatar, { getInitials } from '../../../components/UserAvatar'
import { useAgents } from '../../../store/useAgents'
import { useConversations } from '../../../store/useConversations'
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

  return (
    <div className="settings-sub">
      <div className="settings-sub-bg settings-sub-bg--1" />
      <div className="settings-sub-bg settings-sub-bg--2" />
      <div className={`settings-sub-content ${visible ? 'settings-sub-content--visible' : ''}`}>
        <div className="settings-sub-header">
          <GlassIconButton icon={<ArrowLeft size={20} />} onClick={() => navigate(-1)} size={44} />
          <h1 className="settings-sub-title">AI Agents</h1>
        </div>

        <GlassContainer>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Bot size={18} /> Custom Agents
              </h3>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6 }}>
                Create AI agents with their own name, avatar, and system prompt to specialize how they respond.
              </p>
            </div>
          </div>

          <GlassButton
            text="Create Agent"
            icon={<Plus size={16} />}
            onClick={() => navigate('/settings/agents/new')}
            isPrimary
            width="auto"
          />

          <div className="agents-display-options">
            <div className="agents-display-options__heading">
              <span className="agents-display-options__icon"><Eye size={15} /></span>
              <span>
                <strong>Conversation display</strong>
                <small>Optional model details shown beside custom agents in chat</small>
              </span>
            </div>
            <div className="agents-display-options__row">
              <span>
                <strong>Show model provider</strong>
                <small>Display the resolved provider and model, including agents using the primary model.</small>
              </span>
              <button
                type="button"
                className={`settings-toggle ${showProviderInChat ? 'settings-toggle--on' : ''}`}
                role="switch"
                aria-checked={showProviderInChat}
                aria-label="Show custom agent model providers in chat"
                onClick={() => void handleShowProviderToggle()}
                disabled={!aiConfig || displaySaving}
              >
                <span className="settings-toggle__thumb" />
              </button>
            </div>
            {displayError && <p className="agents-display-options__error">{displayError}</p>}
          </div>

          {agents.length > 0 ? (
            <div className="agents-list" style={{ marginTop: 20 }}>
              {agents.map((agent) => (
                <div key={agent.id} className="agents-list__item">
                  <UserAvatar src={agent.image} initials={getInitials(agent.name)} size={44} />
                  <div className="agents-list__item-info">
                    <div className="agents-list__item-title">
                      <p className="agents-list__item-name">{agent.name}</p>
                      <span className="agents-list__provider-badge">
                        {agent.provider === 'ollama' && 'Ollama'}
                        {agent.provider === 'bedrock' && 'Bedrock'}
                        {agent.provider === 'azure' && 'Azure OpenAI'}
                        {!agent.provider && 'Primary model'}
                        {agent.model && <b>· {agent.model}</b>}
                      </span>
                    </div>
                    <p className="agents-list__item-desc">
                      {agent.description || agent.systemPrompt}
                    </p>
                  </div>
                  <div className="agents-list__item-actions">
                    <button
                      type="button"
                      className="agents-list__icon-btn"
                      onClick={() => handleChat(agent.id, agent.name)}
                      title="Chat with this agent"
                    >
                      <MessageSquare size={16} />
                    </button>
                    <button
                      type="button"
                      className="agents-list__icon-btn"
                      onClick={() => navigate(`/settings/agents/${agent.id}`)}
                      title="Edit agent"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      type="button"
                      className="agents-list__icon-btn agents-list__icon-btn--danger"
                      onClick={() => setDeleteTarget(agent.id)}
                      title="Delete agent"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 20 }}>
              No agents yet. Create your first agent to get started.
            </p>
          )}
        </GlassContainer>
      </div>

      {deleteTarget && (
        <div className="modal-overlay" onClick={() => setDeleteTarget(null)}>
          <GlassContainer className="modal-content" onClick={undefined}>
            <div onClick={(e) => e.stopPropagation()}>
              <h2 style={{ color: 'var(--status-error)', marginBottom: 8 }}>Delete Agent?</h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: 20, fontSize: 14 }}>
                This will permanently delete this agent. This cannot be undone.
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

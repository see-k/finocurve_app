import { useMemo, useState } from 'react'
import { Bot, Check } from 'lucide-react'
import GlassContainer from '../../components/glass/GlassContainer'
import GlassButton from '../../components/glass/GlassButton'
import GlassTextField from '../../components/glass/GlassTextField'
import UserAvatar, { getInitials } from '../../components/UserAvatar'
import { useAgents } from '../../store/useAgents'
import type { Conversation } from '../../types/Conversation'
import './NewConversationModal.css'

interface NewConversationModalProps {
  onClose: () => void
  onCreate: (title: string, participantAgentIds: string[]) => Conversation
  onCreated: (conversation: Conversation) => void
}

/** Modal to pick one agent (1:1 chat) or several agents + a title (group chat). */
export default function NewConversationModal({ onClose, onCreate, onCreated }: NewConversationModalProps) {
  const { agents } = useAgents()
  const [selected, setSelected] = useState<string[]>([])
  const [title, setTitle] = useState('')

  const isGroup = selected.length > 1

  const defaultTitle = useMemo(() => {
    if (selected.length === 0) return ''
    const names = agents.filter((a) => selected.includes(a.id)).map((a) => a.name)
    return names.join(', ')
  }, [selected, agents])

  const toggleAgent = (agentId: string) => {
    setSelected((prev) => (prev.includes(agentId) ? prev.filter((id) => id !== agentId) : [...prev, agentId]))
  }

  const handleCreate = () => {
    if (selected.length === 0) return
    const finalTitle = (isGroup ? title.trim() : '') || defaultTitle
    const conversation = onCreate(finalTitle, selected)
    onCreated(conversation)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <GlassContainer className="modal-content new-convo-modal">
        <div onClick={(e) => e.stopPropagation()}>
          <h2 style={{ color: 'var(--text-primary)', marginBottom: 8 }}>New Chat</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 16, fontSize: 14 }}>
            Pick one agent for a 1:1 chat, or several for a group chat with optional smart routing.
          </p>

          {agents.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
              No agents yet — create one in Settings → AI Agents first.
            </p>
          ) : (
            <div className="new-convo-modal__agents">
              {agents.map((agent) => {
                const isSelected = selected.includes(agent.id)
                return (
                  <button
                    key={agent.id}
                    type="button"
                    className={`new-convo-modal__agent ${isSelected ? 'new-convo-modal__agent--selected' : ''}`}
                    onClick={() => toggleAgent(agent.id)}
                  >
                    <UserAvatar src={agent.image} initials={getInitials(agent.name)} size={36} />
                    <span className="new-convo-modal__agent-name">{agent.name}</span>
                    {isSelected && <Check size={16} className="new-convo-modal__agent-check" />}
                  </button>
                )
              })}
            </div>
          )}

          {isGroup && (
            <div style={{ marginTop: 16 }}>
              <GlassTextField
                value={title}
                onChange={setTitle}
                placeholder={defaultTitle || 'Group chat name'}
                prefixIcon={<Bot size={16} />}
              />
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
            <GlassButton text="Cancel" onClick={onClose} />
            <GlassButton
              text={isGroup ? 'Create Group Chat' : 'Start Chat'}
              onClick={handleCreate}
              isPrimary
              disabled={selected.length === 0}
            />
          </div>
        </div>
      </GlassContainer>
    </div>
  )
}

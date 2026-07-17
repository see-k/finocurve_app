import { type RefObject } from 'react'
import {
  Bot,
  Check,
  ChevronRight,
  Menu,
  Settings2,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react'
import UserAvatar, { getInitials } from '../../../components/UserAvatar'
import { isAgentActive, type Agent } from '../../../types/Agent'

interface ChatHeaderProps {
  title: string
  participants: Agent[]
  userName: string
  profilePicturePath?: string
  agents: Agent[]
  showChatSettings: boolean
  chatSettingsRef: RefObject<HTMLDivElement | null>
  onToggleSettings: () => void
  draftTitle: string
  onDraftTitleChange: (value: string) => void
  availableDraftParticipantIds: string[]
  onToggleParticipant: (id: string) => void
  onSaveSettings: () => void
  participantDraftChanged: boolean
  titleDraftChanged: boolean
  loading: boolean
  smartRoutingEnabled: boolean
  onToggleSmartRouting: () => void
  onNavigate: (path: string) => void
  onEditAgent: (agentId: string) => void
  onRequestDeleteSelected: () => void
}

export default function ChatHeader({
  title,
  participants,
  userName,
  profilePicturePath,
  agents,
  showChatSettings,
  chatSettingsRef,
  onToggleSettings,
  draftTitle,
  onDraftTitleChange,
  availableDraftParticipantIds,
  onToggleParticipant,
  onSaveSettings,
  participantDraftChanged,
  titleDraftChanged,
  loading,
  smartRoutingEnabled,
  onToggleSmartRouting,
  onNavigate,
  onEditAgent,
  onRequestDeleteSelected,
}: ChatHeaderProps) {
  return (
    <header className="chats-screen__chat-header">
      <div className="chats-screen__participant-stack">
        <UserAvatar
          src={profilePicturePath}
          initials={getInitials(userName)}
          size={38}
          className="chats-screen__stacked-avatar chats-screen__stacked-avatar--user"
        />
        {participants.slice(0, 3).map((participant, index) => (
          <button
            key={participant.id}
            type="button"
            className="chats-screen__expert-link chats-screen__expert-link--stacked"
            onClick={() => onEditAgent(participant.id)}
            aria-label={`Edit ${participant.name}`}
            title={`Edit ${participant.name}`}
          >
            <UserAvatar
              src={participant.image}
              initials={getInitials(participant.name)}
              size={38}
              className={`chats-screen__stacked-avatar chats-screen__stacked-avatar--${index}`}
            />
          </button>
        ))}
        {participants.length === 0 && (
          <span className="chats-screen__group-avatar"><Sparkles size={17} /></span>
        )}
      </div>
      <div className="chats-screen__chat-heading">
        <h2>{title}</h2>
        <p>
          <span className="chats-screen__status-dot" />
          {participants.length === 0
            ? 'No active experts in this conversation'
            : participants.length > 1
            ? `You + ${participants.length} private AI advisors`
            : `You + ${participants[0]?.name || 'private AI advisor'}`}
        </p>
      </div>
      <div className="chats-screen__header-actions">
        <div className="chats-screen__header-mark" aria-hidden="true">
          <Sparkles size={15} />
          <span>Curated intelligence</span>
        </div>
        <div className="chats-screen__chat-settings" ref={chatSettingsRef}>
          <button
            type="button"
            className={`chats-screen__chat-settings-trigger ${showChatSettings ? 'chats-screen__chat-settings-trigger--active' : ''}`}
            onClick={onToggleSettings}
            aria-label="Chat settings"
            aria-haspopup="dialog"
            aria-expanded={showChatSettings}
            aria-controls="chat-settings-popover"
            title="Chat settings"
          >
            <Menu size={18} />
          </button>

          {showChatSettings && (
            <div
              id="chat-settings-popover"
              className="chats-screen__chat-settings-popover"
              role="dialog"
              aria-label="Chat settings"
            >
              <div className="chats-screen__chat-settings-heading">
                <span>
                  <strong>Chat settings</strong>
                  <small>Manage this conversation</small>
                </span>
                <span className="chats-screen__chat-settings-count">
                  <Users size={12} /> {participants.length}
                </span>
              </div>

              <label className="chats-screen__chat-title-field">
                <span>Conversation name</span>
                <input
                  type="text"
                  value={draftTitle}
                  onChange={(event) => onDraftTitleChange(event.target.value)}
                  disabled={loading}
                  maxLength={80}
                />
              </label>

              <section className="chats-screen__chat-settings-section" aria-labelledby="chat-participants-heading">
                <div className="chats-screen__chat-settings-section-heading">
                  <span>
                    <strong id="chat-participants-heading">Participants</strong>
                    <small>Add or remove AI advisors</small>
                  </span>
                  <small>{availableDraftParticipantIds.length} selected</small>
                </div>

                {agents.length > 0 ? (
                  <div className="chats-screen__participant-picker">
                    {agents.map((agent) => {
                      const isSelected = availableDraftParticipantIds.includes(agent.id)
                      const isActive = isAgentActive(agent)
                      return (
                        <button
                          key={agent.id}
                          type="button"
                          className={`${isSelected ? 'chats-screen__participant-option--selected' : ''} ${isActive ? '' : 'chats-screen__participant-option--inactive'}`}
                          onClick={() => onToggleParticipant(agent.id)}
                          disabled={loading || (!isActive && !isSelected)}
                          aria-pressed={isSelected}
                        >
                          <UserAvatar src={agent.image} initials={getInitials(agent.name)} size={30} />
                          <span>
                            <strong>{agent.name}</strong>
                            <small>{isActive ? agent.description || 'Private AI advisor' : 'Inactive expert'}</small>
                          </span>
                          <i aria-hidden="true">{isSelected && <Check size={12} />}</i>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <p className="chats-screen__no-agents">Create an AI agent before changing participants.</p>
                )}

                {availableDraftParticipantIds.length === 0 && (
                  <p className="chats-screen__participant-error">A chat needs at least one agent.</p>
                )}

                <button
                  type="button"
                  className="chats-screen__save-chat-settings"
                  onClick={onSaveSettings}
                  disabled={
                    loading ||
                    availableDraftParticipantIds.length === 0 ||
                    (!participantDraftChanged && !titleDraftChanged)
                  }
                >
                  Save changes
                </button>
              </section>

              {participants.length > 1 && (
                <section className="chats-screen__chat-settings-section">
                  <div className="chats-screen__routing-setting">
                    <span>
                      <strong><Sparkles size={13} /> Smart routing</strong>
                      <small>Choose the best advisors for each prompt</small>
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-label="Smart routing"
                      aria-checked={smartRoutingEnabled}
                      className={`chats-screen__settings-switch ${smartRoutingEnabled ? 'chats-screen__settings-switch--active' : ''}`}
                      onClick={onToggleSmartRouting}
                      disabled={loading}
                      title="@mentions still take priority over smart routing."
                    >
                      <i aria-hidden="true" />
                    </button>
                  </div>
                </section>
              )}

              <div className="chats-screen__chat-settings-links">
                <button type="button" onClick={() => onNavigate('/main?tab=experts')}>
                  <Bot size={14} />
                  <span><strong>Manage AI experts</strong><small>Create or edit expert profiles</small></span>
                  <ChevronRight size={14} />
                </button>
                {participants.length > 1 && (
                  <button type="button" onClick={() => onNavigate('/settings/ai-config/router')}>
                    <Settings2 size={14} />
                    <span><strong>Router configuration</strong><small>Model and routing preferences</small></span>
                    <ChevronRight size={14} />
                  </button>
                )}
              </div>

              <button
                type="button"
                className="chats-screen__chat-settings-delete"
                onClick={onRequestDeleteSelected}
              >
                <Trash2 size={14} /> Delete conversation
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

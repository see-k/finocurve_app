import { MessagesSquare, Plus, Search, Trash2, Users } from 'lucide-react'
import UserAvatar, { getInitials } from '../../../components/UserAvatar'
import type { Agent } from '../../../types/Agent'
import type { Conversation } from '../../../types/Conversation'
import { formatConversationTime } from './chatUtils'

interface ConversationSidebarProps {
  conversations: Conversation[]
  visibleConversations: Conversation[]
  selectedId?: string
  agentById: Map<string, Agent>
  conversationQuery: string
  onQueryChange: (value: string) => void
  conversationTitle: (conversation: Conversation) => string
  onSelect: (id: string) => void
  onNew: () => void
  onRequestDelete: (conversation: Conversation) => void
}

export default function ConversationSidebar({
  conversations,
  visibleConversations,
  selectedId,
  agentById,
  conversationQuery,
  onQueryChange,
  conversationTitle,
  onSelect,
  onNew,
  onRequestDelete,
}: ConversationSidebarProps) {
  return (
    <aside className="chats-screen__sidebar" aria-label="Conversations">
      <div className="chats-screen__sidebar-header">
        <div>
          <span className="chats-screen__eyebrow">FinoCurve AI</span>
          <h1 className="chats-screen__sidebar-title">Conversations</h1>
        </div>
        <button
          type="button"
          className="chats-screen__new-button"
          onClick={onNew}
          aria-label="Start a new chat"
          title="New chat"
        >
          <Plus size={18} />
        </button>
      </div>

      <label className="chats-screen__search">
        <Search size={15} aria-hidden="true" />
        <input
          type="search"
          value={conversationQuery}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search conversations"
        />
      </label>

      <div className="chats-screen__conversation-list">
        {conversations.length === 0 ? (
          <div className="chats-screen__empty-list">
            <MessagesSquare size={22} />
            <p>Your conversations will live here.</p>
            <button type="button" onClick={onNew}>Start a chat</button>
          </div>
        ) : visibleConversations.length === 0 ? (
          <p className="chats-screen__no-results">No conversations match “{conversationQuery}”.</p>
        ) : (
          visibleConversations.map((conversation) => {
            const participant = agentById.get(conversation.participantAgentIds[0])
            const isGroup = conversation.participantAgentIds.length > 1
            const lastMessage = conversation.messages[conversation.messages.length - 1]

            return (
              <div
                key={conversation.id}
                className={`chats-screen__conversation-row ${selectedId === conversation.id ? 'chats-screen__conversation-row--active' : ''}`}
              >
                <button
                  type="button"
                  className={`chats-screen__conversation ${selectedId === conversation.id ? 'chats-screen__conversation--active' : ''}`}
                  onClick={() => onSelect(conversation.id)}
                  aria-current={selectedId === conversation.id ? 'page' : undefined}
                >
                  <span className="chats-screen__conversation-avatar">
                    {isGroup ? (
                      <span className="chats-screen__group-avatar"><Users size={17} /></span>
                    ) : (
                      <UserAvatar src={participant?.image} initials={getInitials(participant?.name)} size={40} />
                    )}
                  </span>
                  <span className="chats-screen__conversation-copy">
                    <span className="chats-screen__conversation-heading">
                      <strong>{conversationTitle(conversation)}</strong>
                      <time dateTime={conversation.updatedAt}>{formatConversationTime(conversation.updatedAt)}</time>
                    </span>
                    <span className="chats-screen__conversation-preview">
                      {lastMessage ? `${lastMessage.senderName}: ${lastMessage.content}` : 'A new conversation'}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className="chats-screen__conversation-delete"
                  onClick={() => onRequestDelete(conversation)}
                  aria-label={`Delete ${conversationTitle(conversation)}`}
                  title="Delete conversation"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )
          })
        )}
      </div>

      <div className="chats-screen__sidebar-footer">
        <span>{conversations.length} {conversations.length === 1 ? 'conversation' : 'conversations'}</span>
        <span className="chats-screen__private-label">Private workspace</span>
      </div>
    </aside>
  )
}

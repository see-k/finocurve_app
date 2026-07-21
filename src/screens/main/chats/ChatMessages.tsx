import { Fragment, type ReactNode, type RefObject } from 'react'
import { Sparkles, Trash2 } from 'lucide-react'
import UserAvatar, { getInitials } from '../../../components/UserAvatar'
import ChatMessageContent from '../../../components/ai/ChatMessageContent'
import type { Agent } from '../../../types/Agent'
import type { Conversation } from '../../../types/Conversation'
import type { RouterPresentation, SmartRoutingStatus } from './chatUtils'

const STARTERS = ['Review my portfolio', 'Where is my biggest risk?', 'Summarize my financial position']

interface ChatMessagesProps {
  conversation: Conversation
  streamingAgentId: string | null
  streamingText: string
  streamingReasoning: string
  streamingTools: { name: string; status: 'running' | 'success' | 'error' }[]
  verboseStreaming: boolean
  smartRoutingStatus: SmartRoutingStatus | null
  routerPresentation: RouterPresentation
  agentById: Map<string, Agent>
  userName: string
  profilePicturePath?: string
  latestUserMessageIndex: number
  mentionNames: string[]
  loading: boolean
  onFollowUp: (prompt: string) => void
  onDeleteMessage: (index: number) => void
  onEditAgent: (agentId: string) => void
  renderAgentProvider: (agentId?: string) => ReactNode
  messagesEndRef: RefObject<HTMLDivElement | null>
}

export default function ChatMessages({
  conversation,
  streamingAgentId,
  streamingText,
  streamingReasoning,
  streamingTools,
  verboseStreaming,
  smartRoutingStatus,
  routerPresentation,
  agentById,
  userName,
  profilePicturePath,
  latestUserMessageIndex,
  mentionNames,
  loading,
  onFollowUp,
  onDeleteMessage,
  onEditAgent,
  renderAgentProvider,
  messagesEndRef,
}: ChatMessagesProps) {
  return (
    <div className="chats-screen__messages" role="log" aria-live="polite" aria-busy={loading}>
      <div className="chats-screen__messages-inner">
        {conversation.messages.length === 0 && !streamingAgentId && !smartRoutingStatus ? (
          <div className="chats-screen__welcome">
            <span className="chats-screen__welcome-icon"><Sparkles size={22} /></span>
            <span className="chats-screen__eyebrow">Private advisory</span>
            <h2>What would you like to understand?</h2>
            <p>
              Ask for analysis, a second opinion, or a clear next step. Your advisors can use the financial context already in FinoCurve.
            </p>
            <div className="chats-screen__starters" aria-label="Conversation starters">
              {STARTERS.map((prompt) => (
                <button key={prompt} type="button" onClick={() => onFollowUp(prompt)}>{prompt}</button>
              ))}
            </div>
          </div>
        ) : (
          conversation.messages.map((message, index) => (
            <Fragment key={`${index}-${message.senderName}`}>
              <article className={`chats-screen__message chats-screen__message--${message.role}`}>
                {message.role === 'assistant' && (
                  <button
                    type="button"
                    className="chats-screen__expert-link chats-screen__expert-link--avatar"
                    onClick={() => message.senderAgentId && onEditAgent(message.senderAgentId)}
                    disabled={!message.senderAgentId}
                    aria-label={`Edit ${message.senderName}`}
                    title={`Edit ${message.senderName}`}
                  >
                    <UserAvatar
                      src={message.senderAvatar}
                      initials={getInitials(message.senderName)}
                      size={32}
                      className="chats-screen__message-avatar"
                    />
                  </button>
                )}
                <div className="chats-screen__message-column">
                  <div className="chats-screen__message-meta">
                    {message.role === 'assistant' && message.senderAgentId ? (
                      <button
                        type="button"
                        className="chats-screen__expert-link chats-screen__expert-link--name"
                        onClick={() => onEditAgent(message.senderAgentId!)}
                        title={`Edit ${message.senderName}`}
                      >
                        {message.senderName}
                      </button>
                    ) : (
                      <span>{message.role === 'user' ? userName : message.senderName}</span>
                    )}
                    {message.role === 'assistant' && <span className="chats-screen__advisor-tag">Advisor</span>}
                    {message.role === 'assistant' && renderAgentProvider(message.senderAgentId)}
                    {message.role === 'user' && <span className="chats-screen__user-tag">You</span>}
                    <button
                      type="button"
                      className="chats-screen__message-delete"
                      onClick={() => onDeleteMessage(index)}
                      disabled={loading}
                      aria-label="Delete message"
                      title="Delete message"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <div className="chats-screen__message-bubble">
                    <ChatMessageContent
                      role={message.role}
                      content={message.content}
                      attachments={message.attachments}
                      reasoning={message.reasoning}
                      followUps={message.followUps}
                      mentionNames={mentionNames}
                      disabled={loading}
                      onFollowUpClick={onFollowUp}
                    />
                  </div>
                </div>
                {message.role === 'user' && (
                  <UserAvatar
                    src={message.senderAvatar || profilePicturePath}
                    initials={getInitials(userName)}
                    size={32}
                    className="chats-screen__message-avatar chats-screen__message-avatar--user"
                  />
                )}
              </article>
              {message.role === 'user' &&
                index === latestUserMessageIndex &&
                smartRoutingStatus?.conversationId === conversation.id && (
                  <div
                    className={`chats-screen__routing-status ${routerPresentation.verbose && smartRoutingStatus.rationale ? 'chats-screen__routing-status--verbose' : ''}`}
                    role="status"
                    aria-live="polite"
                  >
                    <span className="chats-screen__routing-status-icon"><Sparkles size={13} /></span>
                    <span className="chats-screen__routing-status-copy">
                      <span className="chats-screen__routing-status-heading">
                        <strong>
                          {smartRoutingStatus.phase === 'selecting' ? 'Smart routing' : 'Response priority'}
                        </strong>
                        {routerPresentation.showProvider && routerPresentation.providerLabel && (
                          <span
                            className="chats-screen__routing-provider"
                            title={`${routerPresentation.providerLabel} · ${routerPresentation.model}`}
                          >
                            <b>{routerPresentation.providerLabel}</b>
                            <em>{routerPresentation.model}</em>
                          </span>
                        )}
                      </span>
                      <small>
                        {smartRoutingStatus.phase === 'selecting'
                          ? 'Matching this prompt to the right advisors'
                          : smartRoutingStatus.agentIds
                              .map((agentId) => agentById.get(agentId)?.name)
                              .filter(Boolean)
                              .join(' → ')}
                      </small>
                      {routerPresentation.verbose &&
                        smartRoutingStatus.phase === 'selected' &&
                        smartRoutingStatus.rationale && (
                          <span className="chats-screen__routing-verbose">
                            {smartRoutingStatus.rationale}
                          </span>
                        )}
                    </span>
                    {smartRoutingStatus.phase === 'selecting' && (
                      <span className="chats-screen__routing-pulse" aria-hidden="true"><i /><i /><i /></span>
                    )}
                  </div>
                )}
            </Fragment>
          ))
        )}

        {streamingAgentId && (
          <article className="chats-screen__message chats-screen__message--assistant chats-screen__message--streaming">
            <button
              type="button"
              className="chats-screen__expert-link chats-screen__expert-link--avatar"
              onClick={() => onEditAgent(streamingAgentId)}
              aria-label={`Edit ${agentById.get(streamingAgentId)?.name || 'expert'}`}
              title={`Edit ${agentById.get(streamingAgentId)?.name || 'expert'}`}
            >
              <UserAvatar
                src={agentById.get(streamingAgentId)?.image}
                initials={getInitials(agentById.get(streamingAgentId)?.name)}
                size={32}
                className="chats-screen__message-avatar"
              />
            </button>
            <div className="chats-screen__message-column">
              <div className="chats-screen__message-meta">
                <button
                  type="button"
                  className="chats-screen__expert-link chats-screen__expert-link--name"
                  onClick={() => onEditAgent(streamingAgentId)}
                  title={`Edit ${agentById.get(streamingAgentId)?.name || 'expert'}`}
                >
                  {agentById.get(streamingAgentId)?.name}
                </button>
                <span className="chats-screen__thinking-label">Thinking</span>
                {renderAgentProvider(streamingAgentId)}
              </div>
              <div className="chats-screen__message-bubble">
                {verboseStreaming && (streamingReasoning || streamingTools.length > 0) && (
                  <div className="chats-screen__live-activity" aria-label="Live model activity">
                    {streamingReasoning && (
                      <div className="chats-screen__live-reasoning">
                        <strong>Reasoning</strong>
                        <span>{streamingReasoning}</span>
                      </div>
                    )}
                    {streamingTools.map((tool, index) => (
                      <div key={`${tool.name}-${index}`} className={`chats-screen__tool-call chats-screen__tool-call--${tool.status}`}>
                        <i aria-hidden="true" />
                        <span>{tool.status === 'running' ? 'Using' : tool.status === 'success' ? 'Used' : 'Failed'} {tool.name.replace(/_/g, ' ')}</span>
                      </div>
                    ))}
                  </div>
                )}
                {streamingText ? (
                  <ChatMessageContent role="assistant" content={streamingText} />
                ) : (
                  <span className="chats-screen__typing" aria-label="Advisor is thinking">
                    <i /><i /><i />
                  </span>
                )}
              </div>
            </div>
          </article>
        )}
        <div ref={messagesEndRef} />
      </div>
    </div>
  )
}

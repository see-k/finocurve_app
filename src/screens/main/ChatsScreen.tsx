import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useSearchParams } from 'react-router-dom'
import {
  ArrowUp,
  MessagesSquare,
  Plus,
  Search,
  Sparkles,
  Square,
  Trash2,
  Users,
} from 'lucide-react'
import UserAvatar, { getInitials } from '../../components/UserAvatar'
import ChatMessageContent, { renderTextWithMentions } from '../../components/ai/ChatMessageContent'
import { usePortfolio } from '../../store/usePortfolio'
import { usePreferences } from '../../store/usePreferences'
import { useAgents } from '../../store/useAgents'
import { useConversations } from '../../store/useConversations'
import { runGroupTurn, type SmartRoutingUpdate } from '../../ai/GroupChatOrchestrator'
import type { Agent } from '../../types/Agent'
import type { Conversation, ConversationMessage } from '../../types/Conversation'
import NewConversationModal from './NewConversationModal'
import './ChatsScreen.css'

function formatConversationTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const today = new Date()
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const daysAgo = Math.round((startOfToday.getTime() - startOfDate.getTime()) / 86_400_000)

  if (daysAgo === 0) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }
  if (daysAgo === 1) return 'Yesterday'
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

interface MentionDraft {
  start: number
  end: number
  query: string
}

interface SmartRoutingStatus extends SmartRoutingUpdate {
  conversationId: string
}

function findMentionDraft(value: string, caret: number): MentionDraft | null {
  const beforeCaret = value.slice(0, caret)
  const match = /(^|\s)@([^\s@]*)$/.exec(beforeCaret)
  if (!match) return null
  return {
    start: beforeCaret.length - match[2].length - 1,
    end: caret,
    query: match[2],
  }
}

function escapeMentionPattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function containsMention(value: string, name: string): boolean {
  return new RegExp(
    `(^|\\s)@${escapeMentionPattern(name)}(?=$|[\\s,.;:!?])`,
    'i',
  ).test(value)
}

export default function ChatsScreen() {
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const { agents } = useAgents()
  const {
    conversations,
    createConversation,
    appendMessage,
    setSmartRouting,
    deleteConversation,
  } = useConversations()
  const { portfolio, totalValue, totalGainLossPercent } = usePortfolio()
  const { prefs } = usePreferences()

  const [showNewModal, setShowNewModal] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Conversation | null>(null)
  const [conversationQuery, setConversationQuery] = useState('')
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [streamingAgentId, setStreamingAgentId] = useState<string | null>(null)
  const [streamingText, setStreamingText] = useState('')
  const [smartRoutingStatus, setSmartRoutingStatus] = useState<SmartRoutingStatus | null>(null)
  const [mentionDraft, setMentionDraft] = useState<MentionDraft | null>(null)
  const [activeMentionIndex, setActiveMentionIndex] = useState(0)
  const streamingAgentIdRef = useRef<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const stoppedRef = useRef(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const composerHighlightRef = useRef<HTMLDivElement>(null)
  const pendingCaretRef = useRef<number | null>(null)

  const selectedId = searchParams.get('conversationId')
  const selected = useMemo(
    () => conversations.find((c) => c.id === selectedId) ?? conversations[0],
    [conversations, selectedId],
  )

  useEffect(() => {
    if (selected && searchParams.get('conversationId') !== selected.id) {
      setSearchParams({ tab: 'chats', conversationId: selected.id }, { replace: true })
    }
  }, [selected, searchParams, setSearchParams])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end' })
  }, [selected?.id, selected?.messages.length, streamingText, smartRoutingStatus?.phase])

  useEffect(() => {
    const textarea = composerRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 128)}px`
  }, [input])

  useLayoutEffect(() => {
    const requestedCaret = pendingCaretRef.current
    const textarea = composerRef.current
    if (requestedCaret === null || !textarea) return

    pendingCaretRef.current = null
    const caret = Math.min(requestedCaret, textarea.value.length)
    textarea.focus({ preventScroll: true })
    textarea.setSelectionRange(caret, caret)
  }, [input])

  useEffect(() => {
    if (!deleteTarget) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDeleteTarget(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [deleteTarget])

  const selectConversation = (id: string) => {
    setSearchParams({ tab: 'chats', conversationId: id }, { replace: true })
  }

  const agentById = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents])
  const userName = prefs.userName || prefs.userEmail?.split('@')[0] || 'You'

  const conversationTitle = (conversation: Conversation) =>
    conversation.title ||
    conversation.participantAgentIds
      .map((id) => agentById.get(id)?.name)
      .filter(Boolean)
      .join(', ') ||
    'Chat'

  const visibleConversations = conversations.filter((conversation) => {
    const query = conversationQuery.trim().toLocaleLowerCase()
    if (!query) return true
    const lastMessage = conversation.messages[conversation.messages.length - 1]
    return `${conversationTitle(conversation)} ${lastMessage?.content ?? ''}`
      .toLocaleLowerCase()
      .includes(query)
  })

  const selectedParticipants: Agent[] = selected
    ? selected.participantAgentIds
        .map((id) => agentById.get(id))
        .filter((agent): agent is Agent => !!agent)
    : []
  const latestUserMessageIndex = selected
    ? selected.messages.reduce(
        (latestIndex, message, index) => message.role === 'user' ? index : latestIndex,
        -1,
      )
    : -1

  const firstNameCounts = new Map<string, number>()
  selectedParticipants.forEach((participant) => {
    const firstName = participant.name.trim().split(/\s+/)[0].toLocaleLowerCase()
    firstNameCounts.set(firstName, (firstNameCounts.get(firstName) ?? 0) + 1)
  })
  const mentionNames = [
    ...selectedParticipants.map((participant) => participant.name),
    ...selectedParticipants
      .map((participant) => participant.name.trim().split(/\s+/)[0])
      .filter((firstName) => firstNameCounts.get(firstName.toLocaleLowerCase()) === 1),
    'everyone',
    'all',
  ]
  const mentionSuggestions = mentionDraft
    ? [
        ...selectedParticipants.map((participant) => ({
          id: participant.id,
          name: participant.name,
          image: participant.image,
          description: participant.description || 'Private AI advisor',
          everyone: false,
        })),
        {
          id: 'everyone',
          name: 'everyone',
          image: undefined,
          description: 'Invite every advisor in a fresh order',
          everyone: true,
        },
      ].filter((option) => {
        const query = mentionDraft.query.toLocaleLowerCase()
        return !query || option.name.toLocaleLowerCase().includes(query)
      })
    : []

  const portfolioSummary = portfolio && totalValue > 0
    ? `Portfolio: ${portfolio.name || 'Portfolio'}, ~$${totalValue.toLocaleString()}`
    : undefined
  const portfolioContext = portfolio && totalValue >= 0
    ? {
        portfolioName: portfolio.name || 'Portfolio',
        totalValue,
        totalGainLossPercent: totalGainLossPercent ?? 0,
        assetCount: portfolio.assets?.length ?? 0,
      }
    : undefined
  const baseContext = { currentRoute: location.pathname, portfolioSummary, portfolioContext }

  const handleStop = () => {
    stoppedRef.current = true
    setSmartRoutingStatus(null)
    abortRef.current?.abort()
    void window.electronAPI?.aiChatCancel?.()
  }

  const handleSend = async () => {
    if (!selected || !input.trim() || loading) return
    const text = input.trim()
    setInput('')
    setMentionDraft(null)
    setSmartRoutingStatus(null)
    setLoading(true)
    stoppedRef.current = false
    const controller = new AbortController()
    abortRef.current = controller

    const userMessage: ConversationMessage = {
      role: 'user',
      content: text,
      senderName: userName,
      senderAvatar: prefs.profilePicturePath ?? undefined,
    }
    appendMessage(selected.id, userMessage)

    try {
      if (selected.participantAgentIds.length === 1) {
        const agent = agentById.get(selected.participantAgentIds[0])
        if (!agent || !window.electronAPI?.aiChatStream) return
        streamingAgentIdRef.current = agent.id
        setStreamingAgentId(agent.id)
        setStreamingText('')

        const unsubscribe = window.electronAPI.onAiChatChunk?.((chunk) => {
          if (chunk.type === 'answer') setStreamingText((previous) => previous + chunk.content)
        })

        try {
          const chatMessages = [...selected.messages, userMessage].map((message) => ({
            role: message.role,
            content: message.content,
          }))
          const { text: reply, reasoning, followUps, aborted } = await window.electronAPI.aiChatStream({
            messages: chatMessages,
            context: { ...baseContext, agentPersona: { name: agent.name, systemPrompt: agent.systemPrompt } },
          })

          if (!aborted && !stoppedRef.current) {
            appendMessage(selected.id, {
              role: 'assistant',
              content: reply || 'No response.',
              senderAgentId: agent.id,
              senderName: agent.name,
              senderAvatar: agent.image,
              reasoning,
              followUps,
            })
          }
        } finally {
          unsubscribe?.()
        }
      } else {
        const participants = selected.participantAgentIds
          .map((id) => agentById.get(id))
          .filter(Boolean) as typeof agents

        for await (const result of runGroupTurn(selected, participants, userMessage, {
          signal: controller.signal,
          baseContext,
          smartRouting: selected.smartRoutingEnabled === true,
          onSmartRoutingUpdate: (update) => {
            setSmartRoutingStatus({ ...update, conversationId: selected.id })
          },
          onChunk: (chunk) => {
            if (chunk.type !== 'answer') return
            if (streamingAgentIdRef.current === chunk.agentId) {
              setStreamingText((previous) => previous + chunk.content)
            } else {
              streamingAgentIdRef.current = chunk.agentId
              setStreamingAgentId(chunk.agentId)
              setStreamingText(chunk.content)
            }
          },
        })) {
          if (stoppedRef.current) break
          appendMessage(selected.id, {
            role: 'assistant',
            content: result.text,
            senderAgentId: result.agentId,
            senderName: result.agentName,
            senderAvatar: agentById.get(result.agentId)?.image,
            reasoning: result.reasoning,
            followUps: result.followUps,
          })
          streamingAgentIdRef.current = null
          setStreamingAgentId(null)
          setStreamingText('')
        }
      }
    } finally {
      streamingAgentIdRef.current = null
      setStreamingAgentId(null)
      setStreamingText('')
      setSmartRoutingStatus(null)
      setLoading(false)
      abortRef.current = null
    }
  }

  const handleFollowUp = (prompt: string) => {
    setInput(prompt)
    setMentionDraft(null)
    requestAnimationFrame(() => composerRef.current?.focus())
  }

  const selectMention = (name: string) => {
    const mention = `@${name}`
    const textarea = composerRef.current
    const currentInput = textarea?.value ?? input
    const currentCaret = textarea?.selectionStart ?? currentInput.length
    const currentMentionDraft = textarea
      ? findMentionDraft(currentInput, currentCaret)
      : mentionDraft
    let nextInput: string
    let nextCaret: number

    if (currentMentionDraft) {
      nextInput = `${currentInput.slice(0, currentMentionDraft.start)}${mention} ${currentInput.slice(currentMentionDraft.end)}`
      nextCaret = currentMentionDraft.start + mention.length + 1
    } else {
      if (containsMention(currentInput, name)) {
        requestAnimationFrame(() => composerRef.current?.focus())
        return
      }
      const withoutTrailingSpace = currentInput.trimEnd()
      nextInput = `${withoutTrailingSpace}${withoutTrailingSpace ? ' ' : ''}${mention} `
      nextCaret = nextInput.length
    }

    pendingCaretRef.current = nextCaret
    setInput(nextInput)
    setMentionDraft(null)
    setActiveMentionIndex(0)
  }

  const updateMentionDraft = (value: string, caret: number) => {
    setMentionDraft(findMentionDraft(value, caret))
    setActiveMentionIndex(0)
  }

  const handleDeleteConversation = () => {
    if (!deleteTarget) return

    if (deleteTarget.id === selected?.id) {
      if (loading) handleStop()
      const nextConversation = conversations.find((conversation) => conversation.id !== deleteTarget.id)
      setSearchParams(
        nextConversation
          ? { tab: 'chats', conversationId: nextConversation.id }
          : { tab: 'chats' },
        { replace: true },
      )
    }

    deleteConversation(deleteTarget.id)
    setDeleteTarget(null)
  }

  return (
    <div className="chats-screen">
      <aside className="chats-screen__sidebar" aria-label="Conversations">
        <div className="chats-screen__sidebar-header">
          <div>
            <span className="chats-screen__eyebrow">FinoCurve AI</span>
            <h1 className="chats-screen__sidebar-title">Conversations</h1>
          </div>
          <button
            type="button"
            className="chats-screen__new-button"
            onClick={() => setShowNewModal(true)}
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
            onChange={(event) => setConversationQuery(event.target.value)}
            placeholder="Search conversations"
          />
        </label>

        <div className="chats-screen__conversation-list">
          {conversations.length === 0 ? (
            <div className="chats-screen__empty-list">
              <MessagesSquare size={22} />
              <p>Your conversations will live here.</p>
              <button type="button" onClick={() => setShowNewModal(true)}>Start a chat</button>
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
                  className={`chats-screen__conversation-row ${selected?.id === conversation.id ? 'chats-screen__conversation-row--active' : ''}`}
                >
                  <button
                    type="button"
                    className={`chats-screen__conversation ${selected?.id === conversation.id ? 'chats-screen__conversation--active' : ''}`}
                    onClick={() => selectConversation(conversation.id)}
                    aria-current={selected?.id === conversation.id ? 'page' : undefined}
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
                    onClick={() => setDeleteTarget(conversation)}
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

      {selected ? (
        <section className="chats-screen__conversation-pane" aria-label={conversationTitle(selected)}>
          <header className="chats-screen__chat-header">
            <div className="chats-screen__participant-stack" aria-hidden="true">
              <UserAvatar
                src={prefs.profilePicturePath}
                initials={getInitials(userName)}
                size={38}
                className="chats-screen__stacked-avatar chats-screen__stacked-avatar--user"
              />
              {selectedParticipants.slice(0, 3).map((participant, index) => (
                <UserAvatar
                  key={participant!.id}
                  src={participant!.image}
                  initials={getInitials(participant!.name)}
                  size={38}
                  className={`chats-screen__stacked-avatar chats-screen__stacked-avatar--${index}`}
                />
              ))}
              {selectedParticipants.length === 0 && (
                <span className="chats-screen__group-avatar"><Sparkles size={17} /></span>
              )}
            </div>
            <div className="chats-screen__chat-heading">
              <h2>{conversationTitle(selected)}</h2>
              <p>
                <span className="chats-screen__status-dot" />
                {selectedParticipants.length > 1
                  ? `You + ${selectedParticipants.length} private AI advisors`
                  : `You + ${selectedParticipants[0]?.name || 'private AI advisor'}`}
              </p>
            </div>
            <div className="chats-screen__header-actions">
              {selectedParticipants.length > 1 && (
                <button
                  type="button"
                  role="switch"
                  aria-checked={selected.smartRoutingEnabled === true}
                  className={`chats-screen__smart-routing-toggle ${selected.smartRoutingEnabled ? 'chats-screen__smart-routing-toggle--active' : ''}`}
                  onClick={() => setSmartRouting(selected.id, !selected.smartRoutingEnabled)}
                  disabled={loading}
                  title="Use a private routing pass to choose who responds and in what order. @mentions still take priority."
                >
                  <Sparkles size={13} />
                  <span>Smart routing</span>
                  <i aria-hidden="true"><b /></i>
                </button>
              )}
              <div className="chats-screen__header-mark" aria-hidden="true">
                <Sparkles size={15} />
                <span>Curated intelligence</span>
              </div>
              <button
                type="button"
                className="chats-screen__header-delete"
                onClick={() => setDeleteTarget(selected)}
                aria-label={`Delete ${conversationTitle(selected)}`}
                title="Delete conversation"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </header>

          <div className="chats-screen__messages" role="log" aria-live="polite" aria-busy={loading}>
            <div className="chats-screen__messages-inner">
              {selected.messages.length === 0 && !streamingAgentId && !smartRoutingStatus ? (
                <div className="chats-screen__welcome">
                  <span className="chats-screen__welcome-icon"><Sparkles size={22} /></span>
                  <span className="chats-screen__eyebrow">Private advisory</span>
                  <h2>What would you like to understand?</h2>
                  <p>
                    Ask for analysis, a second opinion, or a clear next step. Your advisors can use the financial context already in FinoCurve.
                  </p>
                  <div className="chats-screen__starters" aria-label="Conversation starters">
                    {['Review my portfolio', 'Where is my biggest risk?', 'Summarize my financial position'].map((prompt) => (
                      <button key={prompt} type="button" onClick={() => handleFollowUp(prompt)}>{prompt}</button>
                    ))}
                  </div>
                </div>
              ) : (
                selected.messages.map((message, index) => (
                  <Fragment key={`${index}-${message.senderName}`}>
                    <article className={`chats-screen__message chats-screen__message--${message.role}`}>
                      {message.role === 'assistant' && (
                        <UserAvatar
                          src={message.senderAvatar}
                          initials={getInitials(message.senderName)}
                          size={32}
                          className="chats-screen__message-avatar"
                        />
                      )}
                      <div className="chats-screen__message-column">
                        <div className="chats-screen__message-meta">
                          <span>{message.role === 'user' ? userName : message.senderName}</span>
                          {message.role === 'assistant' && <span className="chats-screen__advisor-tag">Advisor</span>}
                          {message.role === 'user' && <span className="chats-screen__user-tag">You</span>}
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
                            onFollowUpClick={handleFollowUp}
                          />
                        </div>
                      </div>
                      {message.role === 'user' && (
                        <UserAvatar
                          src={message.senderAvatar || prefs.profilePicturePath}
                          initials={getInitials(userName)}
                          size={32}
                          className="chats-screen__message-avatar chats-screen__message-avatar--user"
                        />
                      )}
                    </article>
                    {message.role === 'user' &&
                      index === latestUserMessageIndex &&
                      smartRoutingStatus?.conversationId === selected.id && (
                        <div className="chats-screen__routing-status" role="status" aria-live="polite">
                          <span className="chats-screen__routing-status-icon"><Sparkles size={13} /></span>
                          <span className="chats-screen__routing-status-copy">
                            <strong>
                              {smartRoutingStatus.phase === 'selecting' ? 'Smart routing' : 'Response priority'}
                            </strong>
                            <small>
                              {smartRoutingStatus.phase === 'selecting'
                                ? 'Matching this prompt to the right advisors'
                                : smartRoutingStatus.agentIds
                                    .map((agentId) => agentById.get(agentId)?.name)
                                    .filter(Boolean)
                                    .join(' → ')}
                            </small>
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
                  <UserAvatar
                    src={agentById.get(streamingAgentId)?.image}
                    initials={getInitials(agentById.get(streamingAgentId)?.name)}
                    size={32}
                    className="chats-screen__message-avatar"
                  />
                  <div className="chats-screen__message-column">
                    <div className="chats-screen__message-meta">
                      <span>{agentById.get(streamingAgentId)?.name}</span>
                      <span className="chats-screen__thinking-label">Thinking</span>
                    </div>
                    <div className="chats-screen__message-bubble">
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

          <footer className="chats-screen__composer-shell">
            {mentionDraft && mentionSuggestions.length > 0 && (
              <div
                className="chats-screen__mention-popover"
                role="listbox"
                id="chat-mention-suggestions"
                aria-label="Mention suggestions"
              >
                <div className="chats-screen__mention-popover-header">
                  <span>Address someone</span>
                  <small>↑↓ navigate · Enter select</small>
                </div>
                {mentionSuggestions.map((option, index) => (
                  <button
                    key={option.id}
                    id={`chat-mention-option-${option.id}`}
                    type="button"
                    role="option"
                    aria-selected={index === activeMentionIndex}
                    className={index === activeMentionIndex ? 'chats-screen__mention-option--active' : ''}
                    onMouseEnter={() => setActiveMentionIndex(index)}
                    onMouseDown={(event) => {
                      event.preventDefault()
                      selectMention(option.name)
                    }}
                  >
                    {option.everyone ? (
                      <span className="chats-screen__mention-everyone"><Users size={15} /></span>
                    ) : (
                      <UserAvatar src={option.image} initials={getInitials(option.name)} size={30} />
                    )}
                    <span className="chats-screen__mention-option-copy">
                      <strong>@{option.name}</strong>
                      <small>{option.description}</small>
                    </span>
                    <span className="chats-screen__mention-route">
                      {option.everyone ? 'Group' : 'Direct'}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {selectedParticipants.length > 1 && (
              <div className="chats-screen__mentions" aria-label="Address an advisor">
                <span>To</span>
                {selectedParticipants.map((participant) => (
                  <button
                    key={participant.id}
                    type="button"
                    className={
                      containsMention(input, participant.name) ||
                      (firstNameCounts.get(participant.name.trim().split(/\s+/)[0].toLocaleLowerCase()) === 1 &&
                        containsMention(input, participant.name.trim().split(/\s+/)[0]))
                        ? 'chats-screen__mention-chip--active'
                        : ''
                    }
                    onClick={() => selectMention(participant.name)}
                    disabled={loading}
                    title={`Only ${participant.name} will respond`}
                  >
                    @{participant.name}
                  </button>
                ))}
                <button
                  type="button"
                  className={containsMention(input, 'everyone') || containsMention(input, 'all')
                    ? 'chats-screen__mention-chip--active'
                    : ''}
                  onClick={() => selectMention('everyone')}
                  disabled={loading}
                  title="Invite every advisor in a fresh order"
                >
                  @everyone
                </button>
              </div>
            )}
            <div className="chats-screen__composer">
              <div className={`chats-screen__composer-input ${input ? 'chats-screen__composer-input--has-value' : ''}`}>
                <div
                  ref={composerHighlightRef}
                  className="chats-screen__composer-highlight"
                  aria-hidden="true"
                >
                  {input ? renderTextWithMentions(input, mentionNames) : '\u200b'}
                </div>
                <textarea
                  ref={composerRef}
                  value={input}
                  onChange={(event) => {
                    const nextValue = event.target.value
                    setInput(nextValue)
                    updateMentionDraft(nextValue, event.target.selectionStart ?? nextValue.length)
                  }}
                  onSelect={(event) => {
                    updateMentionDraft(
                      event.currentTarget.value,
                      event.currentTarget.selectionStart ?? event.currentTarget.value.length,
                    )
                  }}
                  onScroll={(event) => {
                    if (composerHighlightRef.current) {
                      composerHighlightRef.current.scrollTop = event.currentTarget.scrollTop
                    }
                  }}
                  placeholder={selectedParticipants.length > 1
                    ? 'Message everyone, or @ an advisor directly…'
                    : `Message ${conversationTitle(selected)}…`}
                  rows={1}
                  disabled={loading}
                  aria-label={`Message ${conversationTitle(selected)}`}
                  aria-autocomplete="list"
                  aria-expanded={!!mentionDraft && mentionSuggestions.length > 0}
                  aria-controls={mentionDraft ? 'chat-mention-suggestions' : undefined}
                  aria-activedescendant={mentionDraft && mentionSuggestions[activeMentionIndex]
                    ? `chat-mention-option-${mentionSuggestions[activeMentionIndex].id}`
                    : undefined}
                  onKeyDown={(event) => {
                    if (mentionDraft && mentionSuggestions.length > 0) {
                      if (event.key === 'ArrowDown') {
                        event.preventDefault()
                        setActiveMentionIndex((current) => (current + 1) % mentionSuggestions.length)
                        return
                      }
                      if (event.key === 'ArrowUp') {
                        event.preventDefault()
                        setActiveMentionIndex((current) =>
                          (current - 1 + mentionSuggestions.length) % mentionSuggestions.length)
                        return
                      }
                      if (event.key === 'Enter' || event.key === 'Tab') {
                        event.preventDefault()
                        selectMention(mentionSuggestions[activeMentionIndex].name)
                        return
                      }
                      if (event.key === 'Escape') {
                        event.preventDefault()
                        setMentionDraft(null)
                        return
                      }
                    }
                    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                      event.preventDefault()
                      void handleSend()
                    }
                  }}
                />
              </div>
              <button
                type="button"
                className={`chats-screen__send ${loading ? 'chats-screen__send--stop' : ''}`}
                onClick={loading ? handleStop : () => void handleSend()}
                disabled={!loading && !input.trim()}
                aria-label={loading ? 'Stop response' : 'Send message'}
                title={loading ? 'Stop response' : 'Send message'}
              >
                {loading ? <Square size={15} fill="currentColor" /> : <ArrowUp size={19} />}
              </button>
            </div>
            <p>
              {selectedParticipants.length > 1 && <><b>@mention for a direct reply</b><span>·</span></>}
              Enter to send <span>·</span> Shift + Enter for a new line
            </p>
          </footer>
        </section>
      ) : (
        <section className="chats-screen__placeholder">
          <span><MessagesSquare size={28} /></span>
          <h2>Your private advisory room</h2>
          <p>Start a focused conversation with one or more AI advisors.</p>
          <button type="button" onClick={() => setShowNewModal(true)}>
            <Plus size={16} /> New conversation
          </button>
        </section>
      )}

      {showNewModal && (
        <NewConversationModal
          onClose={() => setShowNewModal(false)}
          onCreate={(title, participantAgentIds) => createConversation({ title, participantAgentIds })}
          onCreated={(conversation) => {
            setShowNewModal(false)
            selectConversation(conversation.id)
          }}
        />
      )}

      {deleteTarget && createPortal(
        <div
          className="chats-screen__delete-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDeleteTarget(null)
          }}
        >
          <div
            className="chats-screen__delete-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-conversation-title"
            aria-describedby="delete-conversation-description"
          >
            <span className="chats-screen__delete-dialog-icon"><Trash2 size={20} /></span>
            <span className="chats-screen__eyebrow">Permanent action</span>
            <h2 id="delete-conversation-title">Delete this conversation?</h2>
            <p id="delete-conversation-description">
              “{conversationTitle(deleteTarget)}” and {deleteTarget.messages.length}{' '}
              {deleteTarget.messages.length === 1 ? 'message' : 'messages'} will be permanently removed.
            </p>
            <div className="chats-screen__delete-dialog-actions">
              <button type="button" onClick={() => setDeleteTarget(null)}>Keep conversation</button>
              <button type="button" className="chats-screen__delete-confirm" onClick={handleDeleteConversation}>
                <Trash2 size={14} /> Delete permanently
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

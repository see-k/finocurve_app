import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import {
  MainContainer, Sidebar, ConversationList, Conversation as ChatscopeConversation,
  ChatContainer, MessageList, Message,
} from '@chatscope/chat-ui-kit-react'
import '@chatscope/chat-ui-kit-styles/dist/default/styles.min.css'
import { Plus, Send, Square, Users, MessagesSquare } from 'lucide-react'
import GlassContainer from '../../components/glass/GlassContainer'
import GlassButton from '../../components/glass/GlassButton'
import GlassIconButton from '../../components/glass/GlassIconButton'
import GlassTextField from '../../components/glass/GlassTextField'
import UserAvatar, { getInitials } from '../../components/UserAvatar'
import ChatMessageContent from '../../components/ai/ChatMessageContent'
import { usePortfolio } from '../../store/usePortfolio'
import { usePreferences } from '../../store/usePreferences'
import { useAgents } from '../../store/useAgents'
import { useConversations } from '../../store/useConversations'
import { runGroupTurn } from '../../ai/GroupChatOrchestrator'
import type { Conversation, ConversationMessage } from '../../types/Conversation'
import NewConversationModal from './NewConversationModal'
import './ChatsScreen.css'

export default function ChatsScreen() {
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const { agents } = useAgents()
  const { conversations, createConversation, appendMessage } = useConversations()
  const { portfolio, totalValue, totalGainLossPercent } = usePortfolio()
  const { prefs } = usePreferences()

  const [showNewModal, setShowNewModal] = useState(false)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [streamingAgentId, setStreamingAgentId] = useState<string | null>(null)
  const [streamingText, setStreamingText] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const stoppedRef = useRef(false)

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

  const selectConversation = (id: string) => {
    setSearchParams({ tab: 'chats', conversationId: id }, { replace: true })
  }

  const agentById = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents])
  const userName = prefs.userName || prefs.userEmail?.split('@')[0] || 'You'

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
    abortRef.current?.abort()
    void window.electronAPI?.aiChatCancel?.()
  }

  const handleSend = async () => {
    if (!selected || !input.trim() || loading) return
    const text = input.trim()
    setInput('')
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
        setStreamingAgentId(agent.id)
        setStreamingText('')

        const unsubscribe = window.electronAPI.onAiChatChunk?.((chunk) => {
          if (chunk.type === 'answer') setStreamingText((prev) => prev + chunk.content)
        })

        const chatMessages = [...selected.messages, userMessage].map((m) => ({
          role: m.role,
          content: m.content,
        }))
        const { text: reply, reasoning, followUps, aborted } = await window.electronAPI.aiChatStream({
          messages: chatMessages,
          context: { ...baseContext, agentPersona: { name: agent.name, systemPrompt: agent.systemPrompt } },
        })
        unsubscribe?.()

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
      } else {
        const participants = selected.participantAgentIds.map((id) => agentById.get(id)).filter(Boolean) as typeof agents
        for await (const result of runGroupTurn(selected, participants, userMessage, {
          signal: controller.signal,
          baseContext,
          onChunk: (chunk) => {
            if (chunk.type === 'answer') {
              setStreamingAgentId(chunk.agentId)
              setStreamingText((prev) => (streamingAgentId === chunk.agentId ? prev + chunk.content : chunk.content))
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
          setStreamingText('')
        }
      }
    } finally {
      setStreamingAgentId(null)
      setStreamingText('')
      setLoading(false)
    }
  }

  const handleFollowUp = (prompt: string) => {
    setInput(prompt)
  }

  const conversationTitle = (c: Conversation) =>
    c.title || c.participantAgentIds.map((id) => agentById.get(id)?.name).filter(Boolean).join(', ') || 'Chat'

  const conversationAvatarAgent = (c: Conversation) => agentById.get(c.participantAgentIds[0])

  return (
    <div className="chats-screen">
      <MainContainer responsive className="chats-screen__main">
        <Sidebar position="left" scrollable className="chats-screen__sidebar">
          <div className="chats-screen__sidebar-header">
            <h2 className="chats-screen__sidebar-title">
              <MessagesSquare size={18} /> Chats
            </h2>
            <GlassIconButton icon={<Plus size={18} />} onClick={() => setShowNewModal(true)} size={36} title="New chat" />
          </div>
          {conversations.length === 0 ? (
            <p className="chats-screen__empty">
              No chats yet. Start a conversation with one of your agents.
            </p>
          ) : (
            <ConversationList>
              {conversations.map((c) => {
                const agent = conversationAvatarAgent(c)
                const isGroup = c.participantAgentIds.length > 1
                const lastMessage = c.messages[c.messages.length - 1]
                return (
                  <ChatscopeConversation
                    key={c.id}
                    name={conversationTitle(c)}
                    lastSenderName={lastMessage?.senderName}
                    info={lastMessage?.content?.slice(0, 60) || 'No messages yet'}
                    active={selected?.id === c.id}
                    onClick={() => selectConversation(c.id)}
                  >
                    {isGroup ? (
                      <Users size={20} className="chats-screen__group-icon" />
                    ) : (
                      <UserAvatar src={agent?.image} initials={getInitials(agent?.name)} size={40} />
                    )}
                  </ChatscopeConversation>
                )
              })}
            </ConversationList>
          )}
        </Sidebar>

        {selected ? (
          <ChatContainer>
            <MessageList className="chats-screen__message-list">
              {selected.messages.map((m, idx) => (
                <Message
                  key={idx}
                  model={{
                    direction: m.role === 'user' ? 'outgoing' : 'incoming',
                    position: 'single',
                  }}
                >
                  {m.role === 'assistant' && (
                    <Message.Header sender={m.senderName} />
                  )}
                  <Message.CustomContent>
                    <ChatMessageContent
                      role={m.role}
                      content={m.content}
                      attachments={m.attachments}
                      reasoning={m.reasoning}
                      followUps={m.followUps}
                      disabled={loading}
                      onFollowUpClick={handleFollowUp}
                    />
                  </Message.CustomContent>
                </Message>
              ))}
              {streamingAgentId && (
                <Message model={{ direction: 'incoming', position: 'single' }}>
                  <Message.Header sender={agentById.get(streamingAgentId)?.name} />
                  <Message.CustomContent>
                    <ChatMessageContent role="assistant" content={streamingText || '…'} />
                  </Message.CustomContent>
                </Message>
              )}
            </MessageList>
          </ChatContainer>
        ) : (
          <div className="chats-screen__placeholder">
            <MessagesSquare size={40} />
            <p>Select or start a chat with one of your agents.</p>
            <GlassButton text="New Chat" icon={<Plus size={16} />} onClick={() => setShowNewModal(true)} isPrimary width="auto" />
          </div>
        )}
      </MainContainer>

      {selected && (
        <GlassContainer className="chats-screen__composer" padding="12px" borderRadius={16}>
          <GlassTextField
            value={input}
            onChange={setInput}
            placeholder={`Message ${conversationTitle(selected)}...`}
            maxLines={2}
            disabled={loading}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void handleSend()
              }
            }}
          />
          {loading ? (
            <GlassIconButton icon={<Square size={16} />} onClick={handleStop} size={40} title="Stop" />
          ) : (
            <GlassIconButton
              icon={<Send size={16} />}
              onClick={() => void handleSend()}
              size={40}
              title="Send"
              disabled={!input.trim()}
            />
          )}
        </GlassContainer>
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
    </div>
  )
}

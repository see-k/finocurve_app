import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { MessagesSquare, Plus } from 'lucide-react'
import { usePortfolio } from '../../store/usePortfolio'
import { usePreferences } from '../../store/usePreferences'
import { useAgents } from '../../store/useAgents'
import { useConversations } from '../../store/useConversations'
import { runGroupTurn } from '../../ai/GroupChatOrchestrator'
import type { Agent } from '../../types/Agent'
import { isAgentActive } from '../../types/Agent'
import type { Conversation, ConversationMessage } from '../../types/Conversation'
import type { ChatAttachment } from '../../ai/types'
import { aggregateAssetValueProvenance, toFinancialAuditContext } from '../../lib/financialProvenance'
import NewConversationModal from './NewConversationModal'
import ConversationSidebar from './chats/ConversationSidebar'
import ChatHeader from './chats/ChatHeader'
import ChatMessages from './chats/ChatMessages'
import ChatComposer, { type MentionSuggestion } from './chats/ChatComposer'
import DeleteConversationDialog from './chats/DeleteConversationDialog'
import { useChatAttachments } from './chats/useChatAttachments'
import {
  containsMention,
  findMentionDraft,
  getModelProviderLabel,
  type AgentProviderPresentation,
  type MentionDraft,
  type RouterPresentation,
  type SmartRoutingStatus,
} from './chats/chatUtils'
import './ChatsScreen.css'

export default function ChatsScreen() {
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { agents } = useAgents()
  const {
    conversations,
    createConversation,
    appendMessage,
    renameConversation,
    setParticipants,
    setSmartRouting,
    deleteConversation,
  } = useConversations()
  const { portfolio, totalValue, totalGainLossPercent } = usePortfolio()
  const { prefs } = usePreferences()

  const [showNewModal, setShowNewModal] = useState(false)
  const [showChatSettings, setShowChatSettings] = useState(false)
  const [draftParticipantIds, setDraftParticipantIds] = useState<string[]>([])
  const [draftConversationTitle, setDraftConversationTitle] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Conversation | null>(null)
  const [conversationQuery, setConversationQuery] = useState('')
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [streamingAgentId, setStreamingAgentId] = useState<string | null>(null)
  const [streamingText, setStreamingText] = useState('')
  const [streamingReasoning, setStreamingReasoning] = useState('')
  const [streamingTools, setStreamingTools] = useState<{ name: string; status: 'running' | 'success' | 'error' }[]>([])
  const [verboseStreaming, setVerboseStreaming] = useState(() => localStorage.getItem('finocurve-chat-verbose') === 'true')
  const [smartRoutingStatus, setSmartRoutingStatus] = useState<SmartRoutingStatus | null>(null)
  const [routerPresentation, setRouterPresentation] = useState<RouterPresentation>({
    showProvider: false,
    verbose: false,
    providerLabel: '',
    model: '',
  })
  const [agentProviderPresentation, setAgentProviderPresentation] = useState<AgentProviderPresentation>({
    showProvider: false,
    primaryProvider: 'ollama',
    primaryModel: 'llama3.2',
  })
  const [mentionDraft, setMentionDraft] = useState<MentionDraft | null>(null)
  const [activeMentionIndex, setActiveMentionIndex] = useState(0)
  const streamingAgentIdRef = useRef<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const stoppedRef = useRef(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const composerHighlightRef = useRef<HTMLDivElement>(null)
  const pendingCaretRef = useRef<number | null>(null)
  const chatSettingsRef = useRef<HTMLDivElement>(null)

  const {
    pendingAttachments,
    attachmentError,
    isReadingAttachments,
    isDraggingFiles,
    fileInputRef,
    clearAttachments,
    addAttachmentFiles,
    removePendingAttachment,
    handleComposerDragEnter,
    handleComposerDragOver,
    handleComposerDragLeave,
    handleComposerDrop,
  } = useChatAttachments(loading)

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
    clearAttachments()
    setShowChatSettings(false)
    setDraftParticipantIds(selected?.participantAgentIds ?? [])
    setDraftConversationTitle(selected?.title ?? '')
  }, [selected?.id, clearAttachments])

  useEffect(() => {
    const getConfig = window.electronAPI?.aiConfigGet
    if (!getConfig) return
    let current = true
    void getConfig().then((config) => {
      if (!current) return
      const provider = config.routerProvider === 'ollama' ? 'ollama' : config.provider
      const model = config.routerProvider === 'ollama'
        ? (config.routerModel || 'llama3.2')
        : config.model
      setRouterPresentation({
        showProvider: config.routerShowProvider ?? false,
        verbose: config.routerVerbose ?? false,
        providerLabel: getModelProviderLabel(provider, model),
        model,
      })
      setAgentProviderPresentation({
        showProvider: config.agentShowProvider ?? false,
        primaryProvider: config.provider,
        primaryModel: config.provider === 'azure'
          ? (config.azureDeployment || config.model)
          : config.model,
      })
    }).catch(() => {
      // Display preferences are optional; routing itself remains available.
    })
    return () => { current = false }
  }, [])

  const renderAgentProvider = (agentId?: string) => {
    if (!agentProviderPresentation.showProvider || !agentId) return null
    const agent = agents.find((candidate) => candidate.id === agentId)
    if (!agent) return null
    const provider = agent.provider || agentProviderPresentation.primaryProvider
    const model = agent.model || agentProviderPresentation.primaryModel
    const providerLabel = getModelProviderLabel(provider, model)
    return (
      <span
        className="chats-screen__agent-provider"
        title={`${providerLabel} · ${model}`}
      >
        <b>{providerLabel}</b>
        <em>{model}</em>
      </span>
    )
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end' })
  }, [selected?.id, selected?.messages.length, streamingText, streamingReasoning, streamingTools, smartRoutingStatus?.phase])

  const toggleVerboseStreaming = () => {
    setVerboseStreaming((current) => {
      const next = !current
      localStorage.setItem('finocurve-chat-verbose', String(next))
      return next
    })
  }

  const resetStreamingActivity = () => {
    setStreamingReasoning('')
    setStreamingTools([])
  }

  const handleLiveChunk = (chunk: {
    type: 'reasoning' | 'answer' | 'tool_start' | 'tool_end'
    content?: string
    toolName?: string
    status?: 'success' | 'error'
  }) => {
    if (chunk.type === 'answer' && chunk.content) {
      setStreamingText((previous) => previous + chunk.content)
    } else if (chunk.type === 'reasoning' && chunk.content) {
      setStreamingReasoning((previous) => previous + chunk.content)
    } else if (chunk.type === 'tool_start' && chunk.toolName) {
      setStreamingTools((previous) => [...previous, { name: chunk.toolName!, status: 'running' }])
    } else if (chunk.type === 'tool_end' && chunk.toolName) {
      setStreamingTools((previous) => {
        let index = -1
        for (let toolIndex = previous.length - 1; toolIndex >= 0; toolIndex -= 1) {
          if (previous[toolIndex].name === chunk.toolName && previous[toolIndex].status === 'running') {
            index = toolIndex
            break
          }
        }
        if (index < 0) return previous
        return previous.map((tool, toolIndex) => toolIndex === index
          ? { ...tool, status: chunk.status ?? 'success' }
          : tool)
      })
    }
  }

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

  useEffect(() => {
    if (!showChatSettings) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!chatSettingsRef.current?.contains(event.target as Node)) setShowChatSettings(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowChatSettings(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [showChatSettings])

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
        .filter((agent): agent is Agent => !!agent && isAgentActive(agent))
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
  const mentionSuggestions: MentionSuggestion[] = mentionDraft
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

  const portfolioAudit = portfolio
    ? toFinancialAuditContext(aggregateAssetValueProvenance(portfolio.assets))
    : undefined
  const portfolioSummary = portfolio && totalValue > 0
    ? `Portfolio: ${portfolio.name || 'Portfolio'}, ~$${totalValue.toLocaleString()}. Source: ${portfolioAudit?.source}; as of ${portfolioAudit?.asOf}; method: ${portfolioAudit?.valuationMethod}; freshness: ${portfolioAudit?.freshness}${portfolioAudit?.estimated ? '; estimated' : ''}.`
    : undefined
  const portfolioContext = portfolio && totalValue >= 0
    ? {
        portfolioName: portfolio.name || 'Portfolio',
        totalValue,
        totalGainLossPercent: totalGainLossPercent ?? 0,
        assetCount: portfolio.assets?.length ?? 0,
        valuationAudit: portfolioAudit,
      }
    : undefined
  const userProfile = {
    name: prefs.userName?.trim() || undefined,
    email: prefs.userEmail?.trim() || undefined,
    companyName: prefs.companyName?.trim() || undefined,
    companyRole: prefs.companyRole?.trim() || undefined,
    companyWebsite: prefs.companyWebsite?.trim() || undefined,
    linkedInUrl: prefs.linkedInUrl?.trim() || undefined,
    socialMediaUrl: prefs.socialMediaUrl?.trim() || undefined,
    personalBio: prefs.personalBio?.trim() || undefined,
  }
  const baseContext = { currentRoute: location.pathname, portfolioSummary, portfolioContext, userProfile }

  const handleStop = () => {
    stoppedRef.current = true
    setSmartRoutingStatus(null)
    abortRef.current?.abort()
    void window.electronAPI?.aiChatCancel?.()
  }

  const handleSend = async () => {
    if (
      !selected ||
      selectedParticipants.length === 0 ||
      (!input.trim() && pendingAttachments.length === 0) ||
      loading ||
      isReadingAttachments
    ) return
    const text = input.trim()
    const apiAttachments: ChatAttachment[] = pendingAttachments.map((attachment) => ({
      name: attachment.name,
      mimeType: attachment.mimeType,
      dataBase64: attachment.dataBase64,
    }))
    const displayContent = text || '(See attached files)'

    clearAttachments()
    setInput('')
    setMentionDraft(null)
    setSmartRoutingStatus(null)
    setLoading(true)
    stoppedRef.current = false
    const controller = new AbortController()
    abortRef.current = controller

    const userMessage: ConversationMessage = {
      role: 'user',
      content: displayContent,
      senderName: userName,
      senderAvatar: prefs.profilePicturePath ?? undefined,
      ...(apiAttachments.length > 0 ? { attachments: apiAttachments } : {}),
    }
    appendMessage(selected.id, userMessage)

    try {
      if (selectedParticipants.length === 1) {
        const agent = selectedParticipants[0]
        if (!agent || !window.electronAPI?.aiChatStream) return
        streamingAgentIdRef.current = agent.id
        setStreamingAgentId(agent.id)
        setStreamingText('')
        resetStreamingActivity()

        const unsubscribe = window.electronAPI.onAiChatChunk?.((chunk) => {
          if (chunk.type !== 'follow_ups') handleLiveChunk(chunk)
        })

        try {
          const chatMessages = [...selected.messages, userMessage].map((message) => {
            const messageAttachments = message.role === 'user'
              ? message.attachments?.filter((attachment) => attachment.dataBase64.length > 0)
              : undefined
            return {
              role: message.role,
              content: message.content,
              ...(messageAttachments?.length ? { attachments: messageAttachments } : {}),
            }
          })
          const { text: reply, reasoning, followUps, aborted } = await window.electronAPI.aiChatStream({
            messages: chatMessages,
            context: {
              ...baseContext,
              agentPersona: {
                id: agent.id,
                name: agent.name,
                systemPrompt: agent.systemPrompt,
                provider: agent.provider,
                model: agent.model,
                ollamaBaseUrl: agent.ollamaBaseUrl,
                bedrockRegion: agent.bedrockRegion,
                bedrockAccessKeyId: agent.bedrockAccessKeyId,
                bedrockSecretKey: agent.bedrockSecretKey,
                azureEndpoint: agent.azureEndpoint,
                azureApiKey: agent.azureApiKey,
                toolAccess: agent.toolAccess,
                enabledToolNames: agent.enabledToolNames,
              },
            },
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
        const participants = selectedParticipants

        for await (const result of runGroupTurn(selected, participants, userMessage, {
          signal: controller.signal,
          baseContext,
          smartRouting: selected.smartRoutingEnabled === true,
          includeRoutingRationale: routerPresentation.verbose,
          onSmartRoutingUpdate: (update) => {
            setSmartRoutingStatus({ ...update, conversationId: selected.id })
          },
          onAgentStart: (agentId) => {
            streamingAgentIdRef.current = agentId
            setStreamingAgentId(agentId)
            setStreamingText('')
            resetStreamingActivity()
          },
          onChunk: (chunk) => {
            if (streamingAgentIdRef.current !== chunk.agentId) {
              streamingAgentIdRef.current = chunk.agentId
              setStreamingAgentId(chunk.agentId)
              setStreamingText('')
              resetStreamingActivity()
            }
            handleLiveChunk(chunk)
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
      resetStreamingActivity()
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

  const handleComposerKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
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

  const toggleChatSettings = () => {
    if (!selected) return
    setShowChatSettings((isOpen) => {
      if (!isOpen) {
        setDraftParticipantIds(selected.participantAgentIds)
        setDraftConversationTitle(selected.title)
      }
      return !isOpen
    })
  }

  const toggleDraftParticipant = (agentId: string) => {
    setDraftParticipantIds((current) => (
      current.includes(agentId)
        ? current.filter((id) => id !== agentId)
        : [...current, agentId]
    ))
  }

  const availableDraftParticipantIds = draftParticipantIds.filter((id) => agentById.has(id))
  const participantDraftChanged = selected
    ? availableDraftParticipantIds.length !== selected.participantAgentIds.length ||
      availableDraftParticipantIds.some((id, index) => id !== selected.participantAgentIds[index])
    : false
  const titleDraftChanged = selected
    ? draftConversationTitle.trim() !== selected.title
    : false

  const saveChatSettings = () => {
    if (!selected || availableDraftParticipantIds.length === 0 || loading) return

    const currentDefaultTitle = selected.participantAgentIds
      .map((id) => agentById.get(id)?.name)
      .filter(Boolean)
      .join(', ')
    const nextDefaultTitle = availableDraftParticipantIds
      .map((id) => agentById.get(id)?.name)
      .filter(Boolean)
      .join(', ')
    const requestedTitle = draftConversationTitle.trim()
    const nextTitle = !requestedTitle || requestedTitle === currentDefaultTitle
      ? nextDefaultTitle || 'Chat'
      : requestedTitle

    setParticipants(selected.id, availableDraftParticipantIds)
    if (nextTitle !== selected.title) renameConversation(selected.id, nextTitle)
    setDraftConversationTitle(nextTitle)
  }

  return (
    <div className="chats-screen">
      <ConversationSidebar
        conversations={conversations}
        visibleConversations={visibleConversations}
        selectedId={selected?.id}
        agentById={agentById}
        conversationQuery={conversationQuery}
        onQueryChange={setConversationQuery}
        conversationTitle={conversationTitle}
        onSelect={selectConversation}
        onNew={() => setShowNewModal(true)}
        onRequestDelete={setDeleteTarget}
      />

      {selected ? (
        <section className="chats-screen__conversation-pane" aria-label={conversationTitle(selected)}>
          <ChatHeader
            title={conversationTitle(selected)}
            participants={selectedParticipants}
            userName={userName}
            profilePicturePath={prefs.profilePicturePath}
            agents={agents}
            showChatSettings={showChatSettings}
            chatSettingsRef={chatSettingsRef}
            onToggleSettings={toggleChatSettings}
            draftTitle={draftConversationTitle}
            onDraftTitleChange={setDraftConversationTitle}
            availableDraftParticipantIds={availableDraftParticipantIds}
            onToggleParticipant={toggleDraftParticipant}
            onSaveSettings={saveChatSettings}
            participantDraftChanged={participantDraftChanged}
            titleDraftChanged={titleDraftChanged}
            loading={loading}
            smartRoutingEnabled={selected.smartRoutingEnabled === true}
            onToggleSmartRouting={() => setSmartRouting(selected.id, !selected.smartRoutingEnabled)}
            onNavigate={navigate}
            onEditAgent={(agentId) => navigate(`/settings/agents/${agentId}`)}
            onRequestDeleteSelected={() => {
              setShowChatSettings(false)
              setDeleteTarget(selected)
            }}
          />

          <ChatMessages
            conversation={selected}
            streamingAgentId={streamingAgentId}
            streamingText={streamingText}
            streamingReasoning={streamingReasoning}
            streamingTools={streamingTools}
            verboseStreaming={verboseStreaming}
            smartRoutingStatus={smartRoutingStatus}
            routerPresentation={routerPresentation}
            agentById={agentById}
            userName={userName}
            profilePicturePath={prefs.profilePicturePath}
            latestUserMessageIndex={latestUserMessageIndex}
            mentionNames={mentionNames}
            loading={loading}
            onFollowUp={handleFollowUp}
            onEditAgent={(agentId) => navigate(`/settings/agents/${agentId}`)}
            renderAgentProvider={renderAgentProvider}
            messagesEndRef={messagesEndRef}
          />

          <ChatComposer
            conversationTitle={conversationTitle(selected)}
            participants={selectedParticipants}
            input={input}
            mentionNames={mentionNames}
            mentionDraft={mentionDraft}
            mentionSuggestions={mentionSuggestions}
            activeMentionIndex={activeMentionIndex}
            onMentionHover={setActiveMentionIndex}
            onMentionSelect={selectMention}
            composerRef={composerRef}
            composerHighlightRef={composerHighlightRef}
            fileInputRef={fileInputRef}
            onFileInputChange={(files) => void addAttachmentFiles(files)}
            onInputChange={(value, caret) => {
              setInput(value)
              updateMentionDraft(value, caret)
            }}
            onSelectCaret={updateMentionDraft}
            onPasteFiles={(files) => void addAttachmentFiles(files)}
            onKeyDown={handleComposerKeyDown}
            pendingAttachments={pendingAttachments}
            onRemoveAttachment={removePendingAttachment}
            attachmentError={attachmentError}
            isReadingAttachments={isReadingAttachments}
            isDraggingFiles={isDraggingFiles}
            loading={loading}
            verboseStreaming={verboseStreaming}
            onToggleVerbose={toggleVerboseStreaming}
            onDragEnter={handleComposerDragEnter}
            onDragOver={handleComposerDragOver}
            onDragLeave={handleComposerDragLeave}
            onDrop={handleComposerDrop}
            onAttachClick={() => fileInputRef.current?.click()}
            onSend={() => void handleSend()}
            onStop={handleStop}
          />
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

      {deleteTarget && (
        <DeleteConversationDialog
          target={deleteTarget}
          title={conversationTitle(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDeleteConversation}
        />
      )}
    </div>
  )
}

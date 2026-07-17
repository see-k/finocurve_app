import { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { MessageCircle, X, Send, Square, Maximize2, Minimize2, MessageSquarePlus, MessagesSquare, Paperclip, ChevronDown, Check } from 'lucide-react'
import { usePortfolio } from '../../store/usePortfolio'
import { usePreferences } from '../../store/usePreferences'
import { useAgents } from '../../store/useAgents'
import { DEFAULT_AGENT_ID, isAgentActive, isDefaultAgent } from '../../types/Agent'
import type { Agent } from '../../types/Agent'
import type { ChatAttachment, ChatFollowUp } from '../../ai/types'
import GlassContainer from '../glass/GlassContainer'
import UserAvatar, { getInitials } from '../UserAvatar'
import ChatMessageContent, { FollowUpsRow } from './ChatMessageContent'
import { getCoreDataItem, removeCoreDataItem, setCoreDataItem } from '../../lib/coreDataStorage'
import { aggregateAssetValueProvenance, toFinancialAuditContext } from '../../lib/financialProvenance'
import './AIChatBubble.css'

import aiAvatar from '/images/finocurve-icon.png'

const AUTHENTICATED_PATHS = ['/main', '/asset/', '/loan/', '/risk-analysis', '/news', '/notifications', '/settings/']

function isAuthenticatedPath(path: string): boolean {
  return AUTHENTICATED_PATHS.some((p) => path.startsWith(p))
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  /** User turns only: sent to the model (vision + extracted text). */
  attachments?: ChatAttachment[]
  /** Reasoning/thinking from models that support it (o1, o3, llama thinking, etc.) */
  reasoning?: string
  /** Clickable follow-ups from suggest_conversation_follow_ups */
  followUps?: ChatFollowUp[]
}

const MAX_CHAT_ATTACHMENTS = 6
const MAX_CHAT_ATTACHMENT_BYTES = 4 * 1024 * 1024

const CHAT_ATTACHMENT_ACCEPT =
  'image/png,image/jpeg,image/jpg,image/gif,image/webp,application/pdf,text/plain,text/csv,application/csv,.json,.md,.markdown,.html,.htm,.xml,.yaml,.yml,.txt,.csv,.pdf'

function fileToBase64Data(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const s = reader.result as string
      const comma = s.indexOf(',')
      resolve(comma >= 0 ? s.slice(comma + 1) : s)
    }
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

interface PendingAttachment {
  id: string
  name: string
  mimeType: string
  dataBase64: string
  objectUrl?: string
}

const PREFS_STORAGE_KEY = 'finocurve-preferences'
const PANEL_SIZE_KEY = 'finocurve-ai-chat-panel-size'
const SELECTED_AGENT_KEY = 'finocurve-ai-bubble-agent-id'
const MAX_PERSISTED_MESSAGES = 200

function loadSelectedAgentId(): string {
  try {
    return localStorage.getItem(SELECTED_AGENT_KEY) || DEFAULT_AGENT_ID
  } catch {
    return DEFAULT_AGENT_ID
  }
}

function persistSelectedAgentId(id: string) {
  try {
    localStorage.setItem(SELECTED_AGENT_KEY, id)
  } catch {
    /* ignore */
  }
}

const PANEL_DEFAULT_W = 380
const PANEL_DEFAULT_H = 520
const PANEL_LARGE_W = 520
const PANEL_LARGE_H = 700
const PANEL_MIN_W = 280
const PANEL_MIN_H = 280

type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se'

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

function loadPanelSize(): { w: number; h: number } {
  try {
    const raw = localStorage.getItem(PANEL_SIZE_KEY)
    if (!raw) return { w: PANEL_DEFAULT_W, h: PANEL_DEFAULT_H }
    const o = JSON.parse(raw) as { w?: number; h?: number }
    if (typeof o.w === 'number' && typeof o.h === 'number' && o.w >= PANEL_MIN_W && o.h >= PANEL_MIN_H) {
      return { w: o.w, h: o.h }
    }
  } catch {
    /* ignore */
  }
  return { w: PANEL_DEFAULT_W, h: PANEL_DEFAULT_H }
}

function persistPanelSize(w: number, h: number) {
  try {
    localStorage.setItem(PANEL_SIZE_KEY, JSON.stringify({ w, h }))
  } catch {
    /* ignore */
  }
}

function maxPanelDimensions() {
  const maxW = Math.min(920, typeof window !== 'undefined' ? window.innerWidth - 48 : 920)
  const maxH =
    typeof window !== 'undefined' ? Math.max(PANEL_MIN_H, window.innerHeight - 80) : 900
  return { maxW, maxH }
}

function chatStorageKeyForUser(userEmail?: string, isGuest?: boolean): string {
  const id = userEmail?.trim() || (isGuest ? 'guest' : 'local')
  return `finocurve-ai-chat-messages-${id}`
}

function readPrefsIdentity(): { userEmail?: string; isGuest?: boolean } {
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as { userEmail?: string; isGuest?: boolean }
  } catch {
    return {}
  }
}

function loadChatMessages(storageKey: string): ChatMessage[] {
  try {
    const raw = getCoreDataItem(storageKey)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((raw): raw is Record<string, unknown> => !!raw && typeof raw === 'object')
      .filter((m) => {
        const role = m.role
        const content = m.content
        const atts = m.attachments
        if (role !== 'user' && role !== 'assistant') return false
        if (typeof content !== 'string') return false
        const hasText = content.trim().length > 0
        const hasAtt =
          role === 'user' &&
          Array.isArray(atts) &&
          atts.length > 0 &&
          atts.every((a) => !!a && typeof a === 'object' && typeof (a as { name?: string }).name === 'string')
        return hasText || hasAtt
      })
      .map((m) => {
        const msg = m as unknown as ChatMessage
        const rawFu = msg.followUps
        const followUps =
          Array.isArray(rawFu) && rawFu.length > 0
            ? rawFu.filter(
                (f): f is ChatFollowUp =>
                  !!f &&
                  typeof f === 'object' &&
                  typeof f.label === 'string' &&
                  f.label.trim().length > 0 &&
                  typeof f.prompt === 'string' &&
                  f.prompt.trim().length > 0
              )
            : undefined
        const rawAtt = msg.attachments
        const attachments =
          msg.role === 'user' && Array.isArray(rawAtt) && rawAtt.length > 0
            ? rawAtt
                .filter(
                  (a): a is ChatAttachment =>
                    !!a &&
                    typeof a === 'object' &&
                    typeof (a as ChatAttachment).name === 'string' &&
                    (a as ChatAttachment).name.trim().length > 0
                )
                .map((a) => ({
                  name: a.name.trim(),
                  mimeType:
                    typeof a.mimeType === 'string' && a.mimeType.trim()
                      ? a.mimeType.trim()
                      : 'application/octet-stream',
                  dataBase64: typeof a.dataBase64 === 'string' ? a.dataBase64 : '',
                }))
            : undefined
        return {
          role: msg.role,
          content: msg.content,
          ...(attachments && attachments.length > 0 ? { attachments } : {}),
          ...(typeof msg.reasoning === 'string' && msg.reasoning ? { reasoning: msg.reasoning } : {}),
          ...(followUps && followUps.length > 0 ? { followUps } : {}),
        }
      })
  } catch {
    return []
  }
}

function stripChatAttachmentPayloads(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((m) => {
    if (!m.attachments?.length) return m
    return {
      ...m,
      attachments: m.attachments.map((a) => ({ ...a, dataBase64: '' })),
    }
  })
}

function persistChatMessages(storageKey: string, messages: ChatMessage[]) {
  const trimmed = messages.length > MAX_PERSISTED_MESSAGES ? messages.slice(-MAX_PERSISTED_MESSAGES) : messages
  const save = (payload: ChatMessage[]) => {
    setCoreDataItem(storageKey, JSON.stringify(payload))
  }
  try {
    save(trimmed)
  } catch {
    try {
      save(stripChatAttachmentPayloads(trimmed))
    } catch {
      try {
        save(stripChatAttachmentPayloads(trimmed).slice(-80))
      } catch {
        /* quota or private mode */
      }
    }
  }
}

export default function AIChatBubble() {
  const navigate = useNavigate()
  const location = useLocation()
  const { portfolio, totalValue, totalGainLossPercent } = usePortfolio()
  const { prefs } = usePreferences()
  const { agents } = useAgents()
  const chatStorageKey = useMemo(
    () => chatStorageKeyForUser(prefs.userEmail, prefs.isGuest),
    [prefs.userEmail, prefs.isGuest]
  )

  const [selectedAgentId, setSelectedAgentId] = useState<string>(loadSelectedAgentId)
  const [agentMenuOpen, setAgentMenuOpen] = useState(false)

  // Agents available in the switcher: the default plus every active expert.
  const selectableAgents = useMemo(
    () => agents.filter((a) => isDefaultAgent(a) || isAgentActive(a)),
    [agents]
  )
  const defaultAgent = useMemo(
    () => agents.find(isDefaultAgent),
    [agents]
  )
  // Resolve the active agent, falling back to the default if the stored pick was deleted/deactivated.
  const activeAgent: Agent | undefined = useMemo(
    () => selectableAgents.find((a) => a.id === selectedAgentId) ?? defaultAgent ?? selectableAgents[0],
    [selectableAgents, selectedAgentId, defaultAgent]
  )
  const activeAgentRef = useRef<Agent | undefined>(activeAgent)
  activeAgentRef.current = activeAgent

  const selectAgent = useCallback((id: string) => {
    setSelectedAgentId(id)
    persistSelectedAgentId(id)
    setAgentMenuOpen(false)
  }, [])

  const initialPanelDims = useMemo(() => {
    const loaded = loadPanelSize()
    if (typeof window === 'undefined') return loaded
    const { maxW, maxH } = maxPanelDimensions()
    return {
      w: clamp(loaded.w, PANEL_MIN_W, maxW),
      h: clamp(loaded.h, PANEL_MIN_H, maxH),
    }
  }, [])

  const [expanded, setExpanded] = useState(false)
  const [large, setLarge] = useState(false)
  const [panelWidth, setPanelWidth] = useState(initialPanelDims.w)
  const [panelHeight, setPanelHeight] = useState(initialPanelDims.h)
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const { userEmail, isGuest } = readPrefsIdentity()
    return loadChatMessages(chatStorageKeyForUser(userEmail, isGuest))
  })
  const lastHandledStorageKeyRef = useRef<string | null>(null)
  const [input, setInput] = useState('')
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([])
  const [loading, setLoading] = useState(false)
  const [streaming, setStreaming] = useState<{ reasoning: string; answer: string }>({ reasoning: '', answer: '' })
  const [streamingFollowUps, setStreamingFollowUps] = useState<ChatFollowUp[]>([])
  const [error, setError] = useState<string | null>(null)
  const messagesScrollRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pendingAttachmentsRef = useRef<PendingAttachment[]>([])
  pendingAttachmentsRef.current = pendingAttachments
  /** Latest thread for send/follow-up — updated each render and optimistically in submitUserText (never use setState updaters for side effects: Strict Mode runs them twice). */
  const messagesRef = useRef<ChatMessage[]>(messages)
  messagesRef.current = messages

  const scrollMessagesToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const el = messagesScrollRef.current
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior })
      return
    }
    messagesEndRef.current?.scrollIntoView({ behavior })
  }, [])

  const resizeTextarea = () => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`
  }

  useEffect(() => {
    scrollMessagesToBottom('smooth')
  }, [messages, streaming, streamingFollowUps, scrollMessagesToBottom])

  useLayoutEffect(() => {
    if (!expanded) return
    scrollMessagesToBottom('auto')
  }, [expanded, messages.length, scrollMessagesToBottom])

  useEffect(() => {
    resizeTextarea()
  }, [input])

  useEffect(() => {
    return () => {
      pendingAttachmentsRef.current.forEach((p) => {
        if (p.objectUrl) URL.revokeObjectURL(p.objectUrl)
      })
    }
  }, [])

  useEffect(() => {
    const onResize = () => {
      const { maxW, maxH } = maxPanelDimensions()
      setPanelWidth((w) => clamp(w, PANEL_MIN_W, maxW))
      setPanelHeight((h) => clamp(h, PANEL_MIN_H, maxH))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (lastHandledStorageKeyRef.current !== chatStorageKey) {
      lastHandledStorageKeyRef.current = chatStorageKey
      setMessages(loadChatMessages(chatStorageKey))
      return
    }
    persistChatMessages(chatStorageKey, messages)
  }, [chatStorageKey, messages])

  const visible = isAuthenticatedPath(location.pathname)

  const startPanelResize = useCallback((edge: ResizeEdge, e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const target = e.currentTarget
    target.setPointerCapture(e.pointerId)
    const startX = e.clientX
    const startY = e.clientY
    const startW = panelWidth
    const startH = panelHeight
    let lastW = startW
    let lastH = startH

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      let w = startW
      let h = startH
      if (edge.includes('e')) w = startW + dx
      if (edge.includes('w')) w = startW - dx
      if (edge.includes('s')) h = startH + dy
      if (edge.includes('n')) h = startH - dy
      const { maxW, maxH } = maxPanelDimensions()
      lastW = clamp(w, PANEL_MIN_W, maxW)
      lastH = clamp(h, PANEL_MIN_H, maxH)
      setPanelWidth(lastW)
      setPanelHeight(lastH)
    }

    const onUp = (ev: PointerEvent) => {
      try {
        target.releasePointerCapture(ev.pointerId)
      } catch {
        /* ignore */
      }
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      persistPanelSize(lastW, lastH)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }, [panelWidth, panelHeight])

  const portfolioAudit = portfolio
    ? toFinancialAuditContext(aggregateAssetValueProvenance(portfolio.assets))
    : undefined
  const portfolioSummary = portfolio && totalValue > 0
    ? `Portfolio: ${portfolio.name || 'Portfolio'}, ~$${totalValue.toLocaleString()}. Source: ${portfolioAudit?.source}; as of ${portfolioAudit?.asOf}; method: ${portfolioAudit?.valuationMethod}; freshness: ${portfolioAudit?.freshness}${portfolioAudit?.estimated ? '; estimated' : ''}.`
    : undefined

  const handleNewChat = () => {
    pendingAttachments.forEach((p) => {
      if (p.objectUrl) URL.revokeObjectURL(p.objectUrl)
    })
    setPendingAttachments([])
    messagesRef.current = []
    setMessages([])
    setInput('')
    setError(null)
    try {
      removeCoreDataItem(chatStorageKey)
    } catch {
      /* ignore */
    }
  }

  const removePendingAttachment = (id: string) => {
    setPendingAttachments((prev) => {
      const found = prev.find((p) => p.id === id)
      if (found?.objectUrl) URL.revokeObjectURL(found.objectUrl)
      return prev.filter((p) => p.id !== id)
    })
  }

  const onAttachmentFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    // FileList is live: clearing the input empties it. Snapshot files before reset.
    const files = e.target.files ? Array.from(e.target.files) : []
    e.target.value = ''
    if (files.length === 0) return

    const toAdd: PendingAttachment[] = []
    let slot = MAX_CHAT_ATTACHMENTS - pendingAttachments.length

    for (const file of files) {
      if (slot <= 0) break
      if (file.size > MAX_CHAT_ATTACHMENT_BYTES) {
        setError(
          `"${file.name}" exceeds ${MAX_CHAT_ATTACHMENT_BYTES / 1024 / 1024}MB per file.`
        )
        continue
      }
      try {
        const dataBase64 = await fileToBase64Data(file)
        const mimeType = file.type || 'application/octet-stream'
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
        const objectUrl = mimeType.startsWith('image/') ? URL.createObjectURL(file) : undefined
        toAdd.push({ id, name: file.name, mimeType, dataBase64, objectUrl })
        slot -= 1
      } catch {
        setError(`Could not read "${file.name}".`)
      }
    }

    if (toAdd.length > 0) {
      setPendingAttachments((prev) => [...prev, ...toAdd])
      setError(null)
    }
  }

  const submitUserText = (trimmed: string, source: 'input' | 'followup' = 'input') => {
    const text = trimmed.trim()
    const usePending = source === 'input' ? pendingAttachments : []
    if ((!text && usePending.length === 0) || loading || !window.electronAPI?.aiChatStream) return

    const apiAttachments: ChatAttachment[] = usePending.map((p) => ({
      name: p.name,
      mimeType: p.mimeType,
      dataBase64: p.dataBase64,
    }))

    if (source === 'input') {
      usePending.forEach((p) => {
        if (p.objectUrl) URL.revokeObjectURL(p.objectUrl)
      })
      setPendingAttachments([])
    }

    setInput('')
    setLoading(true)
    setError(null)
    setStreaming({ reasoning: '', answer: '' })
    setStreamingFollowUps([])

    const displayContent =
      text || (apiAttachments.length > 0 ? '(See attached files)' : '')

    const next = [
      ...messagesRef.current,
      {
        role: 'user' as const,
        content: displayContent,
        ...(apiAttachments.length > 0 ? { attachments: apiAttachments } : {}),
      },
    ]
    messagesRef.current = next
    setMessages(next)
    void runChatWithHistory(next)
  }

  const stoppedByUserRef = useRef(false)

  const handleStop = () => {
    stoppedByUserRef.current = true
    void window.electronAPI?.aiChatCancel?.()
  }

  const runChatWithHistory = async (historyForApi: ChatMessage[]) => {
    const streamChat = window.electronAPI?.aiChatStream
    if (!streamChat) {
      setLoading(false)
      setError('AI chat is not available.')
      return
    }
    stoppedByUserRef.current = false

    const portfolioContext =
      portfolio && totalValue >= 0
        ? {
            portfolioName: portfolio.name || 'Portfolio',
            totalValue,
            totalGainLossPercent: totalGainLossPercent ?? 0,
            assetCount: portfolio.assets?.length ?? 0,
            valuationAudit: portfolioAudit,
          }
        : undefined

    const unsubscribe = window.electronAPI?.onAiChatChunk?.((chunk) => {
      if (chunk.type === 'follow_ups') {
        setStreamingFollowUps(chunk.items)
        return
      }
      setStreaming((prev) =>
        chunk.type === 'reasoning'
          ? { ...prev, reasoning: prev.reasoning + chunk.content }
          : { ...prev, answer: prev.answer + chunk.content }
      )
    })

    try {
      const chatMessages = historyForApi.map((m) => {
        const cleaned =
          m.role === 'user' && m.attachments?.length
            ? m.attachments.filter((a) => (a.dataBase64?.length ?? 0) > 0)
            : undefined
        return {
          role: m.role,
          content: m.content,
          ...(cleaned && cleaned.length > 0 ? { attachments: cleaned } : {}),
        }
      })

      const agent = activeAgentRef.current
      const { text: response, reasoning, followUps, aborted } = await streamChat({
        messages: chatMessages,
        context: {
          currentRoute: location.pathname,
          userProfile: {
            name: prefs.userName?.trim() || undefined,
            email: prefs.userEmail?.trim() || undefined,
            companyName: prefs.companyName?.trim() || undefined,
            companyRole: prefs.companyRole?.trim() || undefined,
            companyWebsite: prefs.companyWebsite?.trim() || undefined,
            linkedInUrl: prefs.linkedInUrl?.trim() || undefined,
            socialMediaUrl: prefs.socialMediaUrl?.trim() || undefined,
            personalBio: prefs.personalBio?.trim() || undefined,
          },
          portfolioSummary,
          documentCount: undefined,
          portfolioContext,
          riskMetrics: undefined,
          ...(agent
            ? {
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
              }
            : {}),
        },
      })

      unsubscribe?.()
      setStreaming({ reasoning: '', answer: '' })
      setStreamingFollowUps([])
      const wasStopped = aborted || stoppedByUserRef.current
      const baseContent = response || (wasStopped ? '' : 'No response.')
      const finalContent = wasStopped
        ? `${baseContent}${baseContent ? '\n\n' : ''}_Stopped by user._`
        : baseContent
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: finalContent || '_Stopped by user._',
          reasoning,
          ...(!wasStopped && followUps && followUps.length > 0 ? { followUps } : {}),
        },
      ])
    } catch (e) {
      unsubscribe?.()
      setStreaming({ reasoning: '', answer: '' })
      setStreamingFollowUps([])
      setError(e instanceof Error ? e.message : 'Failed to get response')
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Error: ${e instanceof Error ? e.message : 'Unknown error'}` },
      ])
    } finally {
      setLoading(false)
    }
  }

  const handleSend = () => submitUserText(input.trim(), 'input')

  const canSend =
    !loading &&
    (input.trim().length > 0 || pendingAttachments.length > 0) &&
    !!window.electronAPI?.aiChatStream

  const userName = prefs.userName || prefs.userEmail?.split('@')[0] || 'You'
  const assistantAvatarSrc = activeAgent?.image || aiAvatar

  if (!visible) return null

  return (
    <div className={`ai-chat-bubble ${expanded ? 'ai-chat-bubble--expanded' : ''}`}>
      {expanded ? (
        <div
          className="ai-chat-panel-wrap"
          style={{ width: panelWidth, height: panelHeight }}
        >
        <GlassContainer padding="16px" borderRadius={16} className="ai-chat-panel">
          <div className="ai-chat-header">
            <div className="ai-chat-agent-picker">
              <button
                type="button"
                className="ai-chat-agent-trigger"
                onClick={() => setAgentMenuOpen((o) => !o)}
                aria-haspopup="listbox"
                aria-expanded={agentMenuOpen}
                aria-label="Switch AI agent"
                title="Switch AI agent"
              >
                <span className="ai-chat-agent-trigger__avatar">
                  {activeAgent?.image ? (
                    <img src={activeAgent.image} alt="" />
                  ) : (
                    <img src={aiAvatar} alt="" />
                  )}
                </span>
                <span className="ai-chat-agent-trigger__name">{activeAgent?.name || 'AI Assistant'}</span>
                <ChevronDown size={15} className={`ai-chat-agent-trigger__caret ${agentMenuOpen ? 'ai-chat-agent-trigger__caret--open' : ''}`} />
              </button>
              {agentMenuOpen && (
                <>
                  <div className="ai-chat-agent-menu-backdrop" onClick={() => setAgentMenuOpen(false)} />
                  <ul className="ai-chat-agent-menu" role="listbox" aria-label="Available agents">
                    {selectableAgents.map((agent) => {
                      const selected = agent.id === activeAgent?.id
                      return (
                        <li key={agent.id} role="option" aria-selected={selected}>
                          <button
                            type="button"
                            className={`ai-chat-agent-option ${selected ? 'ai-chat-agent-option--selected' : ''}`}
                            onClick={() => selectAgent(agent.id)}
                          >
                            <span className="ai-chat-agent-option__avatar">
                              {agent.image ? (
                                <img src={agent.image} alt="" />
                              ) : isDefaultAgent(agent) ? (
                                <img src={aiAvatar} alt="" />
                              ) : (
                                <span className="ai-chat-agent-option__initials">{getInitials(agent.name)}</span>
                              )}
                            </span>
                            <span className="ai-chat-agent-option__text">
                              <span className="ai-chat-agent-option__name">{agent.name}</span>
                              {isDefaultAgent(agent) && <span className="ai-chat-agent-option__tag">Default</span>}
                            </span>
                            {selected && <Check size={15} className="ai-chat-agent-option__check" />}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </>
              )}
            </div>
            <div className="ai-chat-header-actions">
              <button
                className="ai-chat-header-btn"
                onClick={() => {
                  setExpanded(false)
                  navigate('/main?tab=chats')
                }}
                aria-label="Open conversations"
                title="Open conversations"
              >
                <MessagesSquare size={18} />
              </button>
              <button
                className="ai-chat-header-btn"
                onClick={handleNewChat}
                aria-label="New chat"
              >
                <MessageSquarePlus size={18} />
              </button>
              <button
                className="ai-chat-header-btn"
                onClick={() => {
                  setLarge((prev) => {
                    const next = !prev
                    if (next) {
                      setPanelWidth(PANEL_LARGE_W)
                      setPanelHeight(PANEL_LARGE_H)
                      persistPanelSize(PANEL_LARGE_W, PANEL_LARGE_H)
                    } else {
                      setPanelWidth(PANEL_DEFAULT_W)
                      setPanelHeight(PANEL_DEFAULT_H)
                      persistPanelSize(PANEL_DEFAULT_W, PANEL_DEFAULT_H)
                    }
                    return next
                  })
                }}
                aria-label={large ? 'Shrink' : 'Expand'}
              >
                {large ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
              </button>
              <button
                className="ai-chat-close"
                onClick={() => setExpanded(false)}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          <div ref={messagesScrollRef} className="ai-chat-messages" aria-busy={loading}>
            {messages.length === 0 && (
              <p className="ai-chat-placeholder">
                Ask about your portfolio, risk metrics, or documents. Attach images, PDFs, or text files with the paperclip. Requires an AI provider (Ollama, Bedrock, or Azure) configured in Settings.
              </p>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`ai-chat-msg-wrap ai-chat-msg-wrap--${msg.role}`}>
                <div className="ai-chat-msg-avatar">
                  {msg.role === 'assistant' ? (
                    <img src={assistantAvatarSrc} alt="AI" className="ai-chat-avatar-img" />
                  ) : (
                    <UserAvatar src={prefs.profilePicturePath} initials={getInitials(userName)} size={28} />
                  )}
                </div>
                <div className={`ai-chat-msg ai-chat-msg--${msg.role}`}>
                  <ChatMessageContent
                    role={msg.role}
                    content={msg.content}
                    attachments={msg.attachments}
                    reasoning={msg.reasoning}
                    followUps={msg.followUps}
                    disabled={loading}
                    onFollowUpClick={(prompt) => submitUserText(prompt.trim(), 'followup')}
                  />
                </div>
              </div>
            ))}
            {loading && (
              <div className="ai-chat-streaming-turn">
                <div className="ai-chat-stream-status-row">
                  <div className="ai-chat-stream-status-spacer" aria-hidden="true" />
                  <div
                    className="ai-chat-stream-status"
                    role="status"
                    aria-live="polite"
                    aria-label={streaming.answer ? 'Assistant is typing' : 'Assistant is thinking'}
                  >
                    <div className="ai-chat-stream-status__bar-track" aria-hidden="true">
                      <div className="ai-chat-stream-status__bar-fill" />
                    </div>
                    <div className="ai-chat-stream-status__row">
                      <span className="ai-chat-typing-dots" aria-hidden="true">
                        <span className="ai-chat-typing-dot" />
                        <span className="ai-chat-typing-dot" />
                        <span className="ai-chat-typing-dot" />
                      </span>
                      <span className="ai-chat-stream-status__label">
                        {streaming.answer ? 'Typing…' : 'Thinking…'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="ai-chat-msg-wrap ai-chat-msg-wrap--assistant">
                  <div className="ai-chat-msg-avatar">
                    <img src={assistantAvatarSrc} alt="AI" className="ai-chat-avatar-img" />
                  </div>
                  <div className="ai-chat-msg ai-chat-msg--assistant">
                    {streaming.reasoning && (
                      <div className="ai-chat-reasoning ai-chat-reasoning--streaming">
                        {streaming.reasoning}
                      </div>
                    )}
                    <div className={streaming.answer ? 'ai-chat-markdown' : 'ai-chat-msg--loading'}>
                      {streaming.answer ? (
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {streaming.answer}
                        </ReactMarkdown>
                      ) : (
                        'Thinking...'
                      )}
                    </div>
                    <FollowUpsRow
                      items={streamingFollowUps}
                      disabled={loading}
                      onPick={(prompt) => submitUserText(prompt.trim(), 'followup')}
                    />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {error && <p className="ai-chat-error">{error}</p>}

          <div className="ai-chat-input-column">
            <input
              ref={fileInputRef}
              type="file"
              className="ai-chat-file-input"
              accept={CHAT_ATTACHMENT_ACCEPT}
              multiple
              aria-hidden="true"
              tabIndex={-1}
              onChange={onAttachmentFilesSelected}
            />
            {pendingAttachments.length > 0 && (
              <div className="ai-chat-pending-files" aria-label="Files to send">
                {pendingAttachments.map((p) => (
                  <div key={p.id} className="ai-chat-pending-chip">
                    {p.objectUrl ? (
                      <img src={p.objectUrl} alt="" className="ai-chat-pending-thumb" />
                    ) : (
                      <span className="ai-chat-pending-name">{p.name}</span>
                    )}
                    <button
                      type="button"
                      className="ai-chat-pending-remove"
                      onClick={() => removePendingAttachment(p.id)}
                      disabled={loading}
                      aria-label={`Remove ${p.name}`}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="ai-chat-input-row">
              <button
                type="button"
                className="ai-chat-attach"
                onClick={() => fileInputRef.current?.click()}
                disabled={
                  loading ||
                  pendingAttachments.length >= MAX_CHAT_ATTACHMENTS ||
                  !window.electronAPI?.aiChatStream
                }
                aria-label="Attach file"
                title="Attach file"
              >
                <Paperclip size={18} />
              </button>
              <textarea
                ref={textareaRef}
                className="ai-chat-input"
                placeholder="Ask a question..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
                disabled={loading}
                rows={1}
              />
              {loading ? (
                <button
                  type="button"
                  className="ai-chat-send ai-chat-send--stop"
                  onClick={handleStop}
                  aria-label="Stop"
                  title="Stop generating"
                >
                  <Square size={16} fill="currentColor" />
                </button>
              ) : (
                <button
                  className="ai-chat-send"
                  onClick={handleSend}
                  disabled={!canSend}
                  aria-label="Send"
                >
                  <Send size={18} />
                </button>
              )}
            </div>
          </div>
        </GlassContainer>
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize chat height from top"
            className="ai-chat-resize ai-chat-resize--n"
            onPointerDown={(e) => startPanelResize('n', e)}
          />
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize chat width from left"
            className="ai-chat-resize ai-chat-resize--w"
            onPointerDown={(e) => startPanelResize('w', e)}
          />
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize chat width from right"
            className="ai-chat-resize ai-chat-resize--e"
            onPointerDown={(e) => startPanelResize('e', e)}
          />
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize chat height from bottom"
            className="ai-chat-resize ai-chat-resize--s"
            onPointerDown={(e) => startPanelResize('s', e)}
          />
          <div
            role="separator"
            aria-label="Resize chat from top-left corner"
            className="ai-chat-resize ai-chat-resize--nw"
            onPointerDown={(e) => startPanelResize('nw', e)}
          />
          <div
            role="separator"
            aria-label="Resize chat from top-right corner"
            className="ai-chat-resize ai-chat-resize--ne"
            onPointerDown={(e) => startPanelResize('ne', e)}
          />
          <div
            role="separator"
            aria-label="Resize chat from bottom-left corner"
            className="ai-chat-resize ai-chat-resize--sw"
            onPointerDown={(e) => startPanelResize('sw', e)}
          />
          <div
            role="separator"
            aria-label="Resize chat from bottom-right corner"
            className="ai-chat-resize ai-chat-resize--se"
            onPointerDown={(e) => startPanelResize('se', e)}
          />
        </div>
      ) : (
        <button
          className="ai-chat-fab"
          onClick={() => setExpanded(true)}
          aria-label="Open AI chat"
        >
          <MessageCircle size={24} />
        </button>
      )}
    </div>
  )
}

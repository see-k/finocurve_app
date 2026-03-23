import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { MessageCircle, X, Send, Maximize2, Minimize2, MessageSquarePlus } from 'lucide-react'
import { usePortfolio } from '../../store/usePortfolio'
import { usePreferences } from '../../store/usePreferences'
import GlassContainer from '../glass/GlassContainer'
import UserAvatar, { getInitials } from '../UserAvatar'
import './AIChatBubble.css'

import aiAvatar from '/images/finocurve-icon.png'

const AUTHENTICATED_PATHS = ['/main', '/asset/', '/loan/', '/risk-analysis', '/news', '/notifications', '/settings/']

function isAuthenticatedPath(path: string): boolean {
  return AUTHENTICATED_PATHS.some((p) => path.startsWith(p))
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  /** Reasoning/thinking from models that support it (o1, o3, llama thinking, etc.) */
  reasoning?: string
}

const PREFS_STORAGE_KEY = 'finocurve-preferences'
const PANEL_SIZE_KEY = 'finocurve-ai-chat-panel-size'
const MAX_PERSISTED_MESSAGES = 200

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
    const raw = localStorage.getItem(storageKey)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (m): m is ChatMessage =>
          !!m &&
          typeof m === 'object' &&
          (m as ChatMessage).role !== undefined &&
          ((m as ChatMessage).role === 'user' || (m as ChatMessage).role === 'assistant') &&
          typeof (m as ChatMessage).content === 'string'
      )
      .map((m) => ({
        role: m.role,
        content: m.content,
        ...(typeof m.reasoning === 'string' && m.reasoning ? { reasoning: m.reasoning } : {}),
      }))
  } catch {
    return []
  }
}

function persistChatMessages(storageKey: string, messages: ChatMessage[]) {
  const trimmed = messages.length > MAX_PERSISTED_MESSAGES ? messages.slice(-MAX_PERSISTED_MESSAGES) : messages
  try {
    localStorage.setItem(storageKey, JSON.stringify(trimmed))
  } catch {
    try {
      localStorage.setItem(storageKey, JSON.stringify(trimmed.slice(-80)))
    } catch {
      /* quota or private mode */
    }
  }
}

export default function AIChatBubble() {
  const location = useLocation()
  const { portfolio, totalValue, totalGainLossPercent } = usePortfolio()
  const { prefs } = usePreferences()
  const chatStorageKey = useMemo(
    () => chatStorageKeyForUser(prefs.userEmail, prefs.isGuest),
    [prefs.userEmail, prefs.isGuest]
  )

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
  const [loading, setLoading] = useState(false)
  const [streaming, setStreaming] = useState<{ reasoning: string; answer: string }>({ reasoning: '', answer: '' })
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const resizeTextarea = () => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, streaming])

  useEffect(() => {
    resizeTextarea()
  }, [input])

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

  const portfolioSummary = portfolio && totalValue > 0
    ? `Portfolio: ${portfolio.name || 'Portfolio'}, ~$${totalValue.toLocaleString()}`
    : undefined

  const handleNewChat = () => {
    setMessages([])
    setInput('')
    setError(null)
    try {
      localStorage.removeItem(chatStorageKey)
    } catch {
      /* ignore */
    }
  }

  const handleSend = async () => {
    const text = input.trim()
    if (!text || loading || !window.electronAPI?.aiChatStream) return

    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content: text }])
    setLoading(true)
    setError(null)
    setStreaming({ reasoning: '', answer: '' })

    const unsubscribe = window.electronAPI?.onAiChatChunk?.((chunk) => {
      setStreaming((prev) =>
        chunk.type === 'reasoning'
          ? { ...prev, reasoning: prev.reasoning + chunk.content }
          : { ...prev, answer: prev.answer + chunk.content }
      )
    })

    try {
      const chatMessages = [...messages, { role: 'user' as const, content: text }].map((m) => ({
        role: m.role,
        content: m.content,
      }))

      const portfolioContext = portfolio && totalValue >= 0
        ? {
            portfolioName: portfolio.name || 'Portfolio',
            totalValue,
            totalGainLossPercent: totalGainLossPercent ?? 0,
            assetCount: portfolio.assets?.length ?? 0,
          }
        : undefined

      const { text: response, reasoning } = await window.electronAPI.aiChatStream({
        messages: chatMessages,
        context: {
          currentRoute: location.pathname,
          portfolioSummary,
          documentCount: undefined,
          portfolioContext,
          riskMetrics: undefined,
        },
      })

      unsubscribe?.()
      setStreaming({ reasoning: '', answer: '' })
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: response || 'No response.', reasoning },
      ])
    } catch (e) {
      unsubscribe?.()
      setStreaming({ reasoning: '', answer: '' })
      setError(e instanceof Error ? e.message : 'Failed to get response')
      setMessages((prev) => [...prev, { role: 'assistant', content: `Error: ${e instanceof Error ? e.message : 'Unknown error'}` }])
    } finally {
      setLoading(false)
    }
  }

  const userName = prefs.userName || prefs.userEmail?.split('@')[0] || 'You'

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
            <span className="ai-chat-title">AI Assistant</span>
            <div className="ai-chat-header-actions">
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

          <div className="ai-chat-messages">
            {messages.length === 0 && (
              <p className="ai-chat-placeholder">
                Ask about your portfolio, risk metrics, or documents. Requires an AI provider (Ollama, Bedrock, or Azure) configured in Settings.
              </p>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`ai-chat-msg-wrap ai-chat-msg-wrap--${msg.role}`}>
                <div className="ai-chat-msg-avatar">
                  {msg.role === 'assistant' ? (
                    <img src={aiAvatar} alt="AI" className="ai-chat-avatar-img" />
                  ) : (
                    <UserAvatar src={prefs.profilePicturePath} initials={getInitials(userName)} size={28} />
                  )}
                </div>
                <div className={`ai-chat-msg ai-chat-msg--${msg.role}`}>
                  {msg.role === 'assistant' ? (
                    <>
                      {msg.reasoning && (
                        <div className="ai-chat-reasoning">
                          {msg.reasoning}
                        </div>
                      )}
                      <div className="ai-chat-markdown">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    </>
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="ai-chat-msg-wrap ai-chat-msg-wrap--assistant">
                <div className="ai-chat-msg-avatar">
                  <img src={aiAvatar} alt="AI" className="ai-chat-avatar-img" />
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
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {error && <p className="ai-chat-error">{error}</p>}

          <div className="ai-chat-input-row">
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
            <button
              className="ai-chat-send"
              onClick={handleSend}
              disabled={loading || !input.trim()}
              aria-label="Send"
            >
              <Send size={18} />
            </button>
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

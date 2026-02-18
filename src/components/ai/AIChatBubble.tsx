import { useState, useRef, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { MessageCircle, X, Send } from 'lucide-react'
import { usePortfolio } from '../../store/usePortfolio'
import GlassContainer from '../glass/GlassContainer'
import './AIChatBubble.css'

const AUTHENTICATED_PATHS = ['/main', '/asset/', '/loan/', '/risk-analysis', '/news', '/notifications', '/settings/']

function isAuthenticatedPath(path: string): boolean {
  return AUTHENTICATED_PATHS.some((p) => path.startsWith(p))
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export default function AIChatBubble() {
  const location = useLocation()
  const { portfolio, totalValue, totalGainLossPercent } = usePortfolio()
  const [expanded, setExpanded] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const visible = isAuthenticatedPath(location.pathname)

  const portfolioSummary = portfolio && totalValue > 0
    ? `Portfolio: ${portfolio.name || 'Portfolio'}, ~$${totalValue.toLocaleString()}`
    : undefined

  const handleSend = async () => {
    const text = input.trim()
    if (!text || loading || !window.electronAPI?.aiChatStream) return

    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content: text }])
    setLoading(true)
    setError(null)

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

      const { text: response } = await window.electronAPI.aiChatStream({
        messages: chatMessages,
        context: {
          currentRoute: location.pathname,
          portfolioSummary,
          documentCount: undefined,
          portfolioContext,
          riskMetrics: undefined,
        },
      })

      setMessages((prev) => [...prev, { role: 'assistant', content: response || 'No response.' }])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to get response')
      setMessages((prev) => [...prev, { role: 'assistant', content: `Error: ${e instanceof Error ? e.message : 'Unknown error'}` }])
    } finally {
      setLoading(false)
    }
  }

  if (!visible) return null

  return (
    <div className={`ai-chat-bubble ${expanded ? 'ai-chat-bubble--expanded' : ''}`}>
      {expanded ? (
        <GlassContainer padding="16px" borderRadius={16} className="ai-chat-panel">
          <div className="ai-chat-header">
            <span className="ai-chat-title">AI Assistant</span>
            <button
              className="ai-chat-close"
              onClick={() => setExpanded(false)}
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>

          <div className="ai-chat-messages">
            {messages.length === 0 && (
              <p className="ai-chat-placeholder">
                Ask about your portfolio, risk metrics, or documents. Requires an AI provider (Ollama, Bedrock, or Azure) configured in Settings.
              </p>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`ai-chat-msg ai-chat-msg--${msg.role}`}>
                {msg.role === 'assistant' ? (
                  <div className="ai-chat-markdown">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  msg.content
                )}
              </div>
            ))}
            {loading && (
              <div className="ai-chat-msg ai-chat-msg--assistant ai-chat-msg--loading">
                Thinking...
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {error && <p className="ai-chat-error">{error}</p>}

          <div className="ai-chat-input-row">
            <input
              type="text"
              className="ai-chat-input"
              placeholder="Ask a question..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
              disabled={loading}
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

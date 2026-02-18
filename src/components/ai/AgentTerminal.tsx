import { useState, useEffect, useRef } from 'react'
import {
  Terminal,
  X,
  Trash2,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Zap,
  AlertCircle,
  CheckCircle,
  Send,
} from 'lucide-react'
import { subscribeToVerbose } from '../../services/a2a'
import type { A2AVerboseEvent } from '../../types/A2A'

interface TerminalLine {
  id: string
  type: A2AVerboseEvent['type']
  timestamp: string
  content: string
  details?: string
  expanded?: boolean
}

interface AgentTerminalProps {
  isOpen: boolean
  onClose: () => void
}

export default function AgentTerminal({ isOpen, onClose }: AgentTerminalProps) {
  const [lines, setLines] = useState<TerminalLine[]>([])
  const [autoScroll, setAutoScroll] = useState(true)
  const terminalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return

    const unsubscribe = subscribeToVerbose((event: A2AVerboseEvent) => {
      const line = formatEvent(event)
      setLines((prev) => [...prev.slice(-500), line])
    })

    return unsubscribe
  }, [isOpen])

  useEffect(() => {
    if (autoScroll && terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight
    }
  }, [lines, autoScroll])

  const formatEvent = (event: A2AVerboseEvent): TerminalLine => {
    const { type, timestamp, data } = event
    const time = new Date(timestamp).toLocaleTimeString()
    let content = ''
    let details = ''

    switch (type) {
      case 'a2a_request':
        content = '[request] Received message/send'
        if (data.userText) {
          details = `User: ${data.userText}`
        }
        break
      case 'a2a_llm_start':
        content = '[llm/start] Calling AI service...'
        break
      case 'a2a_llm_end':
        content = `[llm/end] AI response received (${data.responseLength ?? 0} chars)`
        if (data.responsePreview) {
          details = `Preview:\n${data.responsePreview}`
        }
        break
      case 'a2a_llm_error':
        content = `[llm/error] ${data.error ?? 'Unknown error'}`
        break
      case 'a2a_response':
        content = `[response] Sent to client (${data.responseLength ?? 0} chars)`
        break
      default:
        content = `[${type}] Event`
    }

    return {
      id: `${timestamp}-${Math.random()}`,
      type,
      timestamp: time,
      content,
      details,
      expanded: false,
    }
  }

  const toggleLine = (id: string) => {
    setLines((prev) =>
      prev.map((line) => (line.id === id ? { ...line, expanded: !line.expanded } : line))
    )
  }

  const clearTerminal = () => {
    setLines([])
  }

  const getTypeIcon = (type: TerminalLine['type']) => {
    switch (type) {
      case 'a2a_request':
        return <MessageSquare className="w-3 h-3 text-blue-400" />
      case 'a2a_llm_start':
        return <Zap className="w-3 h-3 text-amber-400" />
      case 'a2a_llm_end':
        return <CheckCircle className="w-3 h-3 text-green-400" />
      case 'a2a_llm_error':
        return <AlertCircle className="w-3 h-3 text-red-400" />
      case 'a2a_response':
        return <Send className="w-3 h-3 text-emerald-400" />
      default:
        return <Terminal className="w-3 h-3 text-gray-400" />
    }
  }

  const getTypeColor = (type: TerminalLine['type']) => {
    switch (type) {
      case 'a2a_request':
        return '#60a5fa'
      case 'a2a_llm_start':
        return '#fbbf24'
      case 'a2a_llm_end':
        return '#4ade80'
      case 'a2a_llm_error':
        return '#f87171'
      case 'a2a_response':
        return '#34d399'
      default:
        return '#9ca3af'
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="agent-terminal-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
      }}
    >
      <div
        className="agent-terminal-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '42rem',
          height: '85vh',
          borderRadius: 16,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          background: '#0d1117',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
            background: '#161b22',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#ef4444' }} />
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#eab308' }} />
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#22c55e' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Terminal className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-mono text-gray-300">A2A Agent Logs</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => setAutoScroll(!autoScroll)}
              style={{
                padding: '4px 8px',
                borderRadius: 4,
                fontSize: 12,
                fontFamily: 'monospace',
                background: autoScroll ? 'rgba(34, 197, 94, 0.2)' : 'rgba(107, 114, 128, 0.2)',
                color: autoScroll ? '#4ade80' : '#9ca3af',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Auto-scroll: {autoScroll ? 'ON' : 'OFF'}
            </button>
            <button
              onClick={clearTerminal}
              style={{
                padding: 6,
                borderRadius: 4,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: '#9ca3af',
              }}
              title="Clear logs"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              style={{
                padding: 6,
                borderRadius: 4,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: '#9ca3af',
              }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Terminal content */}
        <div
          ref={terminalRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 16,
            fontFamily: 'monospace',
            fontSize: 13,
            background: '#0d1117',
          }}
        >
          {lines.length === 0 ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: '#6b7280',
              }}
            >
              <Terminal className="w-12 h-12 mb-3 opacity-30" />
              <p>Waiting for A2A agent activity...</p>
              <p style={{ fontSize: 12, marginTop: 4, opacity: 0.6 }}>
                Logs will appear here when clients send requests
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {lines.map((line) => (
                <div key={line.id}>
                  <div
                    onClick={() => line.details && toggleLine(line.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 8,
                      padding: '4px 8px',
                      borderRadius: 4,
                      cursor: line.details ? 'pointer' : 'default',
                    }}
                  >
                    <span style={{ color: '#6b7280', fontSize: 12, width: 80, flexShrink: 0 }}>
                      {line.timestamp}
                    </span>
                    <span style={{ flexShrink: 0, marginTop: 2 }}>{getTypeIcon(line.type)}</span>
                    <span style={{ color: getTypeColor(line.type) }}>{line.content}</span>
                    {line.details && (
                      <span style={{ marginLeft: 'auto', color: '#6b7280' }}>
                        {line.expanded ? (
                          <ChevronUp className="w-3 h-3" />
                        ) : (
                          <ChevronDown className="w-3 h-3" />
                        )}
                      </span>
                    )}
                  </div>
                  {line.expanded && line.details && (
                    <div
                      style={{
                        marginLeft: 88,
                        paddingLeft: 16,
                        borderLeft: '2px solid #374151',
                        marginBottom: 8,
                      }}
                    >
                      <pre
                        style={{
                          fontSize: 12,
                          color: '#9ca3af',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          padding: '8px 0',
                          margin: 0,
                        }}
                      >
                        {line.details}
                      </pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '8px 16px',
            borderTop: '1px solid rgba(255,255,255,0.1)',
            background: '#161b22',
            fontSize: 12,
            fontFamily: 'monospace',
            color: '#6b7280',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>{lines.length} events</span>
          <span>Click on events with ▼ to expand details</span>
        </div>
      </div>
    </div>
  )
}

/**
 * A2A (Agent-to-Agent) HTTP server.
 * Implements the A2A protocol spec: message/send, tasks/get, well-known agent card.
 * Exposes the AI service via JSON-RPC over HTTP on localhost.
 */

import { createServer, IncomingMessage, ServerResponse } from 'node:http'
import type { Server } from 'node:http'
import type { LocalAIService } from '../src/ai/local/LocalAIService'
import { randomUUID } from 'node:crypto'
import { APP_PACKAGE_VERSION } from './appPackageVersion'

export const DEFAULT_PORT = 3847

// Server state
let serverInstance: Server | null = null
let currentPort: number = DEFAULT_PORT
let isRunning = false

// Task store — keeps completed tasks so clients can query them
const taskStore = new Map<string, A2ATask>()

export type A2AVerboseCallback = (event: {
  type: 'a2a_request' | 'a2a_llm_start' | 'a2a_llm_end' | 'a2a_llm_error' | 'a2a_response'
  timestamp: string
  data: { userText?: string; responseLength?: number; responsePreview?: string; error?: string }
}) => void

export interface A2AStartOptions {
  port?: number
  onVerbose?: A2AVerboseCallback
  /** Build ChatContext for tool use (portfolio, documents, etc.). Uses same context as in-app chat. */
  getAIContext?: () => { portfolioSummary?: string; documentCount?: number; portfolioContext?: unknown; riskMetrics?: string }
}

export interface A2AStartResult {
  success: boolean
  port?: number
  url?: string
  wellKnownUrl?: string
  error?: string
}

export interface A2AStopResult {
  success: boolean
  error?: string
}

export interface A2AServerStatusInfo {
  running: boolean
  port: number
  url: string | null
  wellKnownUrl: string | null
}

// A2A Protocol types
interface A2AMessagePart {
  type?: string
  kind?: string
  text?: string
  data?: unknown
  mimeType?: string
}

interface A2AMessage {
  messageId?: string
  role: string
  kind?: string
  parts?: A2AMessagePart[]
  content?: A2AMessagePart[]
}

interface A2ATask {
  id: string
  contextId: string
  status: {
    state: string // e.g. "TASK_STATE_COMPLETED"
    message?: A2AMessage
  }
  artifacts?: { parts: A2AMessagePart[] }[]
}

/**
 * Build the agent card for /.well-known/agent.json
 */
function buildAgentCard(port: number) {
  return {
    name: 'FinoCurve AI',
    description: 'Financial risk and document analysis assistant',
    protocolVersion: '0.3.0',
    url: `http://127.0.0.1:${port}/`,
    version: APP_PACKAGE_VERSION,
    capabilities: {
      streaming: false,
      pushNotifications: false,
    },
    skills: [
      {
        id: 'financial-analysis',
        name: 'Financial Analysis',
        description: 'Analyze financial documents, assess risk, provide portfolio insights, and answer questions about finance',
      },
    ],
    defaultInputModes: ['text'],
    defaultOutputModes: ['text'],
    supportsAuthenticatedExtendedCard: false,
  }
}

/**
 * Extract text from A2A message parts (handles both 'type' and 'kind' fields)
 */
function extractTextFromParts(parts: A2AMessagePart[]): string {
  return parts
    .filter((p) => (p.type === 'text' || p.kind === 'text') && p.text)
    .map((p) => p.text!)
    .join('\n')
}

/**
 * Start the A2A server on the given port.
 */
export function startA2AServer(
  getAIService: () => LocalAIService,
  options?: A2AStartOptions,
): Promise<A2AStartResult> {
  return new Promise((resolve) => {
    if (isRunning) {
      resolve({ success: false, error: 'Server is already running', port: currentPort })
      return
    }

    const port = options?.port ?? DEFAULT_PORT
    const onVerbose = options?.onVerbose
    const getAIContext = options?.getAIContext
    currentPort = port

    const emit = (type: Parameters<NonNullable<typeof onVerbose>>[0]['type'], data: Record<string, unknown>) => {
      onVerbose?.({ type, timestamp: new Date().toISOString(), data })
    }

    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      // CORS headers — must be set on every response including preflight
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, X-Requested-With')
      res.setHeader('Access-Control-Max-Age', '86400')

      if (req.method === 'OPTIONS') {
        res.writeHead(200)
        res.end()
        return
      }

      // GET /.well-known/agent.json or agent-card.json — A2A discovery endpoint
      const isAgentCard = req.method === 'GET' && (req.url === '/.well-known/agent.json' || req.url === '/.well-known/agent-card.json')
      if (isAgentCard) {
        const agentCard = buildAgentCard(port)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(agentCard, null, 2))
        return
      }

      // All other routes expect POST with JSON-RPC 2.0
      if (req.method !== 'POST') {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Not found' }))
        return
      }

      let body = ''
      for await (const chunk of req) {
        body += chunk
      }

      let parsed: { jsonrpc?: string; method?: string; params?: any; id?: any }
      try {
        parsed = JSON.parse(body)
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' }, id: null }))
        return
      }

      if (parsed.jsonrpc !== '2.0') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32600, message: 'Invalid Request' }, id: parsed.id }))
        return
      }

      const service = getAIService()
      const sendJson = (result: unknown) => {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ jsonrpc: '2.0', result, id: parsed.id }))
      }
      const sendError = (code: number, message: string) => {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id: parsed.id }))
      }

      try {
        switch (parsed.method) {
          // ===== A2A Protocol: message/send =====
          case 'message/send': {
            const params = parsed.params ?? {}
            const userMessage: A2AMessage = params.message

            if (!userMessage || !userMessage.parts) {
              sendError(-32602, 'Invalid params: message with parts is required')
              return
            }

            const userText = extractTextFromParts(userMessage.parts)

            if (!userText.trim()) {
              sendError(-32602, 'No text content found in message parts')
              return
            }

            emit('a2a_request', { userText })

            // Build chat messages for the AI service
            const chatMessages: { role: 'user' | 'assistant' | 'system'; content: string }[] = [
              { role: 'user', content: userText },
            ]

            emit('a2a_llm_start', {})
            let responseText: string
            const chatContext = getAIContext?.() ?? {}
            try {
              const answerParts: string[] = []
              for await (const chunk of service.chat(chatMessages, chatContext)) {
                if (chunk.type === 'answer') answerParts.push(chunk.content)
              }
              responseText = answerParts.join('')
              emit('a2a_llm_end', {
                responseLength: responseText.length,
                responsePreview: responseText.slice(0, 200) + (responseText.length > 200 ? '...' : ''),
              })
            } catch (chatErr) {
              const errMsg = chatErr instanceof Error ? chatErr.message : 'Unknown error'
              emit('a2a_llm_error', { error: errMsg })
              sendError(-32603, `AI service error: ${errMsg}`)
              return
            }

            if (!responseText) {
              responseText = 'I apologize, but I was unable to generate a response. Please try again.'
            }

            // A2A spec: JSON-RPC result must be the Message or Task object DIRECTLY, not wrapped.
            // Clients expect result.parts (Message) or result.artifacts (Task) at top level.
            // Using direct Message format (like synexura) for immediate sync responses.
            const contextId = params.message?.contextId || randomUUID()
            const responseMessage = {
              kind: 'message' as const,
              messageId: randomUUID(),
              contextId,
              parts: [{ kind: 'text' as const, text: responseText }],
              metadata: {},
            }

            emit('a2a_response', { responseLength: responseText.length })
            sendJson(responseMessage)
            return
          }

          // ===== A2A Protocol: tasks/get =====
          case 'tasks/get': {
            const taskId = parsed.params?.id
            if (!taskId) {
              sendError(-32602, 'Invalid params: task id is required')
              return
            }
            const task = taskStore.get(taskId)
            if (!task) {
              sendError(-32602, `Task not found: ${taskId}`)
              return
            }
            sendJson(task)
            return
          }

          // ===== A2A Protocol: tasks/cancel =====
          case 'tasks/cancel': {
            sendError(-32601, 'Task cancellation is not supported')
            return
          }

          // ===== Legacy: chat (for backwards compatibility) =====
          case 'a2a/chat':
          case 'chat': {
            const params = parsed.params as { messages?: { role: 'user' | 'assistant' | 'system'; content: string }[]; context?: unknown }
            const messages = params?.messages ?? []
            const context = params?.context ?? {}
            const answerParts: string[] = []
            for await (const chunk of service.chat(messages, context)) {
              if (chunk.type === 'answer') answerParts.push(chunk.content)
            }
            sendJson({ text: answerParts.join('') })
            return
          }

          // ===== Legacy: capabilities =====
          case 'a2a/capabilities':
          case 'capabilities': {
            const tools = service.getTools()
            sendJson({
              name: 'FinoCurve AI',
              description: 'Financial risk and document analysis assistant',
              capabilities: { tools },
            })
            return
          }

          default:
            sendError(-32601, `Method not found: ${parsed.method}`)
        }
      } catch (err) {
        emit('a2a_llm_error', { error: err instanceof Error ? err.message : 'Internal error' })
        sendError(-32603, err instanceof Error ? err.message : 'Internal error')
      }
    })

    server.listen(port, '127.0.0.1', () => {
      isRunning = true
      serverInstance = server
      resolve({
        success: true,
        port,
        url: `http://127.0.0.1:${port}/`,
        wellKnownUrl: `http://127.0.0.1:${port}/.well-known/agent.json`,
      })
    })

    server.on('error', (error: NodeJS.ErrnoException) => {
      isRunning = false
      serverInstance = null
      if (error.code === 'EADDRINUSE') {
        resolve({ success: false, error: `Port ${port} is already in use. Please choose a different port.` })
      } else {
        resolve({ success: false, error: error.message || 'Failed to start server' })
      }
    })
  })
}

/**
 * Stop the A2A server.
 */
export function stopA2AServer(): Promise<A2AStopResult> {
  return new Promise((resolve) => {
    if (!isRunning || !serverInstance) {
      resolve({ success: false, error: 'Server is not running' })
      return
    }

    serverInstance.close((error) => {
      if (error) {
        resolve({ success: false, error: error.message || 'Failed to stop server' })
      } else {
        isRunning = false
        serverInstance = null
        taskStore.clear()
        resolve({ success: true })
      }
    })
  })
}

/**
 * Get the current A2A server status.
 */
export function getA2AServerStatus(): A2AServerStatusInfo {
  return {
    running: isRunning,
    port: currentPort,
    url: isRunning ? `http://127.0.0.1:${currentPort}/` : null,
    wellKnownUrl: isRunning ? `http://127.0.0.1:${currentPort}/.well-known/agent.json` : null,
  }
}

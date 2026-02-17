/**
 * Minimal A2A (Agent-to-Agent) HTTP server.
 * Exposes the AI service via JSON-RPC over HTTP on localhost.
 * Enable with AI_ENABLE_A2A=true.
 */

import { createServer, IncomingMessage, ServerResponse } from 'node:http'
import type { LocalAIService } from '../src/ai/local/LocalAIService'

const A2A_PORT = parseInt(process.env.A2A_PORT || '3847', 10)

let serverInstance: ReturnType<typeof createServer> | null = null

export function startA2AServer(getAIService: () => LocalAIService): void {
  if (serverInstance) return

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== 'POST' || req.url !== '/') {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Not found' }))
      return
    }

    let body = ''
    for await (const chunk of req) {
      body += chunk
    }

    let parsed: { jsonrpc?: string; method?: string; params?: unknown; id?: unknown }
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

    try {
      if (parsed.method === 'a2a/chat' || parsed.method === 'chat') {
        const params = parsed.params as { messages?: { role: string; content: string }[]; context?: unknown }
        const messages = params?.messages ?? []
        const context = params?.context ?? {}
        const chunks: string[] = []
        for await (const chunk of service.chat(messages, context)) {
          chunks.push(chunk)
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ jsonrpc: '2.0', result: { text: chunks.join('') }, id: parsed.id }))
        return
      }

      if (parsed.method === 'a2a/capabilities' || parsed.method === 'capabilities') {
        const tools = service.getTools()
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          result: {
            name: 'FinoCurve AI',
            description: 'Financial risk and document analysis assistant',
            capabilities: { tools },
          },
          id: parsed.id,
        }))
        return
      }

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32601, message: `Method not found: ${parsed.method}` },
        id: parsed.id,
      }))
    } catch (err) {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32603, message: err instanceof Error ? err.message : 'Internal error' },
        id: parsed.id,
      }))
    }
  })

  server.listen(A2A_PORT, '127.0.0.1', () => {
    console.log(`[A2A] Server listening on http://127.0.0.1:${A2A_PORT}`)
  })

  serverInstance = server
}

export function stopA2AServer(): void {
  if (serverInstance) {
    serverInstance.close()
    serverInstance = null
    console.log('[A2A] Server stopped')
  }
}

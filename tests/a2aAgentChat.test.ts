import { describe, expect, it } from 'vitest'
import {
  buildA2APrompt,
  parseA2AAgentConfig,
  resolveA2AEndpoint,
  streamA2AAgentChat,
  testA2AAgentConnection,
  type A2AFetch,
} from '../src/ai/a2aAgentChat'
import type { ChatMessage, ChatStreamChunk } from '../src/ai/types'

const BASE = 'http://127.0.0.1:47821'

/** Hermes Glass's published card, trimmed to what the client reads. */
const hermesCard = {
  name: 'Hermes Glass',
  url: `${BASE}/a2a`,
  capabilities: { streaming: true },
  skills: [
    { id: 'home', name: 'Kros' },
    { id: 'profile:atlas', name: 'Atlas', description: 'Talk to Atlas (Hermes gateway).' },
  ],
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function sse(events: unknown[]): Response {
  const body = events.map((event) => `data: ${JSON.stringify({ jsonrpc: '2.0', id: 1, result: event })}\n\n`).join('')
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

interface Call { url: string; method?: string; rpc?: string; body?: Record<string, unknown>; auth?: string }

function fakeFetch(handler: (call: Call) => Response): { fetch: A2AFetch; calls: Call[] } {
  const calls: Call[] = []
  const fetchFn: A2AFetch = async (url, init) => {
    const body = typeof init.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : undefined
    const headers = (init.headers ?? {}) as Record<string, string>
    const call: Call = {
      url,
      method: init.method,
      rpc: typeof body?.method === 'string' ? body.method : undefined,
      body,
      auth: headers.Authorization,
    }
    calls.push(call)
    return handler(call)
  }
  return { fetch: fetchFn, calls }
}

async function collect(stream: AsyncGenerator<ChatStreamChunk>): Promise<ChatStreamChunk[]> {
  const chunks: ChatStreamChunk[] = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

function answerText(chunks: ChatStreamChunk[]): string {
  return chunks.filter((chunk) => chunk.type === 'answer').map((chunk) => (chunk as { content: string }).content).join('')
}

const userTurn: ChatMessage[] = [{ role: 'user', content: 'What is my largest position?' }]

describe('parseA2AAgentConfig', () => {
  it('requires a URL and drops empty optional fields', () => {
    expect(parseA2AAgentConfig({ a2aToken: 'x' })).toBeNull()
    expect(parseA2AAgentConfig({ a2aUrl: ` ${BASE} `, a2aToken: ' ', a2aAgentId: 'profile:atlas' }))
      .toEqual({ url: BASE, agentId: 'profile:atlas' })
  })
})

describe('resolveA2AEndpoint', () => {
  it('uses the card URL on the same origin', () => {
    expect(resolveA2AEndpoint({ url: BASE, token: 't' }, { name: 'x', streaming: true, skills: [], url: `${BASE}/a2a` }))
      .toBe(`${BASE}/a2a`)
  })

  it('refuses to send a token to a card URL on another origin', () => {
    expect(() => resolveA2AEndpoint(
      { url: BASE, token: 't' },
      { name: 'x', streaming: true, skills: [], url: 'https://elsewhere.example/a2a' },
    )).toThrow(/different server/)
  })

  it('falls back to the entered URL without a card', () => {
    expect(resolveA2AEndpoint({ url: `${BASE}/a2a/` }, null)).toBe(`${BASE}/a2a`)
  })
})

describe('buildA2APrompt', () => {
  it('sends a lone first message as-is', () => {
    expect(buildA2APrompt({ expertName: 'Atlas', messages: userTurn })).toBe('What is my largest position?')
  })

  it('carries recent history and group context', () => {
    const prompt = buildA2APrompt({
      expertName: 'Atlas',
      messages: [
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello there' },
        { role: 'user', content: 'Thoughts on NVDA?' },
      ],
      groupChat: { participantNames: ['Atlas', 'Athena'], directlyAddressed: true },
    })
    expect(prompt).toContain('You are Atlas in a FinoCurve group chat with Athena.')
    expect(prompt).toContain('User: Hi\nHello there')
    expect(prompt).toContain('Latest message from the user:\nThoughts on NVDA?')
  })
})

describe('buildA2APrompt (resumed)', () => {
  it('sends peers\' new messages without re-introducing the group', () => {
    const prompt = buildA2APrompt({
      expertName: 'Atlas',
      resumed: true,
      messages: [
        { role: 'user', content: 'Compare our views.' },
        { role: 'assistant', content: '[Athena]: I think rates fall.' },
        { role: 'user', content: 'Continue the discussion naturally.' },
      ],
      groupChat: { participantNames: ['Atlas', 'Athena'], directlyAddressed: false },
    })
    expect(prompt).not.toContain('You are Atlas')
    expect(prompt).toContain('New FinoCurve messages since your last reply:')
    expect(prompt).toContain('[Athena]: I think rates fall.')
  })
})

describe('testA2AAgentConnection', () => {
  it('lists the gateway agents and validates the token without starting a run', async () => {
    const { fetch, calls } = fakeFetch((call) => {
      if (call.url.endsWith('/.well-known/agent-card.json')) return json(hermesCard)
      return json({ jsonrpc: '2.0', id: 1, error: { code: -32001, message: 'Task not found.' } })
    })
    const result = await testA2AAgentConnection({ url: BASE, token: 'secret', agentId: 'profile:atlas' }, fetch)
    expect(result).toMatchObject({ ok: true, agentName: 'Hermes Glass' })
    expect(result.agents?.map((agent) => agent.id)).toEqual(['home', 'profile:atlas'])
    const rpc = calls.find((call) => call.rpc)
    expect(rpc).toMatchObject({ url: `${BASE}/a2a`, rpc: 'tasks/get', auth: 'Bearer secret' })
  })

  it('reports a rejected token', async () => {
    const { fetch } = fakeFetch((call) => (
      call.url.endsWith('/.well-known/agent-card.json')
        ? json(hermesCard)
        : json({ error: { message: 'Missing or wrong bearer token.' } }, 401)
    ))
    const result = await testA2AAgentConnection({ url: BASE, token: 'wrong' }, fetch)
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/rejected the bearer token/)
  })

  it('flags an agent id the gateway does not list', async () => {
    const { fetch } = fakeFetch((call) => (
      call.url.endsWith('/.well-known/agent-card.json') ? json(hermesCard) : json({ jsonrpc: '2.0', id: 1, result: {} })
    ))
    const result = await testA2AAgentConnection({ url: BASE, agentId: 'profile:nope' }, fetch)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('profile:nope')
  })
})

describe('streamA2AAgentChat', () => {
  it('streams artifact appends from message/stream and selects the agent via metadata', async () => {
    const { fetch, calls } = fakeFetch((call) => {
      if (call.url.endsWith('/.well-known/agent-card.json')) return json(hermesCard)
      return sse([
        { kind: 'task', id: 'run_1', contextId: 'c1', status: { state: 'working' } },
        { kind: 'artifact-update', taskId: 'run_1', append: false, artifact: { artifactId: 'reply', parts: [{ kind: 'text', text: 'Your largest' }] } },
        { kind: 'artifact-update', taskId: 'run_1', append: true, artifact: { artifactId: 'reply', parts: [{ kind: 'text', text: ' is NVDA.' }] } },
        { kind: 'status-update', taskId: 'run_1', final: true, status: { state: 'completed' } },
      ])
    })
    const chunks = await collect(streamA2AAgentChat({
      config: { url: BASE, token: 'secret', agentId: 'profile:atlas' },
      expertName: 'Atlas',
      messages: userTurn,
      fetch,
    }))
    expect(answerText(chunks)).toBe('Your largest is NVDA.')
    const stream = calls.find((call) => call.rpc === 'message/stream')!
    const message = (stream.body!.params as { message: Record<string, unknown> }).message
    expect(message.metadata).toEqual({ agent: 'profile:atlas' })
    expect(message.parts).toEqual([{ kind: 'text', text: 'What is my largest position?' }])
    expect(stream.auth).toBe('Bearer secret')
  })

  it('reports the server session id once', async () => {
    const { fetch } = fakeFetch((call) => (
      call.url.endsWith('/.well-known/agent-card.json') ? json(hermesCard) : sse([
        { kind: 'task', id: 'run_1', contextId: 'hg_ctx', status: { state: 'working' } },
        { kind: 'artifact-update', taskId: 'run_1', contextId: 'hg_ctx', artifact: { artifactId: 'reply', parts: [{ kind: 'text', text: 'OK' }] } },
        { kind: 'status-update', taskId: 'run_1', contextId: 'hg_ctx', final: true, status: { state: 'completed' } },
      ])
    ))
    const chunks = await collect(streamA2AAgentChat({ config: { url: BASE }, expertName: 'Atlas', messages: userTurn, fetch }))
    expect(chunks.filter((chunk) => chunk.type === 'session')).toEqual([{ type: 'session', contextId: 'hg_ctx' }])
  })

  it('continues a session with only the messages the agent has not seen', async () => {
    const { fetch, calls } = fakeFetch((call) => (
      call.url.endsWith('/.well-known/agent-card.json') ? json(hermesCard) : sse([
        { kind: 'artifact-update', taskId: 't', contextId: 'hg_ctx', artifact: { artifactId: 'a', parts: [{ kind: 'text', text: 'Sure.' }] } },
        { kind: 'status-update', taskId: 't', contextId: 'hg_ctx', final: true, status: { state: 'completed' } },
      ])
    ))
    await collect(streamA2AAgentChat({
      config: { url: BASE, agentId: 'profile:atlas' },
      expertName: 'Atlas',
      messages: [
        { role: 'user', content: 'Old question' },
        { role: 'assistant', content: 'Old answer from Atlas' },
        { role: 'user', content: 'And now?' },
      ],
      session: { contextId: 'hg_ctx', newMessageCount: 1 },
      fetch,
    }))
    const message = (calls.find((call) => call.rpc === 'message/stream')!.body!.params as { message: Record<string, unknown> }).message
    expect(message.contextId).toBe('hg_ctx')
    expect(message.parts).toEqual([{ kind: 'text', text: 'And now?' }])
  })

  it('turns a replaced snapshot into a delta', async () => {
    const { fetch } = fakeFetch((call) => (
      call.url.endsWith('/.well-known/agent-card.json') ? json(hermesCard) : sse([
        { kind: 'artifact-update', taskId: 't', artifact: { artifactId: 'a', parts: [{ kind: 'text', text: 'Hel' }] } },
        { kind: 'artifact-update', taskId: 't', artifact: { artifactId: 'a', parts: [{ kind: 'text', text: 'Hello' }] } },
        { kind: 'status-update', taskId: 't', final: true, status: { state: 'completed' } },
      ])
    ))
    const chunks = await collect(streamA2AAgentChat({ config: { url: BASE }, expertName: 'Atlas', messages: userTurn, fetch }))
    expect(chunks.filter((chunk) => chunk.type === 'answer').map((chunk) => (chunk as { content: string }).content))
      .toEqual(['Hel', 'lo'])
  })

  it('surfaces an approval pause and polls tasks/get until the task finishes', async () => {
    let polls = 0
    const { fetch, calls } = fakeFetch((call) => {
      if (call.url.endsWith('/.well-known/agent-card.json')) return json(hermesCard)
      if (call.rpc === 'message/stream') {
        return sse([
          { kind: 'task', id: 'run_2', status: { state: 'working' } },
          {
            kind: 'status-update',
            taskId: 'run_2',
            final: true,
            status: { state: 'input-required', message: { parts: [{ kind: 'text', text: 'Run `rm -rf build`?' }] } },
          },
        ])
      }
      polls += 1
      return json({
        jsonrpc: '2.0',
        id: 1,
        result: polls < 2
          ? { kind: 'task', id: 'run_2', status: { state: 'input-required', message: { parts: [{ kind: 'text', text: 'Run `rm -rf build`?' }] } } }
          : { kind: 'task', id: 'run_2', status: { state: 'completed' }, artifacts: [{ artifactId: 'reply', parts: [{ kind: 'text', text: 'Done.' }] }] },
      })
    })
    const chunks = await collect(streamA2AAgentChat({
      config: { url: BASE, agentId: 'profile:atlas' },
      expertName: 'Atlas',
      messages: userTurn,
      fetch,
      sleep: async () => {},
    }))
    const text = answerText(chunks)
    expect(text.match(/waiting for approval/g)).toHaveLength(1)
    expect(text).toContain('Run `rm -rf build`?')
    expect(text.endsWith('Done.')).toBe(true)
    expect(calls.filter((call) => call.rpc === 'tasks/get')).toHaveLength(2)
  })

  it('throws the agent message when the task fails', async () => {
    const { fetch } = fakeFetch((call) => (
      call.url.endsWith('/.well-known/agent-card.json') ? json(hermesCard) : sse([
        { kind: 'status-update', taskId: 't', final: true, status: { state: 'failed', message: { parts: [{ kind: 'text', text: 'Gateway offline' }] } } },
      ])
    ))
    await expect(collect(streamA2AAgentChat({ config: { url: BASE }, expertName: 'Atlas', messages: userTurn, fetch })))
      .rejects.toThrow('Atlas failed: Gateway offline')
  })

  it('falls back to message/send when the card does not stream', async () => {
    const { fetch, calls } = fakeFetch((call) => {
      if (call.url.endsWith('/.well-known/agent-card.json')) {
        return json({ ...hermesCard, capabilities: { streaming: false } })
      }
      return json({ jsonrpc: '2.0', id: 1, result: { kind: 'message', messageId: 'm1', role: 'agent', parts: [{ kind: 'text', text: 'OK' }] } })
    })
    const chunks = await collect(streamA2AAgentChat({ config: { url: BASE }, expertName: 'Atlas', messages: userTurn, fetch }))
    expect(answerText(chunks)).toBe('OK')
    expect(calls.some((call) => call.rpc === 'message/send')).toBe(true)
  })

  it('cancels the remote task when the user stops the reply', async () => {
    const controller = new AbortController()
    const { fetch, calls } = fakeFetch((call) => {
      if (call.url.endsWith('/.well-known/agent-card.json')) return json(hermesCard)
      if (call.rpc === 'tasks/cancel') return json({ jsonrpc: '2.0', id: 1, result: {} })
      return sse([
        { kind: 'task', id: 'run_3', status: { state: 'working' } },
        { kind: 'artifact-update', taskId: 'run_3', artifact: { artifactId: 'reply', parts: [{ kind: 'text', text: 'Partial' }] } },
      ])
    })
    const stream = streamA2AAgentChat({ config: { url: BASE }, expertName: 'Atlas', messages: userTurn, fetch, signal: controller.signal })
    await expect((async () => {
      for await (const chunk of stream) {
        if (chunk.type === 'answer') controller.abort()
      }
    })()).rejects.toMatchObject({ name: 'AbortError' })
    expect(calls.find((call) => call.rpc === 'tasks/cancel')?.body?.params).toEqual({ id: 'run_3' })
  })
})

/**
 * A2A (Agent2Agent) expert wrapper. Sends each FinoCurve turn to a remote A2A
 * agent over JSON-RPC (`message/stream`, falling back to `message/send`) and
 * streams its artifact updates back. Gateways that front several agents, such
 * as Hermes Glass, pick one with message metadata `{ agent: <id> }`; the ids are
 * the skills listed on the gateway's agent card.
 */
import type { ChatContext, ChatMessage, ChatStreamChunk } from './types'

export const A2A_MODEL_LABEL = 'A2A agent'

const MAX_TRANSCRIPT_CHARS = 3200
const REQUEST_TIMEOUT_MS = 30_000
const DEFAULT_TIMEOUT_MS = 900_000
const DEFAULT_POLL_MS = 2_000
const MAX_POLL_MS = 10_000
const CARD_PATHS = ['/.well-known/agent-card.json', '/.well-known/agent.json'] as const
const TERMINAL_STATES = new Set(['completed', 'failed', 'canceled', 'cancelled', 'rejected'])
/** States where the remote agent is paused on someone else (e.g. a command approval). */
const WAITING_STATES = new Set(['input-required', 'auth-required'])

export interface A2AAgentConfig {
  /** Base URL, agent card URL, or JSON-RPC endpoint of the A2A server. */
  url: string
  /** Bearer token, when the server's card declares one. */
  token?: string
  /** Agent selector sent as `message.metadata.agent` (a skill id on multi-agent gateways). */
  agentId?: string
}

export interface A2AAgentSkill {
  id: string
  name: string
  description?: string
}

export interface A2AAgentCard {
  name: string
  description?: string
  url?: string
  streaming: boolean
  skills: A2AAgentSkill[]
}

export type A2AFetch = (url: string, init: RequestInit) => Promise<Response>

export interface A2AStreamOptions {
  config: A2AAgentConfig
  expertName: string
  messages: ChatMessage[]
  groupChat?: ChatContext['groupChat']
  /** Continue this remote session; only the trailing unseen messages are sent. */
  session?: ChatContext['a2aSession']
  signal?: AbortSignal
  timeoutMs?: number
  pollMs?: number
  now?: () => number
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
  fetch?: A2AFetch
}

function abortError(): Error {
  const error = new Error('Aborted')
  error.name = 'AbortError'
  return error
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError()
}

async function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal)
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(abortError())
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export function parseA2AAgentConfig(persona: {
  a2aUrl?: string
  a2aToken?: string
  a2aAgentId?: string
} | undefined): A2AAgentConfig | null {
  const url = persona?.a2aUrl?.trim() || ''
  if (!url) return null
  const token = persona?.a2aToken?.trim()
  const agentId = persona?.a2aAgentId?.trim()
  return {
    url,
    ...(token ? { token } : {}),
    ...(agentId ? { agentId } : {}),
  }
}

function parseUrl(value: string): URL {
  let parsed: URL
  try {
    parsed = new URL(value.trim())
  } catch {
    throw new Error('Enter the A2A server URL, e.g. http://127.0.0.1:47821.')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('A2A server URL must start with http:// or https://.')
  }
  return parsed
}

function authHeaders(token: string | undefined): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function timedFetch(
  fetchFn: A2AFetch,
  url: string,
  init: RequestInit,
  signal: AbortSignal | undefined,
  timeoutMs: number | null,
): Promise<Response> {
  throwIfAborted(signal)
  const controller = new AbortController()
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort, { once: true })
  const timer = timeoutMs == null ? null : setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetchFn(url, { ...init, signal: controller.signal })
  } catch (error) {
    if (signal?.aborted) throw abortError()
    if (controller.signal.aborted) throw new Error('The A2A server did not respond in time.')
    throw error
  } finally {
    if (timer) clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

function httpErrorMessage(status: number, body: string): string {
  if (status === 401 || status === 403) {
    return 'The A2A server rejected the bearer token. Copy it again from the server (Hermes Glass: Settings, Channels).'
  }
  let detail = ''
  try {
    const parsed = JSON.parse(body) as { error?: { message?: unknown } | string }
    const error = parsed.error
    detail = typeof error === 'string' ? error : typeof error?.message === 'string' ? error.message : ''
  } catch {
    detail = body.slice(0, 200)
  }
  return `A2A server returned HTTP ${status}${detail ? `: ${detail}` : ''}`
}

function normalizeCard(raw: unknown): A2AAgentCard | null {
  if (!raw || typeof raw !== 'object') return null
  const card = raw as Record<string, unknown>
  if (typeof card.name !== 'string') return null
  const capabilities = (card.capabilities && typeof card.capabilities === 'object'
    ? card.capabilities
    : {}) as Record<string, unknown>
  const skills = (Array.isArray(card.skills) ? card.skills : [])
    .filter((skill): skill is Record<string, unknown> => !!skill && typeof skill === 'object')
    .filter((skill) => typeof skill.id === 'string' && skill.id)
    .map((skill) => ({
      id: skill.id as string,
      name: typeof skill.name === 'string' && skill.name ? skill.name : skill.id as string,
      ...(typeof skill.description === 'string' && skill.description ? { description: skill.description } : {}),
    }))
  return {
    name: card.name,
    ...(typeof card.description === 'string' ? { description: card.description } : {}),
    ...(typeof card.url === 'string' && card.url ? { url: card.url } : {}),
    streaming: capabilities.streaming === true,
    skills,
  }
}

function cardCandidates(base: URL): string[] {
  const candidates: string[] = []
  const push = (value: string) => { if (!candidates.includes(value)) candidates.push(value) }
  if (/\.json$/i.test(base.pathname)) push(base.href)
  const path = base.pathname.replace(/\/+$/, '')
  if (path && !/\.json$/i.test(path)) {
    for (const suffix of CARD_PATHS) push(`${base.origin}${path}${suffix}`)
  }
  for (const suffix of CARD_PATHS) push(`${base.origin}${suffix}`)
  return candidates
}

/** Agent card for the configured server, or null when none is published. */
export async function fetchA2AAgentCard(
  config: Pick<A2AAgentConfig, 'url' | 'token'>,
  options: { fetch?: A2AFetch; signal?: AbortSignal } = {},
): Promise<A2AAgentCard | null> {
  const fetchFn = options.fetch ?? fetch
  const base = parseUrl(config.url)
  for (const candidate of cardCandidates(base)) {
    try {
      const response = await timedFetch(fetchFn, candidate, {
        method: 'GET',
        headers: { Accept: 'application/json', ...authHeaders(config.token) },
      }, options.signal, REQUEST_TIMEOUT_MS)
      if (!response.ok) continue
      const card = normalizeCard(await response.json())
      if (card) return card
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') throw error
      // Try the next well-known location.
    }
  }
  return null
}

/**
 * JSON-RPC endpoint for this expert. The card's `url` wins, but a bearer token
 * never follows it to a different origin than the one the user entered.
 */
export function resolveA2AEndpoint(config: Pick<A2AAgentConfig, 'url' | 'token'>, card: A2AAgentCard | null): string {
  const base = parseUrl(config.url)
  const fallback = /\.json$/i.test(base.pathname) || base.pathname.includes('/.well-known/')
    ? base.origin
    : base.href.replace(/\/+$/, '')
  if (!card?.url) return fallback
  let target: URL
  try {
    target = new URL(card.url, base)
  } catch {
    return fallback
  }
  if (config.token && target.origin !== base.origin) {
    throw new Error(
      `The agent card points to ${target.origin}, a different server than ${base.origin}. ` +
      'Enter that JSON-RPC endpoint directly so the bearer token is only sent where you intend.',
    )
  }
  return target.href
}

function textFromParts(parts: unknown): string {
  if (!Array.isArray(parts)) return ''
  return parts
    .map((part) => {
      if (!part || typeof part !== 'object') return ''
      const item = part as Record<string, unknown>
      const kind = item.kind ?? item.type
      if ((kind === 'text' || kind === undefined) && typeof item.text === 'string') return item.text
      return ''
    })
    .join('')
}

function statusText(status: unknown): string {
  if (!status || typeof status !== 'object') return ''
  const message = (status as { message?: { parts?: unknown } }).message
  return textFromParts(message?.parts).trim()
}

function statusState(status: unknown): string {
  if (!status || typeof status !== 'object') return ''
  const state = (status as { state?: unknown }).state
  // Some servers use the proto enum spelling (TASK_STATE_INPUT_REQUIRED).
  return typeof state === 'string'
    ? state.toLowerCase().replace(/^task_state_/, '').replace(/_/g, '-')
    : ''
}

function trimTranscript(lines: string[]): string {
  let text = lines.join('\n')
  if (text.length <= MAX_TRANSCRIPT_CHARS) return text
  text = text.slice(text.length - MAX_TRANSCRIPT_CHARS)
  const newline = text.indexOf('\n')
  return (newline >= 0 ? text.slice(newline + 1) : text).trim()
}

/**
 * FinoCurve turn sent as the A2A message text. A new session carries recent
 * history; a resumed one (`resumed`) carries only the messages the agent has not
 * seen, since the remote agent already holds the rest.
 */
export function buildA2APrompt(input: {
  expertName: string
  messages: ChatMessage[]
  groupChat?: ChatContext['groupChat']
  resumed?: boolean
}): string {
  const history = input.messages.filter((message) => message.role !== 'system')
  const latest = [...history].reverse().find((message) => message.role === 'user')
  const latestText = latest?.content.trim() || ''
  const prior = latest ? history.slice(0, history.lastIndexOf(latest)) : history
  const isGroup = !!input.groupChat?.participantNames.length
  const hasPrior = prior.some((message) => message.content.trim())
  const attachmentNames = [...new Set(
    input.messages.flatMap((message) => message.attachments ?? []).map((file) => file.name),
  )]
  const attachmentNote = attachmentNames.length
    ? `The user attached ${attachmentNames.length === 1 ? 'a file' : 'files'} in FinoCurve that could not be ` +
      `forwarded: ${attachmentNames.join(', ')}. Say so if the answer depends on their contents.`
    : ''

  if (!isGroup && !hasPrior && !attachmentNote) return latestText

  const parts: string[] = []
  if (isGroup) {
    const peers = input.groupChat!.participantNames.filter((name) => name !== input.expertName)
    const header = input.resumed ? [] : [peers.length > 0
      ? `You are ${input.expertName} in a FinoCurve group chat with ${peers.join(', ')}.`
      : `You are ${input.expertName} in a FinoCurve group chat.`]
    if (input.groupChat?.directlyAddressed) header.push('You were specifically addressed for this turn.')
    if (header.length) parts.push(header.join(' '))
  }
  const transcript = trimTranscript(prior
    .filter((message) => message.content.trim())
    .map((message) => message.role === 'user' ? `User: ${message.content.trim()}` : message.content))
  if (transcript) parts.push(input.resumed ? 'New FinoCurve messages since your last reply:' : 'Recent FinoCurve messages:', transcript)
  parts.push(latestText ? `Latest message from the user:\n${latestText}` : 'The user sent an empty message.')
  if (attachmentNote) parts.push(attachmentNote)
  return parts.join('\n\n')
}

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `fc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function rpcBody(method: string, params: Record<string, unknown>): string {
  return JSON.stringify({ jsonrpc: '2.0', id: newId(), method, params })
}

function rpcResult(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object') throw new Error('The A2A server sent an unreadable response.')
  const envelope = payload as { result?: unknown; error?: { message?: unknown; code?: unknown } }
  if (envelope.error) {
    const message = typeof envelope.error.message === 'string' ? envelope.error.message : 'Unknown error'
    throw new Error(`A2A agent error: ${message}`)
  }
  if (!envelope.result || typeof envelope.result !== 'object') {
    throw new Error('The A2A server response had no result.')
  }
  return envelope.result as Record<string, unknown>
}

/** Parse a `text/event-stream` body into the JSON payload of each `data:` event. */
export async function* readSseJson(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown, void, unknown> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const takeEvent = (raw: string): unknown => {
    const data = raw.split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).replace(/^ /, ''))
      .join('\n')
    if (!data) return undefined
    try {
      return JSON.parse(data)
    } catch {
      return undefined
    }
  }
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let boundary = buffer.search(/\r?\n\r?\n/)
      while (boundary >= 0) {
        const raw = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary).replace(/^\r?\n\r?\n/, '')
        const event = takeEvent(raw)
        if (event !== undefined) yield event
        boundary = buffer.search(/\r?\n\r?\n/)
      }
    }
    buffer += decoder.decode()
    if (buffer.trim()) {
      const event = takeEvent(buffer)
      if (event !== undefined) yield event
    }
  } finally {
    reader.releaseLock()
  }
}

/** Tracks streamed artifacts so snapshots and appends both become clean deltas. */
class ArtifactTracker {
  private texts = new Map<string, string>()
  private emittedAny = false

  apply(artifact: unknown, append: boolean): string {
    if (!artifact || typeof artifact !== 'object') return ''
    const item = artifact as { artifactId?: unknown; parts?: unknown }
    const id = typeof item.artifactId === 'string' ? item.artifactId : 'artifact'
    const text = textFromParts(item.parts)
    const previous = this.texts.get(id)
    if (previous === undefined) {
      this.texts.set(id, text)
      if (!text) return ''
      const prefix = this.emittedAny ? '\n\n' : ''
      this.emittedAny = true
      return `${prefix}${text}`
    }
    if (append) {
      this.texts.set(id, previous + text)
      if (text) this.emittedAny = true
      return text
    }
    this.texts.set(id, text)
    if (text === previous) return ''
    if (text.startsWith(previous)) return text.slice(previous.length)
    return text ? `\n\n${text}` : ''
  }

  /** Full artifacts from a task snapshot (tasks/get or message/send). */
  applySnapshot(artifacts: unknown): string {
    if (!Array.isArray(artifacts)) return ''
    return artifacts.map((artifact) => this.apply(artifact, false)).join('')
  }

  get hasText(): boolean {
    return this.emittedAny
  }
}

export async function testA2AAgentConnection(
  config: A2AAgentConfig,
  fetchFn: A2AFetch = fetch,
): Promise<{ ok: boolean; error?: string; agentName?: string; agents?: A2AAgentSkill[] }> {
  try {
    const card = await fetchA2AAgentCard(config, { fetch: fetchFn })
    const endpoint = resolveA2AEndpoint(config, card)
    // A lookup for a task that cannot exist proves the endpoint speaks JSON-RPC
    // and accepts the token, without starting a run on the remote agent.
    const response = await timedFetch(fetchFn, endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeaders(config.token) },
      body: rpcBody('tasks/get', { id: `finocurve-connection-test-${newId()}` }),
    }, undefined, REQUEST_TIMEOUT_MS)
    if (!response.ok) return { ok: false, error: httpErrorMessage(response.status, await response.text()) }
    const payload = await response.json() as { jsonrpc?: unknown }
    if (payload?.jsonrpc !== '2.0') {
      return { ok: false, error: 'That URL answered, but not as an A2A JSON-RPC endpoint.' }
    }
    const agents = card?.skills ?? []
    const agentId = config.agentId?.trim()
    if (agentId && agents.length > 0 && !agents.some((agent) => agent.id === agentId)) {
      return {
        ok: false,
        error: `${card?.name || 'This server'} does not list an agent "${agentId}".`,
        agentName: card?.name,
        agents,
      }
    }
    return { ok: true, ...(card?.name ? { agentName: card.name } : {}), agents }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not reach the A2A server.' }
  }
}

export async function* streamA2AAgentChat(
  options: A2AStreamOptions,
): AsyncGenerator<ChatStreamChunk, void, unknown> {
  const { config, signal } = options
  const fetchFn = options.fetch ?? fetch
  const sleep = options.sleep ?? defaultSleep
  const now = options.now ?? Date.now
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const basePollMs = options.pollMs ?? DEFAULT_POLL_MS
  const started = now()

  throwIfAborted(signal)
  const card = await fetchA2AAgentCard(config, { fetch: fetchFn, signal })
  const endpoint = resolveA2AEndpoint(config, card)
  const headers = {
    'Content-Type': 'application/json',
    ...authHeaders(config.token),
  }

  const session = options.session?.contextId ? options.session : undefined
  const prompt = buildA2APrompt({
    expertName: options.expertName,
    messages: session
      ? options.messages.slice(-Math.max(1, session.newMessageCount))
      : options.messages,
    groupChat: options.groupChat,
    resumed: !!session,
  })
  const message = {
    kind: 'message',
    messageId: newId(),
    role: 'user',
    parts: [{ kind: 'text', text: prompt }],
    ...(session ? { contextId: session.contextId } : {}),
    ...(config.agentId ? { metadata: { agent: config.agentId } } : {}),
  }

  const tracker = new ArtifactTracker()
  let taskId: string | undefined
  let state = ''
  let waitingNotice = ''
  let lastStatusNote = ''
  let reportedContextId = ''

  const call = async (method: string, params: Record<string, unknown>) => {
    const response = await timedFetch(fetchFn, endpoint, {
      method: 'POST',
      headers: { ...headers, Accept: 'application/json' },
      body: rpcBody(method, params),
    }, signal, REQUEST_TIMEOUT_MS)
    if (!response.ok) throw new Error(httpErrorMessage(response.status, await response.text()))
    return rpcResult(await response.json())
  }

  const cancelRemote = () => {
    if (!taskId || TERMINAL_STATES.has(state)) return
    // Best effort: tell the agent to stop so an abandoned run does not keep working.
    void timedFetch(fetchFn, endpoint, {
      method: 'POST',
      headers: { ...headers, Accept: 'application/json' },
      body: rpcBody('tasks/cancel', { id: taskId }),
    }, undefined, REQUEST_TIMEOUT_MS).catch(() => undefined)
  }

  /** Turn one A2A event (task, message, status-update, artifact-update) into chat chunks. */
  function* handle(result: Record<string, unknown>): Generator<ChatStreamChunk, void, unknown> {
    const kind = typeof result.kind === 'string' ? result.kind : ''
    const contextId = typeof result.contextId === 'string' ? result.contextId : ''
    if (contextId && contextId !== reportedContextId) {
      // The server names the session; the renderer stores it on the reply so the next turn continues it.
      reportedContextId = contextId
      yield { type: 'session', contextId }
    }
    if (kind === 'task') {
      if (typeof result.id === 'string') taskId = result.id
      const text = tracker.applySnapshot(result.artifacts)
      if (text) yield { type: 'answer', content: text }
      yield* handleStatus(result.status)
      return
    }
    if (kind === 'artifact-update') {
      if (!taskId && typeof result.taskId === 'string') taskId = result.taskId
      const text = tracker.apply(result.artifact, result.append === true)
      if (text) yield { type: 'answer', content: text }
      return
    }
    if (kind === 'status-update') {
      if (!taskId && typeof result.taskId === 'string') taskId = result.taskId
      yield* handleStatus(result.status)
      return
    }
    if (kind === 'message') {
      // A direct reply with no task behind it is the whole answer.
      const text = tracker.apply({
        artifactId: `message:${typeof result.messageId === 'string' ? result.messageId : ''}`,
        parts: result.parts,
      }, false)
      if (text) yield { type: 'answer', content: text }
      state = 'completed'
    }
  }

  function* handleStatus(status: unknown): Generator<ChatStreamChunk, void, unknown> {
    const nextState = statusState(status)
    if (nextState) state = nextState
    const note = statusText(status)
    if (WAITING_STATES.has(state)) {
      const notice = note
        ? `${options.expertName} is waiting for approval: ${note}`
        : `${options.expertName} is waiting for approval.`
      if (notice !== waitingNotice) {
        waitingNotice = notice
        yield {
          type: 'answer',
          content: `${tracker.hasText ? '\n\n' : ''}> ⏸ ${notice} Answer it in the agent's own app (Hermes Glass: the widget); this reply continues once it resumes.\n\n`,
        }
      }
      return
    }
    if (state === 'failed' || state === 'rejected') {
      throw new Error(note ? `${options.expertName} failed: ${note}` : `${options.expertName} could not finish this task.`)
    }
    if (note && note !== lastStatusNote && !TERMINAL_STATES.has(state)) {
      lastStatusNote = note
      yield { type: 'reasoning', content: `${note}\n` }
    }
  }

  try {
    if (card?.streaming !== false) {
      const response = await timedFetch(fetchFn, endpoint, {
        method: 'POST',
        headers: { ...headers, Accept: 'text/event-stream' },
        body: rpcBody('message/stream', { message }),
      }, signal, null)
      if (!response.ok) throw new Error(httpErrorMessage(response.status, await response.text()))
      const contentType = response.headers.get('content-type') || ''
      if (contentType.includes('text/event-stream') && response.body) {
        for await (const event of readSseJson(response.body)) {
          throwIfAborted(signal)
          yield* handle(rpcResult(event))
          if (TERMINAL_STATES.has(state)) break
          if (now() - started >= timeoutMs) throw new Error(`Timed out waiting for ${options.expertName} to reply.`)
        }
      } else {
        yield* handle(rpcResult(await response.json()))
      }
    } else {
      yield* handle(await call('message/send', { message }))
    }

    // A stream that closed while the task was still open (typically paused for
    // an approval) is followed by polling until the agent finishes.
    let pollMs = basePollMs
    while (taskId && !TERMINAL_STATES.has(state)) {
      if (now() - started >= timeoutMs) throw new Error(`Timed out waiting for ${options.expertName} to reply.`)
      await sleep(pollMs, signal)
      const before = state
      const hadText = tracker.hasText
      yield* handle(await call('tasks/get', { id: taskId }))
      const progressed = state !== before || tracker.hasText !== hadText
      pollMs = progressed ? basePollMs : Math.min(Math.ceil(pollMs * 1.5), MAX_POLL_MS)
    }

    if (!tracker.hasText && state !== 'canceled' && state !== 'cancelled') {
      throw new Error(`${options.expertName} finished without a text reply.`)
    }
  } catch (error) {
    if (signal?.aborted || (error as Error)?.name === 'AbortError') {
      cancelRemote()
      throw abortError()
    }
    throw error
  }
}

/**
 * Slack-bot expert wrapper. Ports the Hermes/Athena DM + thread-stream flow:
 * post as the user (xoxp-), mention the bot, then poll conversations.replies
 * for in-thread streaming edits. Config comes from the expert profile, not .env.
 */
import type { ChatContext, ChatMessage, ChatStreamChunk } from './types'
import { emojify, get } from 'node-emoji'

export const SLACK_API_BASE = 'https://slack.com/api'
export const SLACK_BOT_MODEL_LABEL = 'Slack bot'

const MAX_TRANSCRIPT_CHARS = 3200
const DEFAULT_POLL_MS = 500
const DEFAULT_IDLE_COMPLETE_MS = 3000
const DEFAULT_TIMEOUT_MS = 300_000
/** Ceiling for the poll interval once a thread goes quiet, so long turns stay cheap. */
const MAX_POLL_MS = 5_000
const POLL_BACKOFF_FACTOR = 1.5
const REQUEST_TIMEOUT_MS = 30_000
const MAX_RATE_LIMIT_RETRIES = 4
const DEFAULT_RETRY_AFTER_MS = 1_000
const MAX_RETRY_AFTER_MS = 60_000
const SLACK_REPLY_PAGE_SIZE = 15
const IN_PROGRESS_STATUSES = new Set(['in_progress', 'pending', 'queued', 'running'])
const LEADING_EMOJI = /^\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*/u
/** Fallback for bots that post status lines without a leading emoji. */
const PROGRESS_LINE = /^(reading skill|using skill|using tool|calling tool|running tool|working on|searching\b|tool_[a-z0-9_]+)/i

const SLACK_SKIN_TONES: Record<string, string> = {
  '2': '\u{1F3FB}',
  '3': '\u{1F3FC}',
  '4': '\u{1F3FD}',
  '5': '\u{1F3FE}',
  '6': '\u{1F3FF}',
}

const SLACK_EMOJI_ALIASES: Record<string, string> = {
  book: 'open_book',
  simple_smile: 'slightly_smiling_face',
  thumbsup: '+1',
  thumbsdown: '-1',
}

export interface SlackBotConfig {
  userToken: string
  botUserId: string
  dmChannel?: string
}

export type SlackRequestFn = (
  method: string,
  body: Record<string, unknown>,
) => Promise<Record<string, unknown>>

export interface SlackBotStreamOptions {
  config: SlackBotConfig
  expertName: string
  messages: ChatMessage[]
  groupChat?: ChatContext['groupChat']
  signal?: AbortSignal
  pollMs?: number
  idleCompleteMs?: number
  timeoutMs?: number
  now?: () => number
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
  request?: SlackRequestFn
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    const error = new Error('Aborted')
    error.name = 'AbortError'
    throw error
  }
}

export async function defaultSlackSleep(ms: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal)
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      const error = new Error('Aborted')
      error.name = 'AbortError'
      reject(error)
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function slackErrorMessage(code: unknown, metadata?: unknown): string {
  const error = typeof code === 'string' ? code : 'unknown_error'
  const details = Array.isArray((metadata as { messages?: unknown } | undefined)?.messages)
    ? (metadata as { messages: unknown[] }).messages.filter((item) => typeof item === 'string').join(' ')
    : ''
  const suffix = details ? ` (${details})` : ''
  if (error === 'invalid_auth' || error === 'not_authed' || error === 'token_revoked') {
    return 'Slack rejected the user token. Check the xoxp- token on this expert.'
  }
  if (error === 'missing_scope') {
    return 'The Slack user token is missing a required scope (chat:write, im:write, im:history).'
  }
  if (error === 'channel_not_found') {
    return 'Could not find the Slack DM with this bot. Confirm the bot user id or DM channel.'
  }
  if (error === 'user_not_found') {
    return 'Slack does not recognize that bot user id.'
  }
  return `Slack API error: ${error}${suffix}`
}

function encodeSlackBody(body: Record<string, unknown>): URLSearchParams {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(body)) {
    if (value === undefined || value === null || value === false) continue
    if (typeof value === 'object') params.set(key, JSON.stringify(value))
    else params.set(key, String(value))
  }
  return params
}

export interface SlackRequestOptions {
  /** Cancels an in-flight request as well as the wait between retries. */
  signal?: AbortSignal
  /** Per-request deadline; without it a hung socket would outlive the stream. */
  timeoutMs?: number
  maxRetries?: number
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
}

/** Slack's documented back-pressure signal, in seconds. */
function retryAfterMs(response: Response): number {
  const header = response.headers?.get?.('retry-after')
  const seconds = header ? Number.parseFloat(header) : Number.NaN
  if (!Number.isFinite(seconds) || seconds <= 0) return DEFAULT_RETRY_AFTER_MS
  return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS)
}

async function slackFetch(
  url: string,
  init: RequestInit,
  method: string,
  signal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<Response> {
  throwIfAborted(signal)
  const controller = new AbortController()
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (error) {
    if (signal?.aborted) throwIfAborted(signal)
    if (controller.signal.aborted) throw new Error(`Slack request timed out (${method}).`)
    throw error
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

export async function slackApiRequest(
  token: string,
  method: string,
  body: Record<string, unknown> = {},
  options: SlackRequestOptions = {},
): Promise<Record<string, unknown>> {
  const sleep = options.sleep ?? defaultSlackSleep
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS
  const maxRetries = options.maxRetries ?? MAX_RATE_LIMIT_RETRIES
  const init: RequestInit = {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: encodeSlackBody(body),
  }

  for (let attempt = 0; ; attempt += 1) {
    const response = await slackFetch(`${SLACK_API_BASE}/${method}`, init, method, options.signal, timeoutMs)
    // Slack answers 429 with Retry-After; honouring it beats hammering the method.
    if (response.status === 429 && attempt < maxRetries) {
      await sleep(retryAfterMs(response), options.signal)
      continue
    }
    if (!response.ok) throw new Error(`Slack HTTP ${response.status}`)
    const result = await response.json() as Record<string, unknown>
    if (result.ok !== true) {
      if (result.error === 'ratelimited' && attempt < maxRetries) {
        await sleep(retryAfterMs(response), options.signal)
        continue
      }
      throw new Error(slackErrorMessage(result.error, result.response_metadata))
    }
    return result
  }
}

export function renderSlackEmojis(text: string): string {
  if (!text.includes(':')) return text
  const rewritten = text.replace(/:([a-z0-9_+-]+):/gi, (match, name: string) => {
    const mapped = SLACK_EMOJI_ALIASES[name.toLowerCase()] ?? name
    return get(mapped) ? `:${mapped}:` : match
  })
  const withSkin = rewritten.replace(
    /:([a-z0-9_+-]+)::skin-tone-([2-6]):/gi,
    (match, name: string, tone: string) => {
      const emoji = get(SLACK_EMOJI_ALIASES[name.toLowerCase()] ?? name)
      const modifier = SLACK_SKIN_TONES[tone]
      return emoji && modifier ? `${emoji}${modifier}` : match
    },
  )
  return emojify(withSkin)
}

/** One rendered line of a Slack reply, plus the structure used to tell status from prose. */
export interface SlackLine {
  markdown: string
  plain: string
  /** Thinking-step lines are introduced by an emoji element ("📚 Reading skill …"). */
  leadingEmoji: boolean
  code: boolean
}

function unescapeSlackText(text: string): string {
  return text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
}

function emojiGlyph(element: Record<string, unknown>): string {
  const unicode = typeof element.unicode === 'string' ? element.unicode : ''
  if (unicode) {
    const points = unicode.split('-').map((part) => Number.parseInt(part, 16)).filter((code) => Number.isFinite(code))
    if (points.length) return String.fromCodePoint(...points)
  }
  const name = typeof element.name === 'string' ? element.name : ''
  return name ? renderSlackEmojis(`:${name}:`) : ''
}

function styleText(text: string, style: unknown): string {
  if (!text.trim()) return text
  const flags = (style && typeof style === 'object' ? style : {}) as Record<string, unknown>
  if (flags.code === true) return `\`${text}\``
  let out = text
  if (flags.bold === true) out = `**${out}**`
  if (flags.italic === true) out = `_${out}_`
  if (flags.strike === true) out = `~~${out}~~`
  return out
}

function elementLabel(item: Record<string, unknown>): string {
  const type = typeof item.type === 'string' ? item.type : ''
  if (type === 'link') {
    const url = typeof item.url === 'string' ? item.url : ''
    return typeof item.text === 'string' && item.text ? item.text : url
  }
  if (type === 'user') return `@${typeof item.user_id === 'string' ? item.user_id : 'user'}`
  if (type === 'usergroup') return `@${typeof item.usergroup_id === 'string' ? item.usergroup_id : 'group'}`
  if (type === 'broadcast') return `@${typeof item.range === 'string' ? item.range : 'channel'}`
  if (type === 'channel') return `#${typeof item.channel_id === 'string' ? item.channel_id : 'channel'}`
  return typeof item.text === 'string' ? item.text : ''
}

/** Walk a rich_text_section into lines, remembering which ones an emoji introduced. */
function renderSection(elements: unknown[], lines: SlackLine[]): void {
  let markdown = ''
  let plain = ''
  let leadingEmoji = false
  let decided = false

  const flush = () => {
    lines.push({ markdown, plain: plain.trim(), leadingEmoji, code: false })
    markdown = ''
    plain = ''
    leadingEmoji = false
    decided = false
  }

  const push = (md: string, text: string, isEmoji: boolean) => {
    if (!decided && text.trim()) {
      leadingEmoji = isEmoji
      decided = true
    }
    markdown += md
    plain += text
  }

  for (const element of elements) {
    if (!element || typeof element !== 'object') continue
    const item = element as Record<string, unknown>
    const type = typeof item.type === 'string' ? item.type : ''

    if (type === 'emoji') {
      const glyph = emojiGlyph(item)
      push(glyph, glyph, true)
      continue
    }

    if (type !== 'text') {
      const label = elementLabel(item)
      if (label) push(styleText(label, item.style), label, false)
      continue
    }

    const raw = typeof item.text === 'string' ? item.text : ''
    if (!raw) continue
    const pieces = raw.split('\n')
    for (let index = 0; index < pieces.length; index += 1) {
      if (index > 0) flush()
      const piece = pieces[index]
      if (piece) push(styleText(piece, item.style), piece, false)
    }
  }

  if (markdown || plain.trim()) flush()
}

function preformattedLines(elements: unknown[], lines: SlackLine[]): void {
  const body = elements.map((element) => {
    if (!element || typeof element !== 'object') return ''
    const item = element as Record<string, unknown>
    return item.type === 'emoji' ? emojiGlyph(item) : elementLabel(item)
  }).join('').replace(/\n$/, '')
  lines.push({ markdown: '```', plain: '', leadingEmoji: false, code: true })
  for (const line of body.split('\n')) {
    lines.push({ markdown: line, plain: line, leadingEmoji: false, code: true })
  }
  lines.push({ markdown: '```', plain: '', leadingEmoji: false, code: true })
}

function renderRichTextNode(node: unknown, lines: SlackLine[]): void {
  if (!node || typeof node !== 'object') return
  const item = node as Record<string, unknown>
  const type = typeof item.type === 'string' ? item.type : ''
  const children = Array.isArray(item.elements) ? item.elements : []

  if (type === 'rich_text_preformatted') {
    preformattedLines(children, lines)
    return
  }

  if (type === 'rich_text_quote') {
    const inner: SlackLine[] = []
    renderSection(children, inner)
    for (const line of inner) lines.push({ ...line, markdown: `> ${line.markdown}` })
    return
  }

  if (type === 'rich_text_list') {
    const ordered = item.style === 'ordered'
    let index = 1
    for (const child of children) {
      const inner: SlackLine[] = []
      const childItem = (child && typeof child === 'object' ? child : {}) as Record<string, unknown>
      renderSection(Array.isArray(childItem.elements) ? childItem.elements : [], inner)
      inner.forEach((line, position) => {
        const bullet = position === 0 ? (ordered ? `${index}. ` : '- ') : '  '
        lines.push({ ...line, markdown: `${bullet}${line.markdown}` })
      })
      index += 1
    }
    return
  }

  renderSection(children, lines)
}

function plainTextLines(text: string, lines: SlackLine[]): void {
  for (const raw of renderSlackEmojis(unescapeSlackText(text)).replace(/\r\n/g, '\n').split('\n')) {
    const trimmed = raw.trim()
    lines.push({
      markdown: raw,
      plain: trimmed,
      leadingEmoji: LEADING_EMOJI.test(trimmed),
      code: false,
    })
  }
}

/** Slack reply → rendered lines, preferring rich_text blocks over the escaped `text` fallback. */
export function renderSlackMessageLines(message: Record<string, unknown> | undefined): SlackLine[] {
  if (!message) return []
  const lines: SlackLine[] = []

  for (const block of Array.isArray(message.blocks) ? message.blocks : []) {
    if (!block || typeof block !== 'object') continue
    const item = block as Record<string, unknown>
    if (item.type === 'rich_text') {
      for (const node of Array.isArray(item.elements) ? item.elements : []) renderRichTextNode(node, lines)
      continue
    }
    const textNode = item.text
    const value = textNode && typeof textNode === 'object'
      ? (textNode as { text?: unknown }).text
      : textNode
    if (typeof value === 'string' && value.trim()) plainTextLines(value, lines)
  }

  if (lines.length === 0) {
    for (const key of ['markdown_text', 'text'] as const) {
      const value = message[key]
      if (typeof value === 'string' && value.trim()) {
        plainTextLines(value, lines)
        break
      }
    }
  }

  while (lines.length && !lines[lines.length - 1].code && !lines[lines.length - 1].plain) lines.pop()
  return lines
}

export function slackMessageText(message: Record<string, unknown> | undefined): string {
  const lines = renderSlackMessageLines(message)
  if (lines.length === 0) return ''
  return lines.map((line, index) => {
    const next = lines[index + 1]
    // Slack separates consecutive lines with a single newline; markdown needs a hard break.
    const needsBreak = !line.code && line.markdown.trim() && next && !next.code && next.plain
    return needsBreak ? `${line.markdown}  ` : line.markdown
  }).join('\n').trim()
}

function chunkStillRunning(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  const nested = item.task && typeof item.task === 'object' ? item.task as Record<string, unknown> : item
  const status = typeof nested.status === 'string' ? nested.status.toLowerCase() : ''
  return IN_PROGRESS_STATUSES.has(status)
}

/**
 * Slack agents post their thinking steps as emoji-led lines ("📚 Reading skill …",
 * "⚙ tool_search…") plus raw tool output, then post the answer as a separate
 * reply that opens with prose. Classify on that structure rather than on
 * whichever verbs the bot happens to use this week.
 */
export function isSlackStatusMessage(message: Record<string, unknown>): boolean {
  const lines = renderSlackMessageLines(message).filter((line) => line.code || line.plain.trim())
  if (lines.length === 0) return true
  // Code lines only read as progress alongside an explicit step marker. A reply
  // that is nothing but a code block is a legitimate answer.
  const hasStatusLine = lines.some((line) => (
    !line.code && (line.leadingEmoji || PROGRESS_LINE.test(line.plain))
  ))
  if (!hasStatusLine) return false
  return lines.every((line) => line.code || line.leadingEmoji || PROGRESS_LINE.test(line.plain))
}

/** True while a Slack reply is still a work-in-progress rather than the answer. */
export function slackMessageStillRunning(message: Record<string, unknown>): boolean {
  if (message.is_streaming === true || message.streaming === true) return true
  if (Array.isArray(message.chunks) && message.chunks.some(chunkStillRunning)) return true
  if (Array.isArray(message.blocks) && message.blocks.some(chunkStillRunning)) return true
  return isSlackStatusMessage(message)
}

function trimTranscript(lines: string[]): string {
  let text = lines.join('\n')
  if (text.length <= MAX_TRANSCRIPT_CHARS) return text
  text = text.slice(text.length - MAX_TRANSCRIPT_CHARS)
  const newline = text.indexOf('\n')
  return (newline >= 0 ? text.slice(newline + 1) : text).trim()
}

/** Compact FinoCurve transcript posted as the Slack DM body (bot is mentioned first). */
export function buildSlackPrompt(input: {
  botUserId: string
  expertName: string
  messages: ChatMessage[]
  groupChat?: ChatContext['groupChat']
}): string {
  const mention = `<@${input.botUserId.trim()}>`
  const history = input.messages.filter((message) => message.role !== 'system')
  const latest = [...history].reverse().find((message) => message.role === 'user')
  const latestText = latest?.content.trim() || ''
  const prior = latest ? history.slice(0, history.lastIndexOf(latest)) : history
  const isGroup = !!input.groupChat?.participantNames.length
  const hasPrior = prior.some((message) => message.content.trim())

  if (!isGroup && !hasPrior) {
    return latestText ? `${mention} ${latestText}` : mention
  }

  const header: string[] = []
  if (isGroup) {
    const peers = input.groupChat!.participantNames.filter((name) => name !== input.expertName)
    header.push(
      peers.length > 0
        ? `You are ${input.expertName} in a FinoCurve group chat with ${peers.join(', ')}.`
        : `You are ${input.expertName} in a FinoCurve group chat.`,
    )
    if (input.groupChat?.directlyAddressed) {
      header.push('You were specifically addressed for this turn.')
    }
  }

  const transcriptLines: string[] = []
  for (const message of prior) {
    const content = message.content.trim()
    if (!content) continue
    transcriptLines.push(message.role === 'user' ? `User: ${content}` : message.content)
  }

  const parts = [mention]
  if (header.length) parts.push(header.join(' '))
  const transcript = trimTranscript(transcriptLines)
  if (transcript) parts.push('Recent FinoCurve messages:', transcript)
  parts.push(latestText ? `Latest message from the user:\n${latestText}` : 'The user sent an empty message.')
  return parts.join('\n\n')
}

export function isSlackPermalink(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && parsed.hostname.endsWith('.slack.com')
  } catch {
    return false
  }
}

/** Fallback when chat.getPermalink is missing a scope. Opens the DM thread in Slack. */
export function buildSlackThreadUrl(teamUrl: string, channel: string, threadTs: string): string {
  const origin = teamUrl.trim().replace(/\/+$/, '')
  const channelId = channel.trim()
  const ts = threadTs.trim()
  if (!origin || !channelId || !ts) return ''
  const p = `p${ts.replace('.', '')}`
  return `${origin}/archives/${encodeURIComponent(channelId)}/${p}?thread_ts=${encodeURIComponent(ts)}&cid=${encodeURIComponent(channelId)}`
}

export async function resolveSlackThreadUrl(
  request: SlackRequestFn,
  channel: string,
  threadTs: string,
  teamUrl = '',
): Promise<string> {
  try {
    const result = await request('chat.getPermalink', { channel, message_ts: threadTs })
    if (typeof result.permalink === 'string' && isSlackPermalink(result.permalink)) {
      return result.permalink
    }
  } catch {
    // im:read / links:read is enough for DMs; fall back if the workspace withheld it.
  }
  const fallback = buildSlackThreadUrl(teamUrl, channel, threadTs)
  return isSlackPermalink(fallback) ? fallback : ''
}

export function parseSlackBotConfig(persona: {
  slackUserToken?: string
  slackBotUserId?: string
  slackDmChannel?: string
} | undefined): SlackBotConfig | null {
  const userToken = persona?.slackUserToken?.trim() || ''
  const botUserId = persona?.slackBotUserId?.trim() || ''
  if (!userToken || !botUserId) return null
  return {
    userToken,
    botUserId,
    ...(persona?.slackDmChannel?.trim() ? { dmChannel: persona.slackDmChannel.trim() } : {}),
  }
}

export async function testSlackBotConnection(
  config: SlackBotConfig,
  request?: SlackRequestFn,
): Promise<{ ok: boolean; error?: string; dmChannel?: string }> {
  try {
    if (!config.userToken.startsWith('xoxp-')) {
      return { ok: false, error: 'Use a Slack user token (xoxp-), not a bot token.' }
    }
    if (!/^U[A-Z0-9]+$/i.test(config.botUserId.trim())) {
      return { ok: false, error: 'Bot user id should look like U0123456789.' }
    }
    const api = request ?? ((method, body) => slackApiRequest(config.userToken, method, body))
    await api('auth.test', {})
    // The stream uses a saved DM channel as-is, so the test must not demand
    // im:write (conversations.open) that the streaming path never exercises.
    const saved = config.dmChannel?.trim()
    if (saved) return { ok: true, dmChannel: saved }
    const opened = await api('conversations.open', { users: config.botUserId.trim() })
    const channel = opened.channel as { id?: string } | undefined
    return channel?.id ? { ok: true, dmChannel: channel.id } : { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not reach Slack.' }
  }
}

function isBotReply(message: Record<string, unknown>, botUserId: string, myUserId: string | undefined): boolean {
  const user = typeof message.user === 'string' ? message.user : ''
  if (user && user === myUserId) return false
  const subtype = typeof message.subtype === 'string' ? message.subtype : ''
  if (subtype && subtype !== 'bot_message' && subtype !== 'thread_broadcast') return false
  // Only the wrapped bot speaks for this expert. Other humans may be in the
  // thread (a shared channel, a colleague chiming in); their words are not it.
  return !user || user === botUserId || typeof message.bot_id === 'string'
}

async function fetchThreadMessages(
  request: SlackRequestFn,
  channel: string,
  threadTs: string,
): Promise<Record<string, unknown>[]> {
  const messages: Record<string, unknown>[] = []
  const seen = new Set<string>()
  let cursor: string | undefined
  for (;;) {
    const replies = await request('conversations.replies', {
      channel,
      ts: String(threadTs),
      limit: SLACK_REPLY_PAGE_SIZE,
      ...(cursor ? { cursor } : {}),
    })
    const page = Array.isArray(replies.messages) ? replies.messages as Record<string, unknown>[] : []
    for (const message of page) {
      const ts = typeof message.ts === 'string' ? message.ts : ''
      if (!ts || seen.has(ts)) continue
      seen.add(ts)
      messages.push(message)
    }
    const next = (replies.response_metadata as { next_cursor?: unknown } | undefined)?.next_cursor
    if (typeof next !== 'string' || !next) break
    cursor = next
  }
  return messages
}

export async function* streamSlackBotChat(
  options: SlackBotStreamOptions,
): AsyncGenerator<ChatStreamChunk, void, unknown> {
  const token = options.config.userToken.trim()
  const botUserId = options.config.botUserId.trim()
  if (!token.startsWith('xoxp-')) {
    throw new Error('Slack experts need a user token (xoxp-), not a bot token.')
  }
  if (!botUserId) throw new Error('Slack experts need the bot user id to mention.')

  const sleep = options.sleep ?? defaultSlackSleep
  const request = options.request
    ?? ((method, body) => slackApiRequest(token, method, body, { signal: options.signal, sleep }))
  const now = options.now ?? Date.now
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS
  const idleCompleteMs = options.idleCompleteMs ?? DEFAULT_IDLE_COMPLETE_MS
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  throwIfAborted(options.signal)

  const auth = await request('auth.test', {})
  const myUserId = typeof auth.user_id === 'string' ? auth.user_id : undefined
  const teamUrl = typeof auth.url === 'string' ? auth.url : ''

  let channel = options.config.dmChannel?.trim() || ''
  if (!channel) {
    const opened = await request('conversations.open', { users: botUserId })
    const openedChannel = opened.channel as { id?: string } | undefined
    channel = openedChannel?.id?.trim() || ''
  }
  if (!channel) throw new Error('Could not open a Slack DM with this bot.')

  const text = buildSlackPrompt({
    botUserId,
    expertName: options.expertName,
    messages: options.messages,
    groupChat: options.groupChat,
  })
  const posted = await request('chat.postMessage', { channel, text })
  const postedMessage = posted.message as { ts?: string } | undefined
  const threadTs = (typeof posted.ts === 'string' && posted.ts) || postedMessage?.ts
  if (!threadTs) throw new Error('Slack accepted the message but did not return a thread timestamp.')

  const sourceUrl = await resolveSlackThreadUrl(request, channel, String(threadTs), teamUrl)
  if (sourceUrl) yield { type: 'source', url: sourceUrl, label: 'Slack' }

  const printed = new Map<string, string>()
  const started = now()
  let lastActivityAt = now()
  let sawBotReply = false
  let sawAnswer = false
  // Back off while the thread is quiet so a five-minute turn costs tens of
  // conversations.replies calls rather than hundreds.
  const maxPollMs = Math.max(pollMs, Math.min(MAX_POLL_MS, timeoutMs))
  let currentPollMs = pollMs

  while (true) {
    throwIfAborted(options.signal)
    if (now() - started >= timeoutMs) {
      if (!sawBotReply) throw new Error('Timed out waiting for the Slack bot to reply in the DM thread.')
      return
    }

    let messages: Record<string, unknown>[]
    try {
      messages = await fetchThreadMessages(request, channel, String(threadTs))
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      if (/thread_not_found|message_not_found/i.test(message)) {
        await sleep(currentPollMs, options.signal)
        continue
      }
      throw error
    }

    for (const message of messages) {
      throwIfAborted(options.signal)
      const ts = typeof message.ts === 'string' ? message.ts : ''
      if (!ts || ts === threadTs) continue
      if (!isBotReply(message, botUserId, myUserId)) continue

      const nextText = slackMessageText(message)
      const previous = printed.get(ts)

      if (previous === undefined) {
        sawBotReply = true
        lastActivityAt = now()
        currentPollMs = pollMs
        const prefix = printed.size > 0 && nextText ? '\n\n' : ''
        if (nextText) yield { type: 'answer', content: `${prefix}${nextText}` }
        printed.set(ts, nextText)
      } else if (nextText !== previous) {
        sawBotReply = true
        lastActivityAt = now()
        currentPollMs = pollMs
        if (nextText.startsWith(previous)) {
          const delta = nextText.slice(previous.length)
          if (delta) yield { type: 'answer', content: delta }
        } else if (nextText) {
          yield { type: 'answer', content: `\n\n${nextText}` }
        }
        printed.set(ts, nextText)
      }

      if (!slackMessageStillRunning(message)) sawAnswer = true
    }

    // The answer arrives as its own reply after the thinking-step message, so wait
    // for the whole thread to settle. Give up on status-only threads eventually.
    const idleFor = now() - lastActivityAt
    if (sawBotReply && idleFor >= (sawAnswer ? idleCompleteMs : idleCompleteMs * 6)) return

    await sleep(currentPollMs, options.signal)
    currentPollMs = Math.min(Math.ceil(currentPollMs * POLL_BACKOFF_FACTOR), maxPollMs)
  }
}

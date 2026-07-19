import type { Agent } from '../types/Agent'
import type { Conversation, ConversationMessage } from '../types/Conversation'

export interface GroupTurnChunk {
  type: 'reasoning' | 'answer' | 'tool_start' | 'tool_end'
  agentId: string
  content?: string
  toolName?: string
  status?: 'success' | 'error'
}

export interface GroupTurnResult {
  agentId: string
  agentName: string
  text: string
  reasoning?: string
  followUps?: { label: string; prompt: string }[]
  aborted?: boolean
}

export interface RunGroupTurnOptions {
  signal?: AbortSignal
  /** Called immediately before each selected agent starts generating a reply. */
  onAgentStart?: (agentId: string) => void
  /** Called with live streaming deltas as each agent's reply is generated. */
  onChunk?: (chunk: GroupTurnChunk) => void
  /** Extra chat context shared with every participant (route, portfolio, etc). */
  baseContext?: Record<string, unknown>
  /** Uses a hidden model pass to choose responders and their order for non-mentioned turns. */
  smartRouting?: boolean
  /** Requests a short, user-displayable selection rationale from the router. */
  includeRoutingRationale?: boolean
  /** Reports the hidden routing pass without exposing its model output in the transcript. */
  onSmartRoutingUpdate?: (update: SmartRoutingUpdate) => void
}

export interface GroupResponderPlan {
  agentIds: string[]
  directlyAddressed: boolean
  source: 'mention' | 'everyone' | 'random' | 'smart'
}

export interface SmartRoutingUpdate {
  phase: 'selecting' | 'selected'
  agentIds: string[]
  fallback?: boolean
  /** Concise model-authored selection rationale; never hidden chain-of-thought. */
  rationale?: string
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function mentionIndex(message: string, name: string): number {
  const match = new RegExp(
    `(^|\\s)@${escapeRegExp(name.trim())}(?=$|[\\s,.;:!?])`,
    'i',
  ).exec(message)
  return match ? match.index + match[1].length : -1
}

function shuffleAgentIds(agentIds: string[], random: () => number): string[] {
  const shuffled = [...agentIds]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    ;[shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]]
  }
  return shuffled
}

/**
 * Resolves @mentions in free text to the agents they address, in the order the
 * mentions appear. A full-name mention always matches; a first-name mention
 * matches only when that first name is unique among the available agents,
 * avoiding accidental routing in rooms with duplicate names. This powers both
 * user routing (planGroupResponders) and agent-to-agent handoffs and never
 * matches @everyone / @all, which are user-only broadcast keywords.
 */
export function findMentionedAgentIds(
  text: string,
  availableIds: string[],
  agentById: Map<string, Agent>,
): string[] {
  const firstNameCounts = new Map<string, number>()
  for (const agentId of availableIds) {
    const firstName = agentById.get(agentId)?.name.trim().split(/\s+/)[0]?.toLocaleLowerCase()
    if (firstName) firstNameCounts.set(firstName, (firstNameCounts.get(firstName) ?? 0) + 1)
  }

  return availableIds
    .map((agentId) => {
      const agent = agentById.get(agentId)!
      const fullName = agent.name.trim()
      const firstName = fullName.split(/\s+/)[0]
      const fullNameIndex = mentionIndex(text, fullName)
      const firstNameIndex = firstNameCounts.get(firstName.toLocaleLowerCase()) === 1
        ? mentionIndex(text, firstName)
        : -1
      const indexes = [fullNameIndex, firstNameIndex].filter((index) => index >= 0)
      return { agentId, index: indexes.length > 0 ? Math.min(...indexes) : -1 }
    })
    .filter((mention) => mention.index >= 0)
    .sort((left, right) => left.index - right.index)
    .map((mention) => mention.agentId)
}

export interface PeerMentionResult {
  /** The remaining responder queue after applying peer handoffs. */
  queue: string[]
  /** Agents newly scheduled (promoted or inserted) by this peer mention, in order. */
  scheduled: string[]
}

/**
 * Applies agent-to-agent @mentions to the remaining responder queue without
 * fighting the router's existing schedule. Mentioned peers are moved to the
 * front of the queue in mention order (promoting already-scheduled agents
 * rather than duplicating them, inserting unscheduled ones). Agents that have
 * already spoken this turn and self-mentions are ignored, and the number of
 * additions per reply is capped so one message cannot flood the room.
 */
export function applyPeerMentionsToQueue(params: {
  remaining: string[]
  mentioned: string[]
  spoken: Set<string> | string[]
  speakerId: string
  max?: number
}): PeerMentionResult {
  const { remaining, mentioned, speakerId, max = 2 } = params
  const spoken = params.spoken instanceof Set ? params.spoken : new Set(params.spoken)
  const scheduled: string[] = []
  for (const agentId of mentioned) {
    if (scheduled.length >= max) break
    if (agentId === speakerId) continue
    if (spoken.has(agentId)) continue
    if (scheduled.includes(agentId)) continue
    scheduled.push(agentId)
  }
  const queue = [...scheduled, ...remaining.filter((id) => !scheduled.includes(id))]
  return { queue, scheduled }
}

/**
 * Plans who responds to a group turn. A direct @mention routes the turn only
 * to those agents; otherwise the full group responds in a freshly shuffled
 * order. First-name mentions work only when that first name is unique in the
 * room, avoiding accidental routing in groups with duplicate names.
 */
export function planGroupResponders(
  conversation: Conversation,
  agents: Agent[],
  userText: string,
  random: () => number = Math.random,
): GroupResponderPlan {
  const agentById = new Map(agents.map((agent) => [agent.id, agent]))
  const availableIds = conversation.participantAgentIds.filter((id) => agentById.has(id))

  if (mentionIndex(userText, 'everyone') >= 0 || mentionIndex(userText, 'all') >= 0) {
    return {
      agentIds: shuffleAgentIds(availableIds, random),
      directlyAddressed: false,
      source: 'everyone',
    }
  }

  const mentioned = findMentionedAgentIds(userText, availableIds, agentById)

  if (mentioned.length > 0) {
    return {
      agentIds: mentioned,
      directlyAddressed: true,
      source: 'mention',
    }
  }

  return {
    agentIds: shuffleAgentIds(availableIds, random),
    directlyAddressed: false,
    source: 'random',
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export interface SmartRoutingDecision {
  agentIds: string[]
  rationale?: string
}

/** Parses and validates the router's JSON against the agents actually in the room. */
export function parseSmartRoutingDecision(raw: string, agents: Agent[]): SmartRoutingDecision {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) return { agentIds: [] }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw.slice(start, end + 1))
  } catch {
    return { agentIds: [] }
  }
  if (!isRecord(parsed)) return { agentIds: [] }

  let selections: unknown[] = []
  if (Array.isArray(parsed.routes)) {
    selections = [...parsed.routes].sort((left, right) => {
      const leftPriority = isRecord(left) && typeof left.priority === 'number' ? left.priority : Number.MAX_SAFE_INTEGER
      const rightPriority = isRecord(right) && typeof right.priority === 'number' ? right.priority : Number.MAX_SAFE_INTEGER
      return leftPriority - rightPriority
    })
  } else if (Array.isArray(parsed.selectedAgentIds)) {
    selections = parsed.selectedAgentIds
  } else if (Array.isArray(parsed.agentIds)) {
    selections = parsed.agentIds
  }

  const idByLowercaseId = new Map(agents.map((agent) => [agent.id.toLocaleLowerCase(), agent.id]))
  const idByLowercaseName = new Map(agents.map((agent) => [agent.name.trim().toLocaleLowerCase(), agent.id]))
  const agentById = new Map(agents.map((agent) => [agent.id, agent]))
  const selected: string[] = []
  const routeReasons: string[] = []

  for (const selection of selections) {
    const candidate = typeof selection === 'string'
      ? selection
      : isRecord(selection)
        ? (typeof selection.agentId === 'string'
            ? selection.agentId
            : typeof selection.name === 'string'
              ? selection.name
              : '')
        : ''
    const normalized = candidate.trim().toLocaleLowerCase()
    const agentId = idByLowercaseId.get(normalized) ?? idByLowercaseName.get(normalized)
    if (agentId && !selected.includes(agentId)) {
      selected.push(agentId)
      if (isRecord(selection) && typeof selection.reason === 'string' && selection.reason.trim()) {
        routeReasons.push(`${agentById.get(agentId)?.name ?? agentId}: ${selection.reason.trim()}`)
      }
    }
  }

  const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : ''
  const rationale = (summary || routeReasons.join(' ')).replace(/\s+/g, ' ').slice(0, 600)
  return { agentIds: selected, ...(rationale ? { rationale } : {}) }
}

/** Backward-compatible ID-only parser used by routing tests and callers. */
export function parseSmartRoutingResponse(raw: string, agents: Agent[]): string[] {
  return parseSmartRoutingDecision(raw, agents).agentIds
}

const ROUTING_STOP_WORDS = new Set([
  'about', 'after', 'again', 'also', 'and', 'are', 'can', 'could', 'for', 'from', 'have',
  'how', 'into', 'its', 'just', 'more', 'please', 'should', 'that', 'the', 'their', 'then',
  'there', 'these', 'they', 'this', 'those', 'what', 'when', 'where', 'which', 'with', 'would',
  'you', 'your',
])

function routingTokens(value: string): Set<string> {
  const tokens = value.toLocaleLowerCase().match(/[a-z0-9][a-z0-9_-]{2,}/g) ?? []
  return new Set(tokens.filter((token) => !ROUTING_STOP_WORDS.has(token)))
}

/** Deterministic backup when a provider returns malformed routing JSON. */
export function rankAgentsByRelevance(userText: string, agents: Agent[]): string[] {
  const promptTokens = routingTokens(userText)
  if (promptTokens.size === 0) return []

  const ranked = agents.map((agent, index) => {
    const identityTokens = routingTokens(
      `${agent.name} ${agent.description ?? ''} ${(agent.specialties ?? []).join(' ')}`,
    )
    const personaTokens = routingTokens(agent.systemPrompt)
    let score = 0
    for (const token of promptTokens) {
      if (identityTokens.has(token)) score += 3
      if (personaTokens.has(token)) score += 1
    }
    return { agentId: agent.id, score, index }
  }).sort((left, right) => right.score - left.score || left.index - right.index)

  const topScore = ranked[0]?.score ?? 0
  if (topScore === 0) return []
  return ranked
    .filter((item) => item.score > 0 && item.score >= Math.max(1, topScore * 0.45))
    .slice(0, 3)
    .map((item) => item.agentId)
}

function buildSmartRoutingRequest(
  conversation: Conversation,
  agents: Agent[],
  userMessage: ConversationMessage,
  includeRationale: boolean,
): string {
  const candidates = agents.map((agent) => ({
    id: agent.id,
    name: agent.name,
    description: agent.description ?? '',
    specialties: agent.specialties ?? [],
    expertise: agent.systemPrompt.replace(/\s+/g, ' ').trim().slice(0, 1_200),
  }))
  const recentContext = conversation.messages.slice(-6).map((message) => ({
    author: message.senderName,
    role: message.role,
    content: message.content.slice(0, 600),
  }))

  return [
    'Choose which advisors should respond to the latest user prompt and rank them by response priority.',
    'Normally choose one advisor. Choose two or three only when distinct expertise will materially improve the answer. Choose more only when the prompt truly requires the entire room.',
    'The first route leads; later routes should complement or challenge the earlier response. Do not route based on turn-taking fairness.',
    'Use exact candidate IDs. Do not include advisors who should not respond.',
    ...(includeRationale
      ? [
          'Give a concise selection summary, not hidden reasoning or a step-by-step analysis.',
          'Required JSON schema: {"summary":"brief selection rationale","routes":[{"agentId":"exact-id","priority":1,"reason":"brief expertise match"}]}',
        ]
      : ['Required JSON schema: {"routes":[{"agentId":"exact-id","priority":1}]}']),
    `Latest user prompt: ${JSON.stringify(userMessage.content)}`,
    `Recent conversation context: ${JSON.stringify(recentContext)}`,
    `Candidate advisors: ${JSON.stringify(candidates)}`,
  ].join('\n')
}

async function createSmartResponderPlan(
  conversation: Conversation,
  agents: Agent[],
  userMessage: ConversationMessage,
  fallbackPlan: GroupResponderPlan,
  signal?: AbortSignal,
  includeRationale = false,
): Promise<{ plan: GroupResponderPlan; fallback: boolean; rationale?: string } | null> {
  const streamChat = window.electronAPI?.aiChatStream
  if (!streamChat || signal?.aborted) return null

  try {
    const response = await streamChat({
      messages: [{
        role: 'user',
        content: buildSmartRoutingRequest(conversation, agents, userMessage, includeRationale),
      }],
      context: { backgroundTask: 'group-routing' },
    })
    if (response.aborted || signal?.aborted) return null

    const decision = parseSmartRoutingDecision(response.text, agents)
    if (decision.agentIds.length > 0) {
      return {
        plan: { agentIds: decision.agentIds, directlyAddressed: false, source: 'smart' },
        fallback: false,
        rationale: includeRationale ? decision.rationale : undefined,
      }
    }
  } catch {
    if (signal?.aborted) return null
  }

  const relevantAgentIds = rankAgentsByRelevance(userMessage.content, agents)
  return {
    plan: {
      agentIds: relevantAgentIds.length > 0 ? relevantAgentIds : fallbackPlan.agentIds,
      directlyAddressed: false,
      source: 'smart',
    },
    fallback: true,
    rationale: includeRationale
      ? relevantAgentIds.length > 0
        ? 'Selected the strongest expertise matches for this prompt.'
        : 'No single specialty dominated, so the room will contribute in a fresh order.'
      : undefined,
  }
}

/**
 * Runs one group turn. Direct @mentions route to the addressed agent(s). General
 * turns either use a hidden smart-routing pass or invite everyone in a shuffled
 * order. Each responder sees the transcript so far, including earlier replies
 * from the current turn.
 * Since the shared ChatMessage/IPC contract has no
 * per-message sender name, replies from other agents are prefixed with
 * "[AgentName]: " when building the transcript sent to the next agent.
 *
 * Renderer-side only (uses window.electronAPI.aiChatStream) — no React/Electron-main imports.
 */
export async function* runGroupTurn(
  conversation: Conversation,
  agents: Agent[],
  userMessage: ConversationMessage,
  options: RunGroupTurnOptions = {},
): AsyncGenerator<GroupTurnResult, void, unknown> {
  const streamChat = window.electronAPI?.aiChatStream
  if (!streamChat) return

  const agentById = new Map(agents.map((a) => [a.id, a]))
  const transcript: ConversationMessage[] = [...conversation.messages, userMessage]
  let responderPlan = planGroupResponders(conversation, agents, userMessage.content)
  if (options.smartRouting && responderPlan.source === 'random') {
    options.onSmartRoutingUpdate?.({ phase: 'selecting', agentIds: [] })
    const routed = await createSmartResponderPlan(
      conversation,
      agents,
      userMessage,
      responderPlan,
      options.signal,
      options.includeRoutingRationale,
    )
    if (!routed) return
    responderPlan = routed.plan
    options.onSmartRoutingUpdate?.({
      phase: 'selected',
      agentIds: responderPlan.agentIds,
      fallback: routed.fallback,
      rationale: routed.rationale,
    })
  }
  const availableIds = conversation.participantAgentIds.filter((id) => agentById.has(id))
  const participantNames = conversation.participantAgentIds
    .map((agentId) => agentById.get(agentId)?.name)
    .filter((name): name is string => !!name)

  // A mutable queue lets agents hand off to peers mid-turn via @mentions without
  // fighting the router's schedule. `spoken` blocks re-entry (and A<->B loops),
  // and `addressedByPeer` marks agents pulled in by a peer so they are treated
  // as directly addressed for that single turn.
  const remaining = [...responderPlan.agentIds]
  const spoken = new Set<string>()
  const addressedByPeer = new Set<string>()

  while (remaining.length > 0) {
    if (options.signal?.aborted) return
    const agentId = remaining.shift()!
    if (spoken.has(agentId)) continue
    const agent = agentById.get(agentId)
    if (!agent) continue
    spoken.add(agentId)

    const apiMessages = transcript.map((m) => ({
      role: m.role,
      content:
        m.role === 'assistant' && m.senderAgentId && m.senderAgentId !== agentId
          ? `[${m.senderName}]: ${m.content}`
          : m.content,
      ...(m.attachments && m.attachments.length > 0 ? { attachments: m.attachments } : {}),
    }))

    // Once another participant has answered, the transcript ends in an
    // assistant turn. Some providers treat that shape as an assistant prefill
    // (Claude/Bedrock rejects it outright), so hand the conversation back to
    // the user role before asking the next agent to contribute. This message is
    // request-only and is never persisted in the visible conversation.
    if (apiMessages[apiMessages.length - 1]?.role === 'assistant') {
      apiMessages.push({
        role: 'user',
        content:
          'Continue the discussion naturally. Respond to the user\'s latest message and any relevant ' +
          'points made by other participants. Add a distinct perspective instead of repeating them, ' +
          'and do not introduce yourself or announce your role.',
      })
    }

    const unsubscribe = window.electronAPI?.onAiChatChunk?.((chunk) => {
      if (chunk.type === 'follow_ups') return
      options.onChunk?.({ agentId, ...chunk })
    })

    try {
      options.onAgentStart?.(agentId)
      const { text, reasoning, followUps, aborted } = await streamChat({
        messages: apiMessages,
        context: {
          ...(options.baseContext ?? {}),
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
          groupChat: {
            participantNames,
            directlyAddressed: responderPlan.directlyAddressed || addressedByPeer.has(agentId),
          },
        },
      })

      unsubscribe?.()

      const result: GroupTurnResult = {
        agentId,
        agentName: agent.name,
        text,
        reasoning,
        followUps,
        aborted,
      }
      yield result

      if (aborted || options.signal?.aborted) return

      transcript.push({
        role: 'assistant',
        content: text,
        senderAgentId: agentId,
        senderName: agent.name,
        senderAvatar: agent.image,
        reasoning,
        followUps,
      })

      // Let the agent hand off to peers it @mentioned. Promote/insert them at
      // the front of the remaining queue without duplicating router-scheduled
      // agents or re-running anyone who already spoke this turn.
      const mentioned = findMentionedAgentIds(text, availableIds, agentById)
      if (mentioned.length > 0) {
        const { queue, scheduled } = applyPeerMentionsToQueue({
          remaining,
          mentioned,
          spoken,
          speakerId: agentId,
        })
        if (scheduled.length > 0) {
          remaining.splice(0, remaining.length, ...queue)
          for (const scheduledId of scheduled) addressedByPeer.add(scheduledId)
          options.onSmartRoutingUpdate?.({
            phase: 'selected',
            agentIds: [...spoken, ...remaining],
          })
        }
      }
    } catch (err) {
      unsubscribe?.()
      yield {
        agentId,
        agentName: agent.name,
        text: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
      }
    }
  }
}

import type { Agent } from '../types/Agent'
import type { Conversation, ConversationMessage } from '../types/Conversation'

export interface GroupTurnChunk {
  type: 'reasoning' | 'answer'
  agentId: string
  content: string
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
  /** Called with live streaming deltas as each agent's reply is generated. */
  onChunk?: (chunk: GroupTurnChunk) => void
  /** Extra chat context shared with every participant (route, portfolio, etc). */
  baseContext?: Record<string, unknown>
}

export interface GroupResponderPlan {
  agentIds: string[]
  directlyAddressed: boolean
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
    return { agentIds: shuffleAgentIds(availableIds, random), directlyAddressed: false }
  }

  const firstNameCounts = new Map<string, number>()
  for (const agentId of availableIds) {
    const firstName = agentById.get(agentId)?.name.trim().split(/\s+/)[0]?.toLocaleLowerCase()
    if (firstName) firstNameCounts.set(firstName, (firstNameCounts.get(firstName) ?? 0) + 1)
  }

  const mentioned = availableIds
    .map((agentId) => {
      const agent = agentById.get(agentId)!
      const fullName = agent.name.trim()
      const firstName = fullName.split(/\s+/)[0]
      const fullNameIndex = mentionIndex(userText, fullName)
      const firstNameIndex = firstNameCounts.get(firstName.toLocaleLowerCase()) === 1
        ? mentionIndex(userText, firstName)
        : -1
      const indexes = [fullNameIndex, firstNameIndex].filter((index) => index >= 0)
      return { agentId, index: indexes.length > 0 ? Math.min(...indexes) : -1 }
    })
    .filter((mention) => mention.index >= 0)
    .sort((left, right) => left.index - right.index)

  if (mentioned.length > 0) {
    return { agentIds: mentioned.map((mention) => mention.agentId), directlyAddressed: true }
  }

  return { agentIds: shuffleAgentIds(availableIds, random), directlyAddressed: false }
}

/**
 * Runs one group turn. Direct @mentions route to the addressed agent(s);
 * otherwise every participant replies in a shuffled order. Each responder sees
 * the transcript so far (including prior agents' replies from this turn).
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
  const responderPlan = planGroupResponders(conversation, agents, userMessage.content)
  const participantNames = conversation.participantAgentIds
    .map((agentId) => agentById.get(agentId)?.name)
    .filter((name): name is string => !!name)

  for (const agentId of responderPlan.agentIds) {
    if (options.signal?.aborted) return
    const agent = agentById.get(agentId)
    if (!agent) continue

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
      options.onChunk?.({ type: chunk.type, agentId, content: chunk.content })
    })

    try {
      const { text, reasoning, followUps, aborted } = await streamChat({
        messages: apiMessages,
        context: {
          ...(options.baseContext ?? {}),
          agentPersona: { name: agent.name, systemPrompt: agent.systemPrompt },
          groupChat: {
            participantNames,
            directlyAddressed: responderPlan.directlyAddressed,
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

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

/**
 * Runs one "group turn": every participant agent replies, in order, to the same
 * user message, each seeing the transcript so far (including prior agents'
 * replies from this turn). Since the shared ChatMessage/IPC contract has no
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

  for (const agentId of conversation.participantAgentIds) {
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
          `Continue the group conversation as ${agent.name}. Respond to the user's most recent ` +
          'message, taking the other participants\' replies into account and adding your own useful perspective.',
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

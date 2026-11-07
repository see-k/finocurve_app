import type { Agent } from '../types/Agent'

/**
 * Remote A2A conversation a reply belongs to. Stored on the expert's reply so the
 * next turn continues the same remote session instead of starting a new one.
 * The URL and agent id pin it to the configuration that created it.
 */
export interface A2ASessionRef {
  contextId: string
  url: string
  agentId?: string
}

/** What the main process needs to continue a session. */
export interface A2ASessionResume {
  contextId: string
  /** Trailing request messages the remote agent has not seen yet. */
  newMessageCount: number
}

type A2AAgentFields = Pick<Agent, 'id' | 'provider' | 'a2aUrl' | 'a2aAgentId'>

function sameTarget(agent: A2AAgentFields, session: A2ASessionRef): boolean {
  return session.url === (agent.a2aUrl?.trim() || '') &&
    (session.agentId || '') === (agent.a2aAgentId?.trim() || '')
}

/** Session reference to store on a reply, or undefined for non-A2A experts. */
export function a2aSessionRef(
  agent: A2AAgentFields | null | undefined,
  contextId: string | undefined,
): A2ASessionRef | undefined {
  if (agent?.provider !== 'a2a' || !contextId) return undefined
  const agentId = agent.a2aAgentId?.trim()
  return { contextId, url: agent.a2aUrl?.trim() || '', ...(agentId ? { agentId } : {}) }
}

export function isA2ASessionRef(value: unknown): value is A2ASessionRef {
  if (!value || typeof value !== 'object') return false
  const ref = value as Record<string, unknown>
  return typeof ref.contextId === 'string' && ref.contextId !== '' &&
    typeof ref.url === 'string' &&
    (ref.agentId === undefined || typeof ref.agentId === 'string')
}

/**
 * Finds the session this expert's latest reply belongs to. `history` is the
 * visible transcript and `sentMessageCount` the request messages built from it
 * (the same messages in order, plus any request-only prompt appended at the end),
 * so everything after that reply is what the remote agent has not seen.
 */
export function resumeA2ASession(
  agent: A2AAgentFields | null | undefined,
  history: readonly { senderAgentId?: string; a2aSession?: A2ASessionRef }[],
  sentMessageCount: number,
): A2ASessionResume | undefined {
  if (agent?.provider !== 'a2a') return undefined
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index]
    if (message.senderAgentId !== agent.id) continue
    // Replies without a session (errors, stopped turns) did not advance it; look further back.
    if (!message.a2aSession) continue
    if (!sameTarget(agent, message.a2aSession)) return undefined
    return {
      contextId: message.a2aSession.contextId,
      newMessageCount: Math.max(1, sentMessageCount - (index + 1)),
    }
  }
  return undefined
}

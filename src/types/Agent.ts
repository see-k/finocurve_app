export interface Agent {
  id: string
  /** Display name for the agent, e.g. "Portfolio Analyst" */
  name: string
  /** Short one-line description shown in list views */
  description?: string
  /** Searchable professional specialties shown on expert cards and used by routing. */
  specialties?: string[]
  /** Inactive experts remain saved but cannot be added to or respond in chats. Defaults to true. */
  isActive?: boolean
  /** System prompt that defines the agent's behavior/persona */
  systemPrompt: string
  /** Data URL for the agent's avatar image, if any */
  image?: string
  /** Optional AI provider override; falls back to the global AI config when unset */
  provider?: 'ollama' | 'bedrock' | 'azure'
  /** Optional model override; falls back to the global AI config when unset */
  model?: string
  /** Which tools this expert may discover and invoke. Older profiles default to all. */
  toolAccess?: 'all' | 'selected' | 'none'
  /** Tool allowlist used when toolAccess is selected. */
  enabledToolNames?: string[]
  /**
   * True for the app's built-in default assistant (the one that powers the floating chat bubble).
   * There is always exactly one default agent; it is editable but cannot be deleted or deactivated.
   */
  isDefault?: boolean
  createdAt: string
  updatedAt: string
}

export type AgentInput = Pick<Agent, 'name' | 'systemPrompt'> &
  Partial<Pick<
    Agent,
    | 'description'
    | 'specialties'
    | 'isActive'
    | 'image'
    | 'provider'
    | 'model'
    | 'toolAccess'
    | 'enabledToolNames'
  >>

/** Stable id of the built-in default assistant that powers the floating chat bubble. */
export const DEFAULT_AGENT_ID = 'agent-default'

export function isAgentActive(agent: Agent): boolean {
  return agent.isActive !== false
}

export function isDefaultAgent(agent: Agent): boolean {
  return agent.isDefault === true || agent.id === DEFAULT_AGENT_ID
}

/**
 * Factory for the built-in default assistant. Seeded automatically so the app always has at least
 * one agent. Its persona layers on top of the base FinoCurve assistant prompt in LocalAIService,
 * so editing it customizes the floating-bubble assistant while keeping its full toolset.
 */
export function createDefaultAgent(): Agent {
  const now = new Date().toISOString()
  return {
    id: DEFAULT_AGENT_ID,
    name: 'FinoCurve Assistant',
    description: 'Your built-in financial copilot',
    specialties: ['Portfolio', 'Risk', 'Research'],
    isActive: true,
    isDefault: true,
    systemPrompt:
      'You are the FinoCurve Assistant, the built-in AI copilot for the FinoCurve app. Help the user ' +
      'understand and act on their finances: portfolio holdings and performance, risk metrics, uploaded ' +
      'documents, congressional trading disclosures, SEC filings, and generated reports. You can also ' +
      'navigate the app on the user\'s behalf. Be clear, concise, and practical, and always ground answers ' +
      'in the user\'s FinoCurve data using the available tools.',
    toolAccess: 'all',
    createdAt: now,
    updatedAt: now,
  }
}

export function getAgentToolCount(agent: Agent, availableToolCount: number): number {
  if (agent.toolAccess === 'none') return 0
  if (agent.toolAccess === 'selected') return Math.min(agent.enabledToolNames?.length ?? 0, availableToolCount)
  return availableToolCount
}

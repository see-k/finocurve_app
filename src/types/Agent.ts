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

export function isAgentActive(agent: Agent): boolean {
  return agent.isActive !== false
}

export function getAgentToolCount(agent: Agent, availableToolCount: number): number {
  if (agent.toolAccess === 'none') return 0
  if (agent.toolAccess === 'selected') return Math.min(agent.enabledToolNames?.length ?? 0, availableToolCount)
  return availableToolCount
}

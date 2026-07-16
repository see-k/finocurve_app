export interface Agent {
  id: string
  /** Display name for the agent, e.g. "Portfolio Analyst" */
  name: string
  /** Short one-line description shown in list views */
  description?: string
  /** System prompt that defines the agent's behavior/persona */
  systemPrompt: string
  /** Data URL for the agent's avatar image, if any */
  image?: string
  /** Optional AI provider override; falls back to the global AI config when unset */
  provider?: 'ollama' | 'bedrock' | 'azure'
  /** Optional model override; falls back to the global AI config when unset */
  model?: string
  createdAt: string
  updatedAt: string
}

export type AgentInput = Pick<Agent, 'name' | 'systemPrompt'> &
  Partial<Pick<Agent, 'description' | 'image' | 'provider' | 'model'>>

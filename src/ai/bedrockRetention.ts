import type { Agent } from '../types/Agent'

/**
 * Models whose Bedrock (and cross-cloud) terms require `provider_data_share`:
 * prompts and completions may leave AWS and be retained by the model provider
 * (currently Anthropic) for trust and safety — typically up to 30 days.
 */
const PROVIDER_DATA_SHARE_MODEL_PATTERN = /(?:claude[-_.\s]?)?(?:fable|mythos)[-_.\s]?5\b/i

/** True when the model ID requires provider data-share retention (e.g. Claude Fable 5). */
export function requiresProviderDataShareRetention(modelId: string | undefined | null): boolean {
  const normalized = modelId?.trim()
  if (!normalized) return false
  return PROVIDER_DATA_SHARE_MODEL_PATTERN.test(normalized)
}

export function effectiveAgentModel(
  agent: Pick<Agent, 'provider' | 'model'>,
  primaryProvider: 'ollama' | 'bedrock' | 'azure',
  primaryModel: string,
): { provider: 'ollama' | 'bedrock' | 'azure'; model: string } {
  return {
    provider: agent.provider || primaryProvider,
    model: (agent.model || primaryModel).trim(),
  }
}

/**
 * Returns participants whose effective model requires provider data-share
 * retention. Ollama is never flagged; Bedrock/Azure Fable/Mythos IDs are.
 */
export function agentsRequiringProviderDataShare(
  agents: Agent[],
  primaryProvider: 'ollama' | 'bedrock' | 'azure',
  primaryModel: string,
): Agent[] {
  return agents.filter((agent) => {
    const { provider, model } = effectiveAgentModel(agent, primaryProvider, primaryModel)
    if (provider === 'ollama') return false
    return requiresProviderDataShareRetention(model)
  })
}

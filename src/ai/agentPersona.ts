import type { Agent } from '../types/Agent'
import type { ChatContext } from './types'

/** Persona payload sent with chat so the main process can use this expert's model/tools. */
export function toChatAgentPersona(agent: Agent): NonNullable<ChatContext['agentPersona']> {
  return {
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
    slackUserToken: agent.slackUserToken,
    slackBotUserId: agent.slackBotUserId,
    slackDmChannel: agent.slackDmChannel,
    toolAccess: agent.provider === 'slack' ? 'none' : agent.toolAccess,
    enabledToolNames: agent.provider === 'slack' ? undefined : agent.enabledToolNames,
    toolLimits: agent.provider === 'slack' ? undefined : agent.toolLimits,
  }
}

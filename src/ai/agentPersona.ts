import type { Agent } from '../types/Agent'
import { isRemoteAgent } from '../types/Agent'
import type { ChatContext } from './types'

/** Persona payload sent with chat so the main process can use this expert's model/tools. */
export function toChatAgentPersona(agent: Agent): NonNullable<ChatContext['agentPersona']> {
  const remote = isRemoteAgent(agent)
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
    a2aUrl: agent.a2aUrl,
    a2aToken: agent.a2aToken,
    a2aAgentId: agent.a2aAgentId,
    toolAccess: remote ? 'none' : agent.toolAccess,
    enabledToolNames: remote ? undefined : agent.enabledToolNames,
    toolLimits: remote ? undefined : agent.toolLimits,
  }
}

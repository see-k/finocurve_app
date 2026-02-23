/**
 * Chat model factory - creates the appropriate LangChain chat model based on provider.
 * Supports Ollama, AWS Bedrock, and Azure OpenAI.
 */

import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { ChatOllama } from '@langchain/ollama'
import { ChatBedrockConverse } from '@langchain/aws'
import { AzureChatOpenAI } from '@langchain/openai'
import type { AIConfig } from './config'

export function createChatModel(config: AIConfig): BaseChatModel {
  const { providerType, model } = config

  switch (providerType) {
    case 'ollama': {
      return new ChatOllama({
        baseUrl: config.ollamaBaseUrl ?? 'http://localhost:11434',
        model: model || 'llama3.2',
      })
    }

    case 'bedrock': {
      const region = config.bedrockRegion || 'us-east-1'
      const credentials =
        config.bedrockAccessKeyId && config.bedrockSecretKey
          ? {
              accessKeyId: config.bedrockAccessKeyId,
              secretAccessKey: config.bedrockSecretKey,
            }
          : undefined

      return new ChatBedrockConverse({
        model: model || 'anthropic.claude-3-haiku-20240307-v1:0',
        region,
        credentials,
      })
    }

    case 'azure': {
      return new AzureChatOpenAI({
        azureOpenAIApiKey: config.azureApiKey,
        azureOpenAIEndpoint: config.azureEndpoint,
        azureOpenAIApiDeploymentName: config.azureDeployment || model || 'gpt-4',
        azureOpenAIApiVersion: '2024-02-01',
      })
    }

    default:
      throw new Error(`Unknown AI provider type: ${providerType}`)
  }
}

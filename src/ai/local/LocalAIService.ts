/**
 * Local AI Service - Multi-provider (Ollama, Bedrock, Azure) + LangChain implementation.
 * Runs in Electron main process. No React/Electron imports.
 * Supports tool-calling for portfolio, documents, and risk metrics.
 */

import type { BaseMessage } from '@langchain/core/messages'
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages'
import type {
  AIService,
  DocumentRef,
  DocumentInsight,
  ChatMessage,
  ChatContext,
  PortfolioContext,
  Tool,
} from '../types'
import { getAIConfig, type AIConfig } from '../config'
import { createChatModel } from '../createChatModel'
import { extractTextFromDocument } from './documentParser'
import { createFinocurveTools } from './tools'

export interface LocalAIServiceOptions {
  getDocumentContent: (key: string, source: 'cloud' | 'local') => Promise<{ buffer: Uint8Array; mimeType?: string } | null>
  getPortfolioContext: () => Promise<PortfolioContext | null>
  getDocumentList: () => Promise<DocumentRef[]>
  getRiskMetrics?: () => Promise<string>
  config?: Partial<AIConfig>
}

export class LocalAIService implements AIService {
  private model: ReturnType<typeof createChatModel>
  private options: LocalAIServiceOptions

  constructor(options: LocalAIServiceOptions) {
    const config = getAIConfig(options.config)
    this.options = options
    this.model = createChatModel(config)
  }

  async generateDocumentInsights(
    documents: DocumentRef[],
    portfolioContext?: PortfolioContext
  ): Promise<DocumentInsight[]> {
    const insights: DocumentInsight[] = []

    for (const doc of documents) {
      try {
        const content = await this.options.getDocumentContent(doc.key, doc.source)
        if (!content) {
          insights.push({
            documentKey: doc.key,
            documentName: doc.fileName,
            summary: 'Could not read document content.',
            riskRelevantPoints: [],
            recommendations: [],
          })
          continue
        }

        const text = await extractTextFromDocument(content.buffer, content.mimeType, doc.fileName)
        if (!text || text.trim().length < 10) {
          insights.push({
            documentKey: doc.key,
            documentName: doc.fileName,
            summary: 'Document has little or no extractable text.',
            riskRelevantPoints: [],
            recommendations: [],
          })
          continue
        }

        const portfolioStr = portfolioContext
          ? `Portfolio: ${portfolioContext.portfolioName}, value ~$${portfolioContext.totalValue.toLocaleString()}, ${portfolioContext.assetCount} assets.`
          : 'No portfolio context.'

        const systemPrompt = `You are a financial risk analyst assistant. Analyze the following document and extract insights relevant to investment risk, tax implications, or financial planning. Be concise. Output JSON with: summary (string), riskRelevantPoints (string[]), recommendations (string[]).`

        const userPrompt = `${portfolioStr}\n\nDocument "${doc.fileName}":\n\n${text.slice(0, 12000)}`

        const response = await this.model.invoke([
          new SystemMessage(systemPrompt),
          new HumanMessage(userPrompt),
        ])

        const contentStr = typeof response.content === 'string' ? response.content : String(response.content)
        const parsed = parseInsightResponse(contentStr, doc.key, doc.fileName)
        insights.push(parsed)
      } catch (err) {
        insights.push({
          documentKey: doc.key,
          documentName: doc.fileName,
          summary: `Analysis failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
          riskRelevantPoints: [],
          recommendations: [],
        })
      }
    }

    return insights
  }

  async *chat(
    messages: ChatMessage[],
    context: ChatContext
  ): AsyncGenerator<string, void, unknown> {
    const systemParts: string[] = [
      'You are a helpful financial assistant for FinoCurve, an investment banking app. You can answer questions about the user\'s portfolio, documents, and risk metrics. Use the available tools when you need current data.',
    ]
    if (context.portfolioSummary) systemParts.push(`Current context: ${context.portfolioSummary}`)
    if (context.documentCount !== undefined) systemParts.push(`User has ${context.documentCount} documents.`)

    const toolContext = {
      getPortfolioContext:
        context.portfolioContext !== undefined
          ? async () => context.portfolioContext ?? null
          : this.options.getPortfolioContext,
      getDocumentList: this.options.getDocumentList,
      getDocumentContent: this.options.getDocumentContent,
      getRiskMetrics:
        context.riskMetrics !== undefined
          ? async () => (context.riskMetrics ?? 'Not available')
          : (this.options.getRiskMetrics ?? (async () => 'Not available')),
      extractTextFromDocument,
    }

    const tools = createFinocurveTools(toolContext)
    const modelWithTools =
      typeof this.model.bindTools === 'function'
        ? this.model.bindTools(tools)
        : null

    const langchainMessages = [
      new SystemMessage(systemParts.join('\n')),
      ...messages.map((m) =>
        m.role === 'user'
          ? new HumanMessage(m.content)
          : m.role === 'assistant'
            ? new AIMessage(m.content)
            : new SystemMessage(m.content)
      ),
    ]

    const MAX_TOOL_ROUNDS = 5
    let round = 0
    let currentMessages: BaseMessage[] = langchainMessages
    const modelToUse = modelWithTools ?? this.model

    while (round < MAX_TOOL_ROUNDS) {
      const response = await modelToUse.invoke(currentMessages)
      const aiMessage = AIMessage.isInstance(response) ? response : new AIMessage({ content: response })

      const toolCalls = aiMessage.tool_calls
      if (!toolCalls || toolCalls.length === 0) {
        const content = typeof aiMessage.content === 'string' ? aiMessage.content : String(aiMessage.content ?? '')
        if (content) yield content
        return
      }

      const toolMessages: ToolMessage[] = []
      const toolMap = new Map(tools.map((t) => [t.name, t]))

      for (const tc of toolCalls) {
        const tool = toolMap.get(tc.name)
        const id = tc.id ?? `call_${tc.name}_${round}`
        try {
          const result = tool
            ? await (tool as { invoke: (args: unknown) => Promise<unknown> }).invoke(tc.args ?? {})
            : `Tool ${tc.name} not found`
          const resultStr = typeof result === 'string' ? result : JSON.stringify(result)
          toolMessages.push(new ToolMessage({ content: resultStr, tool_call_id: id }))
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : 'Tool execution failed'
          toolMessages.push(new ToolMessage({ content: `Error: ${errMsg}`, tool_call_id: id, status: 'error' }))
        }
      }

      currentMessages = [...currentMessages, aiMessage, ...toolMessages]
      round++
    }

    yield 'I reached the maximum number of tool calls. Please try a simpler question.'
  }

  getTools(): Tool[] {
    return [
      { name: 'get_portfolio_summary', description: 'Get portfolio value, risk score, top holdings' },
      { name: 'get_document_list', description: 'List documents in finocurve/documents/' },
      { name: 'get_document_content', description: 'Fetch text from a document by key' },
      { name: 'get_risk_metrics', description: 'Get current risk analysis result' },
    ]
  }
}

function parseInsightResponse(
  raw: string,
  documentKey: string,
  documentName: string
): DocumentInsight {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const obj = JSON.parse(jsonMatch[0]) as {
        summary?: string
        riskRelevantPoints?: string[]
        recommendations?: string[]
      }
      return {
        documentKey,
        documentName,
        summary: obj.summary ?? 'No summary extracted.',
        riskRelevantPoints: Array.isArray(obj.riskRelevantPoints) ? obj.riskRelevantPoints : [],
        recommendations: Array.isArray(obj.recommendations) ? obj.recommendations : [],
      }
    }
  } catch {
    /* fall through */
  }

  return {
    documentKey,
    documentName,
    summary: raw.slice(0, 500) || 'No summary extracted.',
    riskRelevantPoints: [],
    recommendations: [],
  }
}

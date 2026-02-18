/**
 * Local AI Service - Multi-provider (Ollama, Bedrock, Azure) + LangChain implementation.
 * Runs in Electron main process. No React/Electron imports.
 */

import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages'
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
      'You are a helpful financial assistant for FinoCurve, an investment banking app. You can answer questions about the user\'s portfolio, documents, and risk metrics. Use the available tools when needed.',
    ]
    if (context.portfolioSummary) systemParts.push(`Current context: ${context.portfolioSummary}`)
    if (context.documentCount !== undefined) systemParts.push(`User has ${context.documentCount} documents.`)

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

    const stream = await this.model.stream(langchainMessages)

    for await (const chunk of stream) {
      const text = typeof chunk.content === 'string' ? chunk.content : String(chunk.content ?? '')
      if (text) yield text
    }
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

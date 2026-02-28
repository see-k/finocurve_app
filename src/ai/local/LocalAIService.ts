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
  getReportList: () => Promise<DocumentRef[]>
  getRiskMetrics?: () => Promise<string>
  getCongressCache?: () => Promise<{ senate: Record<string, unknown>[]; house: Record<string, unknown>[]; senateFetchedAt?: string; houseFetchedAt?: string } | null>
  getSECSubmissions?: (tickerOrCik: string) => Promise<{ data: unknown; error: string | null }>
  getSECFilingContent?: (tickerOrCik: string, accessionNumber: string) => Promise<{ content: string | null; error: string | null }>
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

  async generateAdvancedAnalysis(payload: {
    riskSummary: string
    portfolioSummary: string
    documentContent?: { fileName: string; text: string }
  }): Promise<{ sections: { title: string; content: string }[] }> {
    const systemPrompt = `You are a seasoned financial consultant preparing a professional risk analysis report. Write in a clear, authoritative tone. Do not mention AI, models, automation, or any technology. Write as if you are a human analyst delivering the report to a client. Be specific and actionable. Output valid JSON only, no markdown.`

    let userPrompt = `Portfolio:\n${payload.portfolioSummary}\n\nRisk Analysis:\n${payload.riskSummary}`
    if (payload.documentContent?.text) {
      userPrompt += `\n\nSupporting document (${payload.documentContent.fileName}):\n${payload.documentContent.text.slice(0, 8000)}`
    }
    userPrompt += `\n\nProduce a professional analysis. Output JSON with exactly these keys:
- executiveSummary: string (2-3 paragraphs)
- keyFindings: string[] (5-7 bullet points)
- recommendations: string[] (4-6 actionable items)
- riskObservations: string (1 paragraph on risk profile)
- allocationNotes: string (1 paragraph on allocation)`

    const response = await this.model.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt),
    ])
    const raw = typeof response.content === 'string' ? response.content : String(response.content ?? '')
    const parsed = parseAdvancedAnalysisResponse(raw)
    return parsed
  }

  async *chat(
    messages: ChatMessage[],
    context: ChatContext
  ): AsyncGenerator<string, void, unknown> {
    const systemParts: string[] = [
      'You are a helpful financial assistant for FinoCurve, an investment banking app. You can answer questions about the user\'s portfolio, documents, risk metrics, congressional financial disclosures (STOCK Act), and SEC EDGAR filings. Use the available tools when you need current data.',
      'IMPORTANT: Always cite your sources to build trust. When you use tool data (portfolio, documents, reports, risk metrics, congressional trades, SEC filings), explicitly reference where the information came from. For example: "According to your portfolio data...", "Based on Senate disclosure data...", "From SEC EDGAR filings for AAPL...". Be specific about document or data source names when citing.',
    ]
    if (context.portfolioSummary) systemParts.push(`Current context: ${context.portfolioSummary}`)
    if (context.documentCount !== undefined) systemParts.push(`User has ${context.documentCount} documents.`)

    const toolContext = {
      getPortfolioContext:
        context.portfolioContext !== undefined
          ? async () => context.portfolioContext ?? null
          : this.options.getPortfolioContext,
      getDocumentList: this.options.getDocumentList,
      getReportList: this.options.getReportList,
      getDocumentContent: this.options.getDocumentContent,
      getRiskMetrics:
        context.riskMetrics !== undefined
          ? async () => (context.riskMetrics ?? 'Not available')
          : (this.options.getRiskMetrics ?? (async () => 'Not available')),
      extractTextFromDocument,
      getCongressCache: this.options.getCongressCache,
      getSECSubmissions: this.options.getSECSubmissions,
      getSECFilingContent: this.options.getSECFilingContent,
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
    const base: Tool[] = [
      { name: 'get_portfolio_summary', description: 'Get portfolio value, risk score, top holdings' },
      { name: 'get_document_list', description: 'List documents in finocurve/documents/' },
      { name: 'get_document_content', description: 'Fetch text from a document by key' },
      { name: 'get_report_list', description: 'List risk reports in finocurve/reports/' },
      { name: 'get_report_content', description: 'Fetch text from a report by key' },
      { name: 'get_risk_metrics', description: 'Get current risk analysis result' },
    ]
    if (this.options.getCongressCache) {
      base.push({ name: 'get_congressional_trades', description: 'Get cached Senate/House financial disclosures' })
    }
    if (this.options.getSECSubmissions) {
      base.push({ name: 'get_sec_filings', description: 'Get SEC EDGAR filings for a ticker or CIK' })
    }
    if (this.options.getSECFilingContent) {
      base.push({
        name: 'get_sec_filing_content',
        description: 'Fetch full text of a specific SEC filing by accession number',
      })
    }
    return base
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

function parseAdvancedAnalysisResponse(raw: string): { sections: { title: string; content: string }[] } {
  const sections: { title: string; content: string }[] = []
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const obj = JSON.parse(jsonMatch[0]) as {
        executiveSummary?: string
        keyFindings?: string[]
        recommendations?: string[]
        riskObservations?: string
        allocationNotes?: string
      }
      if (obj.executiveSummary) sections.push({ title: 'Executive Summary', content: obj.executiveSummary })
      if (Array.isArray(obj.keyFindings) && obj.keyFindings.length > 0) {
        sections.push({ title: 'Key Findings', content: obj.keyFindings.map((f) => `• ${f}`).join('\n') })
      }
      if (obj.riskObservations) sections.push({ title: 'Risk Observations', content: obj.riskObservations })
      if (obj.allocationNotes) sections.push({ title: 'Allocation Notes', content: obj.allocationNotes })
      if (Array.isArray(obj.recommendations) && obj.recommendations.length > 0) {
        sections.push({ title: 'Recommendations', content: obj.recommendations.map((r) => `• ${r}`).join('\n') })
      }
    }
  } catch {
    sections.push({ title: 'Analysis', content: raw.slice(0, 2000) || 'Analysis could not be generated.' })
  }
  if (sections.length === 0) sections.push({ title: 'Analysis', content: 'No analysis content was produced.' })
  return { sections }
}

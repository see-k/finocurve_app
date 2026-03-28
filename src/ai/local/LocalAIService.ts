/**
 * Local AI Service - Multi-provider (Ollama, Bedrock, Azure) + LangChain implementation.
 * Runs in Electron main process. No React/Electron imports.
 * Supports tool-calling for portfolio, documents, and risk metrics.
 */

import { Buffer } from 'node:buffer'
import type { BaseMessage } from '@langchain/core/messages'
import { AIMessage, AIMessageChunk, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages'
import type {
  AIService,
  ChatFollowUp,
  ChatStreamChunk,
  DocumentRef,
  DocumentInsight,
  ChatMessage,
  ChatContext,
  PortfolioContext,
  Tool,
} from '../types'
import { getAIConfig, type AIConfig } from '../config'
import { createChatModel } from '../createChatModel'
import type { StructuredToolInterface } from '@langchain/core/tools'
import { extractTextFromDocument } from './documentParser'
import { createFinocurveTools, type FinocurveToolContext } from './tools'

/** Parse AIMessage content into reasoning + answer chunks for display. */
function parseContentToChunks(message: AIMessage): ChatStreamChunk[] {
  const chunks: ChatStreamChunk[] = []

  try {
    const blocks = message.contentBlocks
    if (blocks && blocks.length > 0) {
      for (const block of blocks) {
        if (block.type === 'reasoning' && 'reasoning' in block && typeof (block as { reasoning?: string }).reasoning === 'string') {
          const r = (block as { reasoning: string }).reasoning
          if (r.trim()) chunks.push({ type: 'reasoning', content: r })
        } else if (block.type === 'text' && 'text' in block && typeof (block as { text?: string }).text === 'string') {
          const t = (block as { text: string }).text
          if (t.trim()) chunks.push({ type: 'answer', content: t })
        }
      }
      if (chunks.length > 0) return chunks
    }
  } catch {
    /* contentBlocks may throw; fall through */
  }

  const raw = typeof message.content === 'string' ? message.content : String(message.content ?? '')
  if (!raw.trim()) return []

  const thinkMatch = raw.match(/<think>([\s\S]*?)<\/think>/i)
  if (thinkMatch) {
    const reasoning = thinkMatch[1].trim()
    if (reasoning) chunks.push({ type: 'reasoning', content: reasoning })
  }

  const answerPart = thinkMatch
    ? raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
    : raw
  if (answerPart) chunks.push({ type: 'answer', content: answerPart })

  return chunks.length > 0 ? chunks : [{ type: 'answer', content: raw }]
}

const MAX_VISION_IMAGE_BYTES = 12 * 1024 * 1024
const MAX_ATTACHMENT_TEXT_CHARS = 80_000

function isVisionImageMime(mime: string): boolean {
  const m = mime.toLowerCase().split(';')[0].trim()
  return (
    m === 'image/png' ||
    m === 'image/jpeg' ||
    m === 'image/jpg' ||
    m === 'image/gif' ||
    m === 'image/webp'
  )
}

const TEXT_LIKE_EXTENSIONS = new Set([
  '.json',
  '.md',
  '.markdown',
  '.html',
  '.htm',
  '.xml',
  '.txt',
  '.csv',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.sql',
  '.yaml',
  '.yml',
  '.log',
])

function fileExtLower(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i).toLowerCase() : ''
}

function isProbablyUtf8TextFile(fileName: string, mime: string): boolean {
  const m = mime.toLowerCase()
  if (m.startsWith('text/') || m.includes('json') || m.includes('xml') || m.includes('javascript')) {
    return true
  }
  return TEXT_LIKE_EXTENSIONS.has(fileExtLower(fileName))
}

/** Build a LangChain user message with optional vision blocks and inlined document text. */
async function chatUserToHumanMessage(message: ChatMessage): Promise<HumanMessage> {
  const attachments = message.attachments
  if (!attachments?.length) {
    return new HumanMessage(message.content)
  }

  const supplemental: string[] = []
  const imageBlocks: { type: 'image_url'; image_url: { url: string } }[] = []

  for (const att of attachments) {
    const name = att.name?.trim() || 'attachment'
    let buf: Uint8Array
    try {
      buf = new Uint8Array(Buffer.from(att.dataBase64, 'base64'))
    } catch {
      supplemental.push(`[Attached ${name}: invalid base64 encoding]`)
      continue
    }
    if (buf.length === 0) {
      supplemental.push(`[Attached ${name}: empty file]`)
      continue
    }

    const mime = (att.mimeType || 'application/octet-stream').toLowerCase().split(';')[0].trim()

    if (isVisionImageMime(mime)) {
      if (buf.length > MAX_VISION_IMAGE_BYTES) {
        supplemental.push(
          `[Image ${name} skipped: file exceeds ${MAX_VISION_IMAGE_BYTES / 1024 / 1024}MB limit]`
        )
        continue
      }
      const b64 = Buffer.from(buf).toString('base64')
      imageBlocks.push({
        type: 'image_url',
        image_url: { url: `data:${mime};base64,${b64}` },
      })
      continue
    }

    let extracted = ''
    try {
      extracted = (await extractTextFromDocument(buf, mime, name)).trim()
    } catch (e) {
      supplemental.push(
        `[Attached ${name}: text extraction failed — ${e instanceof Error ? e.message : 'unknown error'}]`
      )
      continue
    }

    if (!extracted && isProbablyUtf8TextFile(name, mime)) {
      extracted = new TextDecoder('utf-8', { fatal: false }).decode(buf).trim()
    }

    if (extracted) {
      const body =
        extracted.length > MAX_ATTACHMENT_TEXT_CHARS
          ? `${extracted.slice(0, MAX_ATTACHMENT_TEXT_CHARS)}\n… [truncated]`
          : extracted
      supplemental.push(`--- ${name} ---\n${body}`)
    } else {
      supplemental.push(
        `[Attached ${name}: no extractable text. Supported: images (PNG, JPEG, GIF, WebP), PDF, CSV, TXT, and common text/code formats.]`
      )
    }
  }

  const textBody = [message.content.trim(), supplemental.filter(Boolean).join('\n\n')]
    .filter(Boolean)
    .join('\n\n')
    .trim()
  const finalText = textBody || '(User attached files only.)'

  if (imageBlocks.length === 0) {
    return new HumanMessage(finalText)
  }

  return new HumanMessage({
    content: [{ type: 'text', text: finalText }, ...imageBlocks],
  })
}

async function messagesToLangChain(messages: ChatMessage[]): Promise<BaseMessage[]> {
  const out: BaseMessage[] = []
  for (const m of messages) {
    if (m.role === 'user') {
      out.push(await chatUserToHumanMessage(m))
    } else if (m.role === 'assistant') {
      out.push(new AIMessage(m.content))
    } else {
      out.push(new SystemMessage(m.content))
    }
  }
  return out
}

function normalizeChatFollowUps(items: { label: string; prompt: string }[]): ChatFollowUp[] {
  return items
    .filter(
      (i) =>
        typeof i.label === 'string' &&
        i.label.trim().length > 0 &&
        typeof i.prompt === 'string' &&
        i.prompt.trim().length > 0
    )
    .slice(0, 5)
    .map((i) => ({
      label: i.label.trim().slice(0, 100),
      prompt: i.prompt.trim().slice(0, 4000),
    }))
}

/** Extract reasoning/answer content from a single streaming AIMessageChunk. */
function extractStreamingContent(chunk: AIMessageChunk): { type: 'reasoning' | 'answer'; content: string } | null {
  const content = chunk.content
  if (typeof content === 'string') {
    return content ? { type: 'answer', content } : null
  }
  if (Array.isArray(content)) {
    for (const block of content) {
      if (typeof block === 'object' && block !== null) {
        const b = block as Record<string, unknown>
        if ((b.type === 'reasoning' || b.type === 'thinking') && typeof b.reasoning === 'string' && b.reasoning) {
          return { type: 'reasoning', content: b.reasoning }
        }
        if (b.type === 'text' && typeof b.text === 'string' && b.text) {
          return { type: 'answer', content: b.text }
        }
      }
    }
  }
  return null
}

/** Stateful parser for Ollama-style <think>...</think> tags spanning multiple chunks. */
class ThinkTagParser {
  private insideThink = false

  parse(text: string): ChatStreamChunk[] {
    const chunks: ChatStreamChunk[] = []
    let remaining = text

    while (remaining.length > 0) {
      if (this.insideThink) {
        const closeIdx = remaining.indexOf('</think>')
        if (closeIdx === -1) {
          if (remaining) chunks.push({ type: 'reasoning', content: remaining })
          remaining = ''
        } else {
          const before = remaining.slice(0, closeIdx)
          if (before) chunks.push({ type: 'reasoning', content: before })
          this.insideThink = false
          remaining = remaining.slice(closeIdx + '</think>'.length)
        }
      } else {
        const openIdx = remaining.indexOf('<think>')
        if (openIdx === -1) {
          if (remaining) chunks.push({ type: 'answer', content: remaining })
          remaining = ''
        } else {
          const before = remaining.slice(0, openIdx)
          if (before) chunks.push({ type: 'answer', content: before })
          this.insideThink = true
          remaining = remaining.slice(openIdx + '<think>'.length)
        }
      }
    }
    return chunks
  }
}

export interface LocalAIServiceOptions {
  getDocumentContent: (key: string, source: 'cloud' | 'local') => Promise<{ buffer: Uint8Array; mimeType?: string } | null>
  getPortfolioContext: () => Promise<PortfolioContext | null>
  getDocumentList: () => Promise<DocumentRef[]>
  getReportList: () => Promise<DocumentRef[]>
  getRiskMetrics?: () => Promise<string>
  getCongressCache?: () => Promise<{ senate: Record<string, unknown>[]; house: Record<string, unknown>[]; senateFetchedAt?: string; houseFetchedAt?: string } | null>
  getSECSubmissions?: (tickerOrCik: string) => Promise<{ data: unknown; error: string | null }>
  getSECFilingContent?: (tickerOrCik: string, accessionNumber: string) => Promise<{ content: string | null; error: string | null }>
  getMCPTools?: () => StructuredToolInterface[]
  /** Desktop: AI chat tool to save branded PDFs into documents storage */
  saveCustomBrandedReport?: FinocurveToolContext['saveCustomBrandedReport']
  /** Desktop: AI chat tool to save CSV files into documents storage */
  saveCustomCsvDocument?: FinocurveToolContext['saveCustomCsvDocument']
  /** Desktop: log a net worth snapshot to Tracker (separate from portfolio book value) */
  appendNetWorthEntry?: FinocurveToolContext['appendNetWorthEntry']
  getNetWorthLogSummary?: FinocurveToolContext['getNetWorthLogSummary']
  getTrackerGoalsSummary?: FinocurveToolContext['getTrackerGoalsSummary']
  createTrackerGoal?: FinocurveToolContext['createTrackerGoal']
  updateTrackerGoal?: FinocurveToolContext['updateTrackerGoal']
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
  ): AsyncGenerator<ChatStreamChunk, void, unknown> {
    const systemParts: string[] = [
      'You are a helpful financial assistant for FinoCurve, an investment banking app. You can answer questions about the user\'s portfolio and every holding they recorded (get_holdings), loans (get_user_loans), documents, risk metrics, congressional financial disclosures (STOCK Act), and SEC EDGAR filings. Use get_current_datetime for the real-world "today" or current time. Holdings and loans come from app data — no document upload required. Use the available tools when you need data from the app. For live web search or external data sources, the user may connect MCP servers (e.g. search tools) in AI settings — use those tools when present.',
      'IMPORTANT: Always cite your sources to build trust. When you use tool data (portfolio, documents, reports, risk metrics, congressional trades, SEC filings), explicitly reference where the information came from. For example: "According to your portfolio data...", "Based on Senate disclosure data...", "From SEC EDGAR filings for AAPL...". Be specific about document or data source names when citing.',
      'After a helpful, substantive reply (especially when tools were used), call suggest_conversation_follow_ups with 2–4 items: short labels for buttons and full prompts the app will send when tapped. Skip for trivial one-line answers. Do not duplicate the chip text as a bullet list in the prose.',
    ]
    if (this.options.saveCustomBrandedReport) {
      systemParts.push(
        'When the user asks for a PDF report, formal memo, or downloadable write-up, use save_custom_branded_report_pdf with a clear title and well-structured sections. You may attach tables (headers + row arrays) and charts (type bar, line, or pie with matching labels and numeric values) inside each section so figures appear after that section\'s narrative. The PDF uses FinoCurve branding and saves to documents when storage is configured.'
      )
    }
    if (this.options.saveCustomCsvDocument) {
      systemParts.push(
        'When the user asks for a spreadsheet, Excel-style export, table download, or CSV, use save_custom_csv_document with fileBaseName, headers (column names), and rows (array of rows matching header order). The file is UTF-8 with BOM for Excel compatibility and is saved under finocurve/documents/ when storage is configured.'
      )
    }
    if (context.portfolioSummary) systemParts.push(`Current context: ${context.portfolioSummary}`)
    if (context.documentCount !== undefined) systemParts.push(`User has ${context.documentCount} documents.`)
    const hasAttachments = messages.some((m) => m.role === 'user' && (m.attachments?.length ?? 0) > 0)
    if (hasAttachments) {
      systemParts.push(
        'The user can attach images and files to messages. Use image content when answering questions about screenshots or charts. Use inlined document excerpts (marked with --- filename ---) for PDFs, CSV, and text files. If an attachment could not be read, say so briefly and ask for a different format or pasted text.'
      )
    }

    if (
      this.options.appendNetWorthEntry ||
      this.options.getTrackerGoalsSummary ||
      this.options.createTrackerGoal ||
      this.options.updateTrackerGoal
    ) {
      const trackerBits: string[] = []
      if (this.options.appendNetWorthEntry) {
        trackerBits.push(
          'Net worth: they can log true net worth separately from portfolio holdings. To log a figure use add_net_worth_entry; to read the log use get_net_worth_log. Do not treat portfolio total as logged net worth.'
        )
      }
      if (this.options.getTrackerGoalsSummary || this.options.createTrackerGoal || this.options.updateTrackerGoal) {
        trackerBits.push(
          'Goals: use get_tracker_goals to list goals (includes goal id). Use create_tracker_goal for new goals (title, target_amount, optional target_date, progress_source). Use update_tracker_goal with goal_id to change title, target_amount, target_date, and/or progress_source; changing progress_source resets baseline like the Tracker tab. For net_worth goals they need at least one logged net worth entry before create or before switching an existing goal to net_worth.'
        )
      }
      systemParts.push(`Tracker: ${trackerBits.join(' ')}`)
    }

    const followUpRoundRef = { items: [] as ChatFollowUp[] }
    const toolContext = {
      // Prefer main-process cache (holdings, loans, topHoldings from portfolioSync) over the
      // partial object the renderer may send with chat; fall back to inline context if no cache.
      getPortfolioContext: async () => {
        const cached = await this.options.getPortfolioContext()
        if (cached) return cached
        return context.portfolioContext ?? null
      },
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
      saveCustomBrandedReport: this.options.saveCustomBrandedReport,
      saveCustomCsvDocument: this.options.saveCustomCsvDocument,
      appendNetWorthEntry: this.options.appendNetWorthEntry,
      getNetWorthLogSummary: this.options.getNetWorthLogSummary,
      getTrackerGoalsSummary: this.options.getTrackerGoalsSummary,
      createTrackerGoal: this.options.createTrackerGoal,
      updateTrackerGoal: this.options.updateTrackerGoal,
      recordSuggestedFollowUps: (items: { label: string; prompt: string }[]) => {
        followUpRoundRef.items = normalizeChatFollowUps(items)
      },
    }

    const finocurveTools = createFinocurveTools(toolContext)
    const mcpTools = this.options.getMCPTools?.() ?? []
    const tools = [...finocurveTools, ...mcpTools]
    const modelWithTools =
      typeof this.model.bindTools === 'function'
        ? this.model.bindTools(tools)
        : null

    const langchainMessages = [
      new SystemMessage(systemParts.join('\n')),
      ...(await messagesToLangChain(messages)),
    ]

    const MAX_TOOL_ROUNDS = 5
    let round = 0
    let yieldedText = false
    let currentMessages: BaseMessage[] = langchainMessages
    const modelToUse = modelWithTools ?? this.model
    const toolMap = new Map(tools.map((t) => [t.name, t]))

    while (round < MAX_TOOL_ROUNDS) {
      followUpRoundRef.items = []
      const stream = await modelToUse.stream(currentMessages)
      let accumulated: AIMessageChunk | null = null
      const thinkParser = new ThinkTagParser()
      let needsSeparator = yieldedText

      for await (const chunk of stream) {
        // Accumulate for tool-call detection at end
        accumulated = accumulated ? accumulated.concat(chunk) : chunk

        // Yield text/reasoning content immediately
        const extracted = extractStreamingContent(chunk)
        if (extracted) {
          // Insert paragraph break between tool rounds so text doesn't run together
          if (needsSeparator && extracted.type === 'answer') {
            yield { type: 'answer', content: '\n\n' }
            needsSeparator = false
          }
          if (extracted.type === 'reasoning') {
            yield { type: 'reasoning', content: extracted.content }
          } else {
            // Parse for <think> tags (Ollama-style thinking models)
            const parsed = thinkParser.parse(extracted.content)
            for (const c of parsed) yield c
            yieldedText = true
          }
        }
      }

      if (!accumulated) return

      // Convert accumulated chunk to AIMessage for message history
      const aiMessage = new AIMessage({
        content: accumulated.content,
        tool_calls: accumulated.tool_calls,
        additional_kwargs: accumulated.additional_kwargs,
      })

      const toolCalls = aiMessage.tool_calls
      if (!toolCalls || toolCalls.length === 0) {
        // Text was already streamed above — we're done
        return
      }

      // Execute tool calls
      const toolMessages: ToolMessage[] = []
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

      if (followUpRoundRef.items.length > 0) {
        yield { type: 'follow_ups', items: [...followUpRoundRef.items] }
      }

      currentMessages = [...currentMessages, aiMessage, ...toolMessages]
      round++
    }

    yield { type: 'answer', content: 'I reached the maximum number of tool calls. Please try a simpler question.' }
  }

  getTools(): Tool[] {
    const base: Tool[] = [
      { name: 'get_portfolio_summary', description: 'Get portfolio value, risk score, top holdings' },
      {
        name: 'suggest_conversation_follow_ups',
        description: 'Show 2–4 clickable follow-up prompts in the chat after substantive answers',
      },
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
    if (this.options.saveCustomBrandedReport) {
      base.push({
        name: 'save_custom_branded_report_pdf',
        description:
          'Create branded PDF with optional per-section tables and charts; save to finocurve/documents/ (local and/or cloud)',
      })
    }
    if (this.options.saveCustomCsvDocument) {
      base.push({
        name: 'save_custom_csv_document',
        description: 'Create UTF-8 CSV and save to finocurve/documents/ (local and/or cloud)',
      })
    }
    if (this.options.getTrackerGoalsSummary) {
      base.push({ name: 'get_tracker_goals', description: 'List Tracker goals and approximate progress' })
    }
    if (this.options.createTrackerGoal) {
      base.push({ name: 'create_tracker_goal', description: 'Create a Tracker financial goal' })
    }
    if (this.options.updateTrackerGoal) {
      base.push({ name: 'update_tracker_goal', description: 'Update an existing Tracker goal by id' })
    }
    // Include MCP tools in the reported tool list
    const mcpTools = this.options.getMCPTools?.() ?? []
    for (const t of mcpTools) {
      base.push({ name: t.name, description: t.description })
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

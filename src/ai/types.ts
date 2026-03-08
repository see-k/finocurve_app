/**
 * AI Service types - shared interface for local and future remote implementations.
 * No React/Electron imports - extractable to standalone package.
 */

export interface DocumentRef {
  key: string
  fileName: string
  source: 'cloud' | 'local'
}

export interface PortfolioHolding {
  symbol?: string
  name: string
  value: number
  percent?: number
}

export interface PortfolioContext {
  portfolioName: string
  totalValue: number
  totalGainLossPercent: number
  assetCount: number
  riskScore?: number
  riskLevel?: string
  /** Top holdings for news matching and context */
  topHoldings?: PortfolioHolding[]
}

export interface DocumentInsight {
  documentKey: string
  documentName: string
  summary: string
  riskRelevantPoints: string[]
  recommendations: string[]
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface ChatContext {
  currentRoute?: string
  portfolioSummary?: string
  documentCount?: number
  /** Full portfolio context for tool use (passed from renderer) */
  portfolioContext?: PortfolioContext | null
  /** Risk metrics summary for tool use (passed from renderer) */
  riskMetrics?: string
}

/** Chunk from chat stream - reasoning (thinking) vs answer content. */
export type ChatStreamChunk =
  | { type: 'reasoning'; content: string }
  | { type: 'answer'; content: string }

export interface Tool {
  name: string
  description: string
  parameters?: Record<string, unknown>
}

export interface AIService {
  generateDocumentInsights(
    documents: DocumentRef[],
    portfolioContext?: PortfolioContext
  ): Promise<DocumentInsight[]>

  chat(
    messages: ChatMessage[],
    context: ChatContext
  ): AsyncGenerator<ChatStreamChunk, void, unknown>

  getTools(): Tool[]
}

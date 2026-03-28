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

/** Non-loan assets synced for AI tools (full list, excluding loans). */
export interface PortfolioAssetRecord {
  name: string
  symbol?: string
  type: string
  category: string
  value: number
  percent?: number
  quantity: number
  costBasis: number
  currency: string
}

/** Loans synced from the portfolio for AI tools (category === loan). */
export interface LoanContextRecord {
  name: string
  loanType?: string
  /** Outstanding balance (positive number, USD or portfolio currency) */
  balance: number
  /** Original principal when available */
  principal?: number
  interestRate?: number
  monthlyPayment?: number
  termMonths?: number
  startDate?: string
  extraMonthlyPayment?: number
}

export interface PortfolioContext {
  portfolioName: string
  totalValue: number
  totalGainLossPercent: number
  assetCount: number
  riskScore?: number
  riskLevel?: string
  /** Top holdings for news matching and context (legacy; prefer holdings) */
  topHoldings?: PortfolioHolding[]
  /** All non-loan holdings, sorted by value descending */
  holdings?: PortfolioAssetRecord[]
  /** Liabilities the user recorded as loans in FinoCurve */
  loans?: LoanContextRecord[]
}

export interface DocumentInsight {
  documentKey: string
  documentName: string
  summary: string
  riskRelevantPoints: string[]
  recommendations: string[]
}

/** Clickable follow-up the assistant can offer after a reply (label = button, prompt = message sent). */
export interface ChatFollowUp {
  label: string
  prompt: string
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

/** Chunk from chat stream - reasoning (thinking) vs answer content vs suggested follow-ups. */
export type ChatStreamChunk =
  | { type: 'reasoning'; content: string }
  | { type: 'answer'; content: string }
  | { type: 'follow_ups'; items: ChatFollowUp[] }

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

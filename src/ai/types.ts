/**
 * AI Service types - shared interface for local and future remote implementations.
 * No React/Electron imports - extractable to standalone package.
 */

export interface DocumentRef {
  key: string
  fileName: string
  source: 'cloud' | 'local'
}

/** Serializable financial audit detail passed to AI tools and A2A clients. */
export interface FinancialAuditContext {
  source: string
  asOf: string
  valuationMethod: string
  freshness: string
  estimated?: boolean
}

export interface PortfolioHolding {
  symbol?: string
  name: string
  value: number
  percent?: number
  valueAudit?: FinancialAuditContext
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
  valueAudit?: FinancialAuditContext
  costBasisAudit?: FinancialAuditContext
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
  balanceAudit?: FinancialAuditContext
  principalAudit?: FinancialAuditContext
  termsAudit?: FinancialAuditContext
}

export interface PortfolioContext {
  portfolioName: string
  totalValue: number
  totalGainLossPercent: number
  assetCount: number
  riskScore?: number
  riskLevel?: string
  /** Audit trail for totalValue and values derived from the current holdings. */
  valuationAudit?: FinancialAuditContext
  riskAudit?: FinancialAuditContext
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

/** File included with a user chat turn (serialized over IPC as base64). */
export interface ChatAttachment {
  name: string
  mimeType: string
  /** Raw base64 payload (no `data:` URL prefix). */
  dataBase64: string
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  /** User messages only: images (vision) and/or documents inlined as text after extraction. */
  attachments?: ChatAttachment[]
}

export interface ChatContext {
  currentRoute?: string
  /** Optional account details supplied by the user for relevant personalization. */
  userProfile?: {
    name?: string
    email?: string
    companyName?: string
    companyRole?: string
    companyWebsite?: string
    linkedInUrl?: string
    socialMediaUrl?: string
    personalBio?: string
  }
  portfolioSummary?: string
  documentCount?: number
  /** Full portfolio context for tool use (passed from renderer) */
  portfolioContext?: PortfolioContext | null
  /** Risk metrics summary for tool use (passed from renderer) */
  riskMetrics?: string
  /** When set, layers a custom Agent's persona on top of the base FinoCurve system prompt. */
  agentPersona?: {
    /** Stable id used to scope this expert's private local workspace. */
    id?: string
    name: string
    systemPrompt: string
    /** Optional per-agent model override. When omitted, the primary AI configuration is used. */
    provider?: 'ollama' | 'bedrock' | 'azure'
    model?: string
    ollamaBaseUrl?: string
    bedrockRegion?: string
    bedrockAccessKeyId?: string
    bedrockSecretKey?: string
    azureEndpoint?: string
    azureApiKey?: string
    /** Restricts the tools bound to this expert. Omitted for legacy profiles means all tools. */
    toolAccess?: 'all' | 'selected' | 'none'
    enabledToolNames?: string[]
  }
  /** Group-chat context that helps an agent participate as a peer instead of a standalone bot. */
  groupChat?: {
    participantNames: string[]
    /**
     * True when this responder was explicitly addressed for the turn — either by a
     * user @mention or by a peer @handoff that scheduled them mid-turn.
     */
    directlyAddressed: boolean
  }
  /** Internal, non-conversational model pass. It never appears as a chat participant. */
  backgroundTask?: 'group-routing'
}

/** Chunk from chat stream - reasoning (thinking) vs answer content vs suggested follow-ups. */
export type ChatStreamChunk =
  | { type: 'reasoning'; content: string }
  | { type: 'answer'; content: string }
  | { type: 'tool_start'; toolName: string }
  | { type: 'tool_end'; toolName: string; status: 'success' | 'error' }
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
    context: ChatContext,
    options?: { signal?: AbortSignal }
  ): AsyncGenerator<ChatStreamChunk, void, unknown>

  getTools(): Tool[]
}

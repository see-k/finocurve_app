/**
 * AI context tools - provide portfolio, documents, risk data to the AI.
 * Used by Electron handlers to inject context; can support tool-calling later.
 */

import type { DocumentRef, PortfolioContext } from '../../types'

export interface ToolContext {
  getPortfolioContext: () => Promise<PortfolioContext | null>
  getDocumentList: () => Promise<DocumentRef[]>
  getDocumentContent: (key: string, source: 'cloud' | 'local') => Promise<{ buffer: Uint8Array; mimeType?: string } | null>
  getRiskMetrics: () => Promise<string>
}

export function createTools(_context: ToolContext) {
  return []
}

/**
 * FinoCurve AI tools - LangChain StructuredTools for portfolio, documents, and risk.
 * Uses zod schemas for type-safe tool calling.
 */

import { z } from 'zod'
import { tool } from '@langchain/core/tools'
import type { DocumentRef, PortfolioContext } from '../../types'

export interface FinocurveToolContext {
  getPortfolioContext: () => Promise<PortfolioContext | null>
  getDocumentList: () => Promise<DocumentRef[]>
  getDocumentContent: (key: string, source: 'cloud' | 'local') => Promise<{ buffer: Uint8Array; mimeType?: string } | null>
  getRiskMetrics: () => Promise<string>
  extractTextFromDocument: (buffer: Uint8Array, mimeType?: string, fileName?: string) => Promise<string>
}

export function createFinocurveTools(ctx: FinocurveToolContext) {
  const getPortfolioSummary = tool(
    async () => {
      const portfolio = await ctx.getPortfolioContext()
      if (!portfolio) {
        return 'No portfolio data available. The user has not set up a portfolio yet.'
      }
      const topHoldings = 'Top holdings not available in current context.'
      return `Portfolio: ${portfolio.portfolioName}
Total value: $${portfolio.totalValue.toLocaleString()}
Total gain/loss: ${portfolio.totalGainLossPercent.toFixed(1)}%
Asset count: ${portfolio.assetCount}
Risk score: ${portfolio.riskScore ?? 'N/A'}
Risk level: ${portfolio.riskLevel ?? 'N/A'}
${topHoldings}`
    },
    {
      name: 'get_portfolio_summary',
      description: 'Get the user\'s portfolio summary including total value, gain/loss percentage, asset count, risk score, and top holdings. Use this when the user asks about their portfolio, investments, or net worth.',
    }
  )

  const getDocumentList = tool(
    async () => {
      const docs = await ctx.getDocumentList()
      if (docs.length === 0) {
        return 'No documents found. The user has not uploaded any documents to finocurve/documents/.'
      }
      return docs
        .map((d) => `- ${d.fileName} (key: ${d.key}, source: ${d.source})`)
        .join('\n')
    },
    {
      name: 'get_document_list',
      description: 'List all documents the user has uploaded. Returns file names and keys. Use this when the user asks what documents they have, or before fetching a specific document.',
    }
  )

  const getDocumentContent = tool(
    async ({ key, source }: { key: string; source: 'cloud' | 'local' }) => {
      const content = await ctx.getDocumentContent(key, source)
      if (!content) {
        return `Could not read document with key: ${key}`
      }
      const text = await ctx.extractTextFromDocument(
        content.buffer,
        content.mimeType,
        key.split('/').pop()
      )
      if (!text || text.trim().length < 10) {
        return 'Document has little or no extractable text.'
      }
      return text.slice(0, 15000)
    },
    {
      name: 'get_document_content',
      description: 'Fetch the text content of a document by its key. Use get_document_list first to get document keys. The key is the full path like finocurve/documents/filename.pdf. Source is either "cloud" or "local".',
      schema: z.object({
        key: z.string().describe('The document key, e.g. finocurve/documents/report.pdf'),
        source: z.enum(['cloud', 'local']).describe('Where the document is stored'),
      }),
    }
  )

  const getRiskMetrics = tool(
    async () => {
      const metrics = await ctx.getRiskMetrics()
      return metrics || 'Risk metrics are not available. The user may need to run a risk analysis first.'
    },
    {
      name: 'get_risk_metrics',
      description: 'Get the current risk analysis result including risk score, volatility, and other risk metrics. Use this when the user asks about their risk profile, risk level, or risk analysis.',
    }
  )

  return [getPortfolioSummary, getDocumentList, getDocumentContent, getRiskMetrics]
}

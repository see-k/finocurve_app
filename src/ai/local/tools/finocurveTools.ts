/**
 * FinoCurve AI tools - LangChain StructuredTools for portfolio, documents, and risk.
 * Uses zod schemas for type-safe tool calling.
 */

import { z } from 'zod'
import { tool, type StructuredToolInterface } from '@langchain/core/tools'
import type { DocumentRef, PortfolioContext } from '../../types'

export interface CongressCache {
  senate: Record<string, unknown>[]
  house: Record<string, unknown>[]
  senateFetchedAt?: string
  houseFetchedAt?: string
}

export interface FinocurveToolContext {
  getPortfolioContext: () => Promise<PortfolioContext | null>
  getDocumentList: () => Promise<DocumentRef[]>
  getReportList: () => Promise<DocumentRef[]>
  getDocumentContent: (key: string, source: 'cloud' | 'local') => Promise<{ buffer: Uint8Array; mimeType?: string } | null>
  getRiskMetrics: () => Promise<string>
  extractTextFromDocument: (buffer: Uint8Array, mimeType?: string, fileName?: string) => Promise<string>
  getCongressCache?: () => Promise<CongressCache | null>
  getSECSubmissions?: (tickerOrCik: string) => Promise<{ data: unknown; error: string | null }>
  getSECFilingContent?: (tickerOrCik: string, accessionNumber: string) => Promise<{ content: string | null; error: string | null }>
}

export function createFinocurveTools(ctx: FinocurveToolContext) {
  const getPortfolioSummary = tool(
    async () => {
      const portfolio = await ctx.getPortfolioContext()
      if (!portfolio) {
        return 'No portfolio data available. The user has not set up a portfolio yet.'
      }
      const topHoldings = 'Top holdings not available in current context.'
      return `[Source: Portfolio data - ${portfolio.portfolioName}]
Portfolio: ${portfolio.portfolioName}
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
      const fileName = key.split('/').pop() ?? key
      if (!content) {
        return `Could not read document with key: ${key}`
      }
      const text = await ctx.extractTextFromDocument(
        content.buffer,
        content.mimeType,
        fileName
      )
      if (!text || text.trim().length < 10) {
        return 'Document has little or no extractable text.'
      }
      return `[Source: Document "${fileName}" from ${source}]\n\n${text.slice(0, 15000)}`
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

  const getReportList = tool(
    async () => {
      const reports = await ctx.getReportList()
      if (reports.length === 0) {
        return 'No reports found. The user has not generated any risk reports in finocurve/reports/.'
      }
      return reports
        .map((r) => `- ${r.fileName} (key: ${r.key}, source: ${r.source})`)
        .join('\n')
    },
    {
      name: 'get_report_list',
      description: 'List all risk reports the user has generated. Returns file names and keys. Use this when the user asks about their reports, risk reports, or before fetching a specific report.',
    }
  )

  const getReportContent = tool(
    async ({ key, source }: { key: string; source: 'cloud' | 'local' }) => {
      const content = await ctx.getDocumentContent(key, source)
      const fileName = key.split('/').pop() ?? key
      if (!content) {
        return `Could not read report with key: ${key}`
      }
      const text = await ctx.extractTextFromDocument(
        content.buffer,
        content.mimeType,
        fileName
      )
      if (!text || text.trim().length < 10) {
        return 'Report has little or no extractable text.'
      }
      return `[Source: Risk report "${fileName}" from ${source}]\n\n${text.slice(0, 15000)}`
    },
    {
      name: 'get_report_content',
      description: 'Fetch the text content of a risk report by its key. Use get_report_list first to get report keys. The key is the full path like finocurve/reports/Report.pdf. Source is either "cloud" or "local".',
      schema: z.object({
        key: z.string().describe('The report key, e.g. finocurve/reports/Report.pdf'),
        source: z.enum(['cloud', 'local']).describe('Where the report is stored'),
      }),
    }
  )

  const getRiskMetrics = tool(
    async () => {
      const metrics = await ctx.getRiskMetrics()
      const content = metrics || 'Risk metrics are not available. The user may need to run a risk analysis first.'
      return `[Source: Risk analysis]\n\n${content}`
    },
    {
      name: 'get_risk_metrics',
      description: 'Get the current risk analysis result including risk score, volatility, and other risk metrics. Use this when the user asks about their risk profile, risk level, or risk analysis.',
    }
  )

  const getCongressionalTrades = tool(
    async ({ chamber }: { chamber?: 'senate' | 'house' }) => {
      if (!ctx.getCongressCache) {
        return 'Congressional trades data is not available. This feature requires the desktop app with cached data.'
      }
      const cache = await ctx.getCongressCache()
      if (!cache) {
        return 'No congressional disclosure data cached. The user should go to Insights > Congressional Trades and click Refresh to fetch data.'
      }
      const list = chamber === 'house' ? cache.house : cache.senate
      const chamberName = chamber === 'house' ? 'House' : 'Senate'
      const fetchedAt = chamber === 'house' ? cache.houseFetchedAt : cache.senateFetchedAt
      if (!list || list.length === 0) {
        return `No ${chamberName} disclosures in cache. Last fetched: ${fetchedAt || 'Never'}. User should click Refresh in Insights.`
      }
      const rows = list.slice(0, 50).map((r: Record<string, unknown>, i: number) => {
        const name = [r.firstName, r.lastName].filter(Boolean).join(' ')
        const asset = r.assetDescription ?? r.ticker ?? '—'
        const type = r.transactionType ?? '—'
        const amount = r.amount ?? '—'
        const date = r.transactionDate ?? '—'
        return `${i + 1}. ${name}: ${type} - ${asset} (${amount}) on ${date}`
      })
      return `[Source: ${chamberName} financial disclosures - STOCK Act, last updated ${fetchedAt || 'unknown'}]\n\n${rows.join('\n')}\n\n(Up to 50 of ${list.length} total. For full list, see Insights > Congressional Trades.)`
    },
    {
      name: 'get_congressional_trades',
      description: 'Get cached congressional financial disclosures (Senate or House). STOCK Act data - trades, assets reported by members of Congress. Use when user asks about congress trading, politician investments, congressional disclosures, or what senators/representatives are buying or selling. Data is cached - user must refresh in Insights to get latest.',
      schema: z.object({
        chamber: z.enum(['senate', 'house']).optional().describe('Which chamber: senate or house. Defaults to senate if omitted.'),
      }),
    }
  )

  const getSECFilings = tool(
    async ({ tickerOrCik }: { tickerOrCik: string }) => {
      if (!ctx.getSECSubmissions) {
        return 'SEC filings data is not available. This feature requires the desktop app.'
      }
      const { data, error } = await ctx.getSECSubmissions(tickerOrCik)
      if (error) {
        return `[Source: SEC EDGAR]\nError: ${error}`
      }
      const sub = data as {
        name?: string
        cik?: string
        tickers?: string[]
        filings?: {
          recent?: { form?: string[]; filingDate?: string[]; accessionNumber?: string[] }
        }
      } | null
      if (!sub) return 'No SEC data returned.'
      const name = sub.name ?? 'Unknown'
      const cik = sub.cik ?? '—'
      const tickers = (sub.tickers ?? []).join(', ') || '—'
      const forms = sub.filings?.recent?.form ?? []
      const dates = sub.filings?.recent?.filingDate ?? []
      const accNos = sub.filings?.recent?.accessionNumber ?? []
      const recent = forms
        .slice(0, 15)
        .map((f, i) => {
          const acc = accNos[i]
          return `${f} - ${dates[i] ?? '—'}${acc ? ` (accession: ${acc})` : ''}`
        })
        .join('\n')
      return `[Source: SEC EDGAR - ${tickerOrCik}]\n\nCompany: ${name}\nCIK: ${cik}\nTickers: ${tickers}\n\nRecent filings (use accession numbers with get_sec_filing_content to fetch full text):\n${recent || 'None'}\n\n(Full filings at sec.gov)`
    },
    {
      name: 'get_sec_filings',
      description: 'Get SEC EDGAR filing history for a public company. Use when user asks about SEC filings, 10-K, 10-Q, 8-K, company financial reports, or regulatory filings for a stock ticker (e.g. AAPL, TSLA). Returns form types, dates, and accession numbers. Use get_sec_filing_content with an accession number to fetch and summarize the full filing text.',
      schema: z.object({
        tickerOrCik: z.string().describe('Stock ticker symbol (e.g. AAPL, TSLA) or 10-digit SEC Central Index Key'),
      }),
    }
  )

  const getSECFilingContent = tool(
    async ({ tickerOrCik, accessionNumber }: { tickerOrCik: string; accessionNumber: string }) => {
      if (!ctx.getSECFilingContent) {
        return 'SEC filing content is not available. This feature requires the desktop app.'
      }
      const { content, error } = await ctx.getSECFilingContent(tickerOrCik, accessionNumber)
      if (error) {
        return `[Source: SEC EDGAR]\nError: ${error}`
      }
      if (!content) return 'No content returned for this filing.'
      return `[Source: SEC EDGAR - ${tickerOrCik}, accession ${accessionNumber}]\n\n${content}`
    },
    {
      name: 'get_sec_filing_content',
      description: 'Fetch the full text content of a specific SEC filing. Use after get_sec_filings to get accession numbers. Provide ticker (e.g. AAPL) or CIK and the accession number (e.g. 0000320193-26-000123). Use when the user asks to summarize, analyze, or read a specific filing like an 8-K or 10-K.',
      schema: z.object({
        tickerOrCik: z.string().describe('Stock ticker symbol (e.g. AAPL) or 10-digit CIK'),
        accessionNumber: z.string().describe('SEC accession number from get_sec_filings (e.g. 0000320193-26-000123)'),
      }),
    }
  )

  const baseTools: StructuredToolInterface[] = [
    getPortfolioSummary,
    getDocumentList,
    getDocumentContent,
    getReportList,
    getReportContent,
    getRiskMetrics,
  ]
  if (ctx.getCongressCache) baseTools.push(getCongressionalTrades)
  if (ctx.getSECSubmissions) baseTools.push(getSECFilings)
  if (ctx.getSECFilingContent) baseTools.push(getSECFilingContent)
  return baseTools
}

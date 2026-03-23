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
  /** Desktop: build branded PDF and save to finocurve/documents/ (local and/or S3). */
  saveCustomBrandedReport?: (payload: {
    title: string
    subtitle?: string
    sections: { heading: string; body: string }[]
  }) => Promise<string>
  /** Desktop: save UTF-8 CSV (Excel-friendly) to finocurve/documents/ (local and/or S3). */
  saveCustomCsvDocument?: (payload: { fileBaseName: string; headers: string[]; rows: string[][] }) => Promise<string>
}

export function createFinocurveTools(ctx: FinocurveToolContext) {
  const getPortfolioSummary = tool(
    async () => {
      const portfolio = await ctx.getPortfolioContext()
      if (!portfolio) {
        return 'No portfolio data available. The user has not set up a portfolio yet.'
      }
      const holdings = portfolio.topHoldings ?? []
      const topHoldings =
        holdings.length > 0
          ? holdings
              .map(
                (h) =>
                  `- ${h.symbol ? `${h.symbol} (${h.name})` : h.name}: $${h.value.toLocaleString()}${h.percent != null ? ` (${h.percent.toFixed(1)}%)` : ''}`
              )
              .join('\n')
          : 'Top holdings not available in current context.'
      return `[Source: Portfolio data - ${portfolio.portfolioName}]
Portfolio: ${portfolio.portfolioName}
Total value: $${portfolio.totalValue.toLocaleString()}
Total gain/loss: ${portfolio.totalGainLossPercent.toFixed(1)}%
Asset count: ${portfolio.assetCount}
Risk score: ${portfolio.riskScore ?? 'N/A'}
Risk level: ${portfolio.riskLevel ?? 'N/A'}

Top holdings:
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
        return 'No congressional disclosure data cached. The user needs a Financial Modeling Prep API key (Settings > Plugins), then Insights > Congressional Trades > Refresh.'
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

  const saveCustomBrandedReportPdf = tool(
    async ({
      title,
      subtitle,
      sections,
    }: {
      title: string
      subtitle?: string
      sections: { heading: string; body: string }[]
    }) => {
      if (!ctx.saveCustomBrandedReport) {
        return 'Branded PDF export is only available in the FinoCurve desktop app with storage configured.'
      }
      return ctx.saveCustomBrandedReport({ title, subtitle, sections })
    },
    {
      name: 'save_custom_branded_report_pdf',
      description:
        'Create a PDF with FinoCurve letterhead, logo, and brand styling (same look as app risk reports), using your written sections as the body. Saves automatically to the user\'s documents folder (local device directory and/or cloud S3 when configured). Use when the user wants a downloadable report, memo, brief, or formal write-up. Write professional plain text; use blank lines between paragraphs in each section body.',
      schema: z.object({
        title: z.string().min(1).max(200).describe('Main title on the cover'),
        subtitle: z.string().max(400).optional().describe('Optional subtitle shown under the title'),
        sections: z
          .array(
            z.object({
              heading: z.string().min(1).max(160).describe('Section heading'),
              body: z
                .string()
                .min(1)
                .max(14000)
                .describe('Section content as plain text (double newline between paragraphs)'),
            })
          )
          .min(1)
          .max(30)
          .describe('Ordered sections'),
      }),
    }
  )

  const saveCustomCsvDocument = tool(
    async ({
      fileBaseName,
      headers,
      rows,
    }: {
      fileBaseName: string
      headers: string[]
      rows: string[][]
    }) => {
      if (!ctx.saveCustomCsvDocument) {
        return 'CSV export is only available in the FinoCurve desktop app with storage configured.'
      }
      return ctx.saveCustomCsvDocument({ fileBaseName, headers, rows })
    },
    {
      name: 'save_custom_csv_document',
      description:
        'Create a UTF-8 CSV file (opens in Excel, Google Sheets, Numbers) from a header row and data rows, and save it to the user\'s documents folder (local and/or S3). Use when the user wants spreadsheet-style output: tables, holdings lists, comparison matrices, export of numeric series, etc. Use plain strings for every cell (format numbers as text the user would expect, e.g. "1,234.56" or "12.5%"). Row order must match headers: each row is one array of cell values in column order. Do not include markdown or formulas—values only.',
      schema: z.object({
        fileBaseName: z
          .string()
          .min(1)
          .max(100)
          .describe('Short file name without extension, e.g. portfolio_holdings_march or risk_comparison'),
        headers: z
          .array(z.string().max(200))
          .min(1)
          .max(50)
          .describe('Column names, first row of the CSV'),
        rows: z
          .array(z.array(z.string().max(8000)))
          .max(2000)
          .describe(
            'Data rows; each inner array has one string per column in the same order as headers (use empty string for missing cells)'
          ),
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
  if (ctx.saveCustomBrandedReport) baseTools.push(saveCustomBrandedReportPdf)
  if (ctx.saveCustomCsvDocument) baseTools.push(saveCustomCsvDocument)
  return baseTools
}

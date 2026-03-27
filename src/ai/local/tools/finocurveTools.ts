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
    sections: {
      heading: string
      body: string
      tables?: { title?: string; headers: string[]; rows: string[][] }[]
      charts?: (
        | { type: 'bar'; title?: string; labels: string[]; values: number[] }
        | { type: 'line'; title?: string; labels: string[]; values: number[] }
        | { type: 'pie'; title?: string; labels: string[]; values: number[] }
      )[]
    }[]
  }) => Promise<string>
  /** Desktop: save UTF-8 CSV (Excel-friendly) to finocurve/documents/ (local and/or S3). */
  saveCustomCsvDocument?: (payload: { fileBaseName: string; headers: string[]; rows: string[][] }) => Promise<string>
  /** Desktop: append user-logged net worth entry (Tracker tab; not portfolio total). */
  appendNetWorthEntry?: (args: { amount: number; note?: string; recordedAt?: string }) => Promise<string>
  getNetWorthLogSummary?: () => Promise<string>
}

export function createFinocurveTools(ctx: FinocurveToolContext) {
  const getPortfolioSummary = tool(
    async () => {
      const portfolio = await ctx.getPortfolioContext()
      if (!portfolio) {
        return 'No portfolio data available. The user has not set up a portfolio yet.'
      }
      const topList = (portfolio.holdings?.length ? portfolio.holdings : portfolio.topHoldings ?? []).slice(0, 10)
      const topHoldingsBlock =
        topList.length > 0
          ? topList
              .map(
                (h) =>
                  `- ${h.symbol ? `${h.symbol} (${h.name})` : h.name}: $${h.value.toLocaleString()}${h.percent != null ? ` (${h.percent.toFixed(1)}%)` : ''}`
              )
              .join('\n')
          : 'Top holdings not available in current context.'
      const more =
        (portfolio.holdings?.length ?? 0) > 10
          ? `\n(Showing 10 largest by value. Use get_holdings for the full list.)`
          : ''
      return `[Source: Portfolio data - ${portfolio.portfolioName}]
Portfolio: ${portfolio.portfolioName}
Total value: $${portfolio.totalValue.toLocaleString()}
Total gain/loss: ${portfolio.totalGainLossPercent.toFixed(1)}%
Asset count: ${portfolio.assetCount}
Risk score: ${portfolio.riskScore ?? 'N/A'}
Risk level: ${portfolio.riskLevel ?? 'N/A'}

Top holdings (non-loan assets by value):
${topHoldingsBlock}${more}`
    },
    {
      name: 'get_portfolio_summary',
      description:
        'Get the user\'s portfolio summary: totals, gain/loss, asset count, risk score, and the 10 largest non-loan holdings by value. Use get_holdings for every holding. Use for portfolio overview or allocation. For the user\'s separately logged true net worth (Tracker), use get_net_worth_log — portfolio total is not the same as logged net worth.',
    }
  )

  const getHoldings = tool(
    async () => {
      const portfolio = await ctx.getPortfolioContext()
      if (!portfolio) {
        return 'No portfolio data available. The user has not set up a portfolio yet.'
      }
      const list = portfolio.holdings ?? []
      if (list.length === 0) {
        const legacy = portfolio.topHoldings ?? []
        if (legacy.length === 0) {
          return 'No investable holdings (non-loan assets) in the portfolio, or data not synced yet. The user can add assets from Portfolio or Add Asset.'
        }
        return (
          `[Source: FinoCurve — portfolio holdings (partial cache)]\n` +
          `Only a short holdings snapshot is available; open the app or change the portfolio to refresh full data.\n\n` +
          legacy
            .map(
              (h, i) =>
                `${i + 1}. ${h.symbol ? `${h.symbol} (${h.name})` : h.name} — $${h.value.toLocaleString()}${h.percent != null ? ` (${h.percent.toFixed(1)}%)` : ''}`
            )
            .join('\n')
        )
      }
      const lines = list.map((h, i) => {
        const label = h.symbol ? `${h.symbol} (${h.name})` : h.name
        const pct = h.percent != null ? ` (${h.percent.toFixed(1)}% of portfolio)` : ''
        return (
          `${i + 1}. ${label}${pct}\n` +
          `   Type: ${h.type} · Category: ${h.category} · Value: $${h.value.toLocaleString()}\n` +
          `   Qty: ${h.quantity} · Cost basis: $${h.costBasis.toLocaleString()} · Currency: ${h.currency}`
        )
      })
      return `[Source: FinoCurve — all recorded holdings (non-loan assets)]\nPortfolio: ${portfolio.portfolioName}\nCount: ${list.length}\n\n${lines.join('\n\n')}`
    },
    {
      name: 'get_holdings',
      description:
        'List every investable holding the user recorded in FinoCurve (stocks, ETFs, crypto, manual assets, etc.) — not loans. Includes symbol, name, type, value, weight, quantity, and cost basis. Use when the user asks for their full list of positions, every stock, all assets, or details beyond the top-10 summary. Does not read uploaded documents.',
    }
  )

  const getUserLoans = tool(
    async () => {
      const portfolio = await ctx.getPortfolioContext()
      if (!portfolio) {
        return 'No portfolio data available. The user has not set up a portfolio yet.'
      }
      const loans = portfolio.loans ?? []
      if (loans.length === 0) {
        return 'The user has not recorded any loans in FinoCurve. Loans can be added from Portfolio or Add Asset → Loan.'
      }
      const lines = loans.map((l, i) => {
        const bits: string[] = [
          `${i + 1}. ${l.name}`,
          l.loanType ? `   Type: ${l.loanType.replace(/_/g, ' ')}` : '',
          `   Outstanding balance: $${l.balance.toLocaleString()}`,
        ]
        if (l.principal != null && l.principal > 0) {
          bits.push(`   Original principal: $${l.principal.toLocaleString()}`)
        }
        if (l.interestRate != null) bits.push(`   Interest rate: ${l.interestRate}% APR`)
        if (l.monthlyPayment != null) bits.push(`   Monthly payment: $${l.monthlyPayment.toLocaleString()}`)
        if (l.extraMonthlyPayment != null && l.extraMonthlyPayment > 0) {
          bits.push(`   Extra monthly payment: $${l.extraMonthlyPayment.toLocaleString()}`)
        }
        if (l.termMonths != null) bits.push(`   Term: ${l.termMonths} months`)
        if (l.startDate) bits.push(`   Start date: ${l.startDate}`)
        return bits.filter(Boolean).join('\n')
      })
      return `[Source: FinoCurve — loans recorded in app]\nPortfolio: ${portfolio.portfolioName}\n\n${lines.join('\n\n')}`
    },
    {
      name: 'get_user_loans',
      description:
        'List all loans and debt the user has recorded in FinoCurve (mortgage, auto, student, credit card, etc.) with balances, APR, payments, and term when available. Use when the user asks about their loans, debt, mortgage, liabilities tracked in the app, or monthly loan payments.',
    }
  )

  const getCurrentDateTime = tool(
    async () => {
      const now = new Date()
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local'
      const localLong = now.toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'long' })
      const utc = now.toUTCString()
      return `[Source: Device clock — FinoCurve runtime]\nISO 8601 (UTC): ${now.toISOString()}\nUTC string: ${utc}\nLocal (${tz}): ${localLong}\nUnix ms: ${now.getTime()}`
    },
    {
      name: 'get_current_datetime',
      description:
        'Get the current date and time from the user\'s device (the computer running FinoCurve), including ISO UTC, local timezone, and Unix time. Use whenever the user asks what day or time it is, "today", "now", timezone, year, or any question that needs the real-world current date/time. Models do not know the live clock without this tool.',
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

  const chartLabelsValuesMatch = (c: { labels: string[]; values: number[] }) =>
    c.labels.length === c.values.length && c.labels.length >= 1

  const reportPdfTableSchema = z.object({
    title: z.string().max(120).optional().describe('Optional caption above the table'),
    headers: z
      .array(z.string().max(200))
      .min(1)
      .max(14)
      .describe('Column headers; every data row must have the same number of cells in this order'),
    rows: z
      .array(z.array(z.string().max(4000)))
      .max(80)
      .describe('Data rows; pad with empty strings if a cell is missing'),
  })

  const reportPdfChartSchema = z.discriminatedUnion('type', [
    z
      .object({
        type: z.literal('bar'),
        title: z.string().max(120).optional().describe('Chart title above the graphic'),
        labels: z.array(z.string().max(80)).min(1).max(20).describe('X-axis category for each bar'),
        values: z.array(z.number()).min(1).max(20).describe('Numeric height for each bar (same length as labels; negatives draw downward from zero)'),
      })
      .refine(chartLabelsValuesMatch, { message: 'bar chart labels and values must match in length' }),
    z
      .object({
        type: z.literal('line'),
        title: z.string().max(120).optional(),
        labels: z.array(z.string().max(80)).min(1).max(24).describe('Point labels in order along the X axis'),
        values: z.array(z.number()).min(1).max(24).describe('Y values for each point (same length as labels)'),
      })
      .refine(chartLabelsValuesMatch, { message: 'line chart labels and values must match in length' }),
    z
      .object({
        type: z.literal('pie'),
        title: z.string().max(120).optional(),
        labels: z.array(z.string().max(80)).min(1).max(16).describe('Slice labels'),
        values: z
          .array(z.number())
          .min(1)
          .max(16)
          .describe('Positive magnitudes for each slice (same length as labels); zero or negative slices are omitted'),
      })
      .refine(chartLabelsValuesMatch, { message: 'pie chart labels and values must match in length' }),
  ])

  const saveCustomBrandedReportPdf = tool(
    async ({
      title,
      subtitle,
      sections,
    }: {
      title: string
      subtitle?: string
      sections: {
        heading: string
        body: string
        tables?: { title?: string; headers: string[]; rows: string[][] }[]
        charts?: (
          | { type: 'bar'; title?: string; labels: string[]; values: number[] }
          | { type: 'line'; title?: string; labels: string[]; values: number[] }
          | { type: 'pie'; title?: string; labels: string[]; values: number[] }
        )[]
      }[]
    }) => {
      if (!ctx.saveCustomBrandedReport) {
        return 'Branded PDF export is only available in the FinoCurve desktop app with storage configured.'
      }
      return ctx.saveCustomBrandedReport({ title, subtitle, sections })
    },
    {
      name: 'save_custom_branded_report_pdf',
      description:
        'Create a PDF with FinoCurve letterhead, logo, and brand styling (same look as app risk reports). Each section is heading + narrative body, optionally plus tables (headers + rows of strings) and/or charts (bar, line, or pie) with numeric series. Tables and charts render after that section\'s text. Saves to the user\'s documents folder (local and/or S3 when configured). Use for downloadable reports, memos, or briefs. Use plain text in bodies; double newlines between paragraphs.',
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
              tables: z
                .array(reportPdfTableSchema)
                .max(4)
                .optional()
                .describe('Optional data tables shown after this section\'s body'),
              charts: z
                .array(reportPdfChartSchema)
                .max(4)
                .optional()
                .describe(
                  'Optional charts after tables: bar (categories + values), line (time series or ordered points), pie (parts of a whole; use positive values only)'
                ),
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

  const addNetWorthEntry = tool(
    async ({ amount, note, recorded_at }: { amount: number; note?: string; recorded_at?: string }) => {
      if (!ctx.appendNetWorthEntry) {
        return 'Net worth logging is only available in the FinoCurve desktop app.'
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        return 'Amount must be a positive number (total net worth in the user\'s default currency).'
      }
      return ctx.appendNetWorthEntry({ amount, note, recordedAt: recorded_at })
    },
    {
      name: 'add_net_worth_entry',
      description:
        'Append a net worth snapshot to the user\'s Tracker log (true net worth they want recorded — not the same as portfolio book value). Use when they explicitly ask to log or record their net worth or give a figure for tracking. Optional note and recorded_at (ISO 8601); omit recorded_at to use now.',
      schema: z.object({
        amount: z.number().positive().describe('Total net worth amount in the user\'s default currency'),
        note: z.string().max(500).optional().describe('Optional short note'),
        recorded_at: z.string().optional().describe('ISO 8601 timestamp; default is current time'),
      }),
    }
  )

  const getNetWorthLog = tool(
    async () => {
      if (!ctx.getNetWorthLogSummary) {
        return 'Net worth log is only available in the FinoCurve desktop app.'
      }
      return ctx.getNetWorthLogSummary()
    },
    {
      name: 'get_net_worth_log',
      description:
        'List user-logged net worth entries from Tracker (manual or AI-logged). Use when the user asks what they logged, their logged net worth history, or before adding duplicate entries.',
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
    getHoldings,
    getUserLoans,
    getCurrentDateTime,
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
  if (ctx.appendNetWorthEntry) baseTools.push(addNetWorthEntry)
  if (ctx.getNetWorthLogSummary) baseTools.push(getNetWorthLog)
  return baseTools
}

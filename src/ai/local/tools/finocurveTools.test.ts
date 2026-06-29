import { describe, expect, it, vi } from 'vitest'
import type { StructuredToolInterface } from '@langchain/core/tools'
import { createFinocurveTools, type FinocurveToolContext } from './finocurveTools'
import type { PortfolioContext } from '../../types'

function toolByName(tools: StructuredToolInterface[], name: string) {
  const t = tools.find((x) => x.name === name)
  if (!t) throw new Error(`missing tool ${name}`)
  return t
}

function baseCtx(overrides: Partial<FinocurveToolContext> = {}): FinocurveToolContext {
  return {
    getPortfolioContext: vi.fn(async () => null),
    getDocumentList: vi.fn(async () => []),
    getReportList: vi.fn(async () => []),
    getDocumentContent: vi.fn(async () => null),
    getRiskMetrics: vi.fn(async () => ''),
    extractTextFromDocument: vi.fn(async () => ''),
    ...overrides,
  }
}

const samplePortfolio: PortfolioContext = {
  portfolioName: 'Growth',
  totalValue: 100_000,
  totalGainLossPercent: 5.2,
  assetCount: 3,
  riskScore: 42,
  riskLevel: 'Moderate',
  topHoldings: [{ name: 'Legacy Fund', value: 50_000, percent: 50 }],
  holdings: [],
  loans: [],
}

describe('createFinocurveTools conditional registration', () => {
  it('registers desktop-only tools only when ctx hooks are present', () => {
    const minimal = createFinocurveTools(baseCtx())
    expect(minimal.map((t) => t.name)).not.toContain('get_congressional_trades')
    expect(minimal.map((t) => t.name)).not.toContain('add_net_worth_entry')

    const full = createFinocurveTools(
      baseCtx({
        getCongressCache: vi.fn(async () => null),
        getSECSubmissions: vi.fn(async () => ({ data: null, error: null })),
        getSECFilingContent: vi.fn(async () => ({ content: null, error: null })),
        saveCustomBrandedReport: vi.fn(async () => 'saved.pdf'),
        saveCustomCsvDocument: vi.fn(async () => 'saved.csv'),
        appendNetWorthEntry: vi.fn(async () => 'logged'),
        getNetWorthLogSummary: vi.fn(async () => 'log summary'),
        getTrackerGoalsSummary: vi.fn(async () => 'goals summary'),
        createTrackerGoal: vi.fn(async () => 'created'),
        updateTrackerGoal: vi.fn(async () => 'updated'),
      })
    )
    expect(full.map((t) => t.name)).toEqual(
      expect.arrayContaining([
        'get_congressional_trades',
        'get_sec_filings',
        'get_sec_filing_content',
        'save_custom_branded_report_pdf',
        'save_custom_csv_document',
        'add_net_worth_entry',
        'get_net_worth_log',
        'get_tracker_goals',
        'create_tracker_goal',
        'update_tracker_goal',
      ])
    )
  })
})

describe('get_holdings', () => {
  it('falls back to legacy topHoldings when holdings array is empty', async () => {
    const ctx = baseCtx({
      getPortfolioContext: vi.fn(async () => samplePortfolio),
    })
    const tool = toolByName(createFinocurveTools(ctx), 'get_holdings')
    const out = await tool.invoke({})

    expect(out).toContain('partial cache')
    expect(out).toContain('Legacy Fund')
    expect(out).toContain('$50,000')
  })

  it('returns empty-holdings message when neither holdings nor legacy exist', async () => {
    const ctx = baseCtx({
      getPortfolioContext: vi.fn(async () => ({
        ...samplePortfolio,
        topHoldings: [],
      })),
    })
    const tool = toolByName(createFinocurveTools(ctx), 'get_holdings')
    const out = await tool.invoke({})

    expect(out).toContain('No investable holdings')
  })
})

describe('get_document_content', () => {
  it('rejects missing content and short extracted text', async () => {
    const ctx = baseCtx({
      getDocumentContent: vi.fn(async () => null),
      extractTextFromDocument: vi.fn(async () => 'hello'),
    })
    const tool = toolByName(createFinocurveTools(ctx), 'get_document_content')
    await expect(tool.invoke({ key: 'finocurve/documents/missing.pdf', source: 'local' })).resolves.toContain(
      'Could not read document'
    )

    vi.mocked(ctx.getDocumentContent).mockResolvedValueOnce({
      buffer: new Uint8Array([1]),
      mimeType: 'application/pdf',
    })
    await expect(tool.invoke({ key: 'finocurve/documents/blank.pdf', source: 'local' })).resolves.toContain(
      'little or no extractable text'
    )
  })

  it('truncates long extracted text at 15000 characters', async () => {
    const longText = 'x'.repeat(20_000)
    const ctx = baseCtx({
      getDocumentContent: vi.fn(async () => ({
        buffer: new Uint8Array([1]),
        mimeType: 'text/plain',
      })),
      extractTextFromDocument: vi.fn(async () => longText),
    })
    const tool = toolByName(createFinocurveTools(ctx), 'get_document_content')
    const out = (await tool.invoke({ key: 'finocurve/documents/big.txt', source: 'cloud' })) as string

    expect(out).toContain('[Source: Document "big.txt"')
    expect(out.length).toBeLessThan(longText.length)
    expect(out.replace(/^[\s\S]*?\n\n/, '')).toHaveLength(15_000)
  })
})

describe('add_net_worth_entry', () => {
  it('rejects zero amount at schema validation and forwards valid entries to ctx', async () => {
    const append = vi.fn(async () => 'logged')
    const tool = toolByName(
      createFinocurveTools(baseCtx({ appendNetWorthEntry: append })),
      'add_net_worth_entry'
    )

    await expect(tool.invoke({ amount: 0 })).rejects.toThrow(/did not match expected schema/)
    expect(append).not.toHaveBeenCalled()

    await tool.invoke({ amount: 100_000, note: 'Q1 snapshot' })
    expect(append).toHaveBeenCalledWith({
      amount: 100_000,
      note: 'Q1 snapshot',
      recordedAt: undefined,
    })
  })
})

describe('update_tracker_goal target_date mapping', () => {
  it('maps undefined, null, empty string, and ISO dates', async () => {
    const update = vi.fn(async () => 'updated')
    const tool = toolByName(
      createFinocurveTools(baseCtx({ updateTrackerGoal: update })),
      'update_tracker_goal'
    )

    await tool.invoke({ goal_id: 'g1', title: 'New title' })
    expect(update).toHaveBeenLastCalledWith(
      expect.objectContaining({ goalId: 'g1', targetDate: undefined })
    )

    await tool.invoke({ goal_id: 'g1', target_date: null })
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ targetDate: null }))

    await tool.invoke({ goal_id: 'g1', target_date: '' })
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ targetDate: null }))

    await tool.invoke({ goal_id: 'g1', target_date: '2026-12-31' })
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ targetDate: '2026-12-31' }))
  })
})

describe('suggest_conversation_follow_ups', () => {
  it('calls recordSuggestedFollowUps when provided', async () => {
    const record = vi.fn()
    const tool = toolByName(
      createFinocurveTools(baseCtx({ recordSuggestedFollowUps: record })),
      'suggest_conversation_follow_ups'
    )
    const items = [{ label: 'Compare', prompt: 'Compare my holdings to the S&P 500' }]

    const out = await tool.invoke({ items })
    expect(record).toHaveBeenCalledWith(items)
    expect(out).toContain('registered for the chat UI')
  })
})

describe('save_custom_branded_report_pdf schema', () => {
  it('rejects bar charts whose labels and values length mismatch', async () => {
    const save = vi.fn(async () => 'saved.pdf')
    const tool = toolByName(
      createFinocurveTools(baseCtx({ saveCustomBrandedReport: save })),
      'save_custom_branded_report_pdf'
    )

    await expect(
      tool.invoke({
        title: 'Report',
        sections: [
          {
            heading: 'Allocation',
            body: 'Breakdown by sector.',
            charts: [{ type: 'bar', labels: ['A', 'B'], values: [1] }],
          },
        ],
      })
    ).rejects.toThrow(/labels and values must match/)
    expect(save).not.toHaveBeenCalled()
  })
})

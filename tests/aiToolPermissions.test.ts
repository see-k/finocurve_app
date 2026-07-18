import { describe, expect, it, vi } from 'vitest'
import {
  createFinocurveTools,
  type FinocurveToolContext,
} from '../src/ai/local/tools/finocurveTools'

function baseContext(): FinocurveToolContext {
  return {
    getPortfolioContext: async () => null,
    getDocumentList: async () => [],
    getReportList: async () => [],
    getDocumentContent: async () => null,
    getRiskMetrics: async () => 'Not available',
    extractTextFromDocument: async () => '',
  }
}

function toolNames(context: FinocurveToolContext): string[] {
  return createFinocurveTools(context).map((tool) => tool.name)
}

describe('AI tool capability boundaries', () => {
  it('always exposes read-only portfolio tools but withholds unavailable mutations', () => {
    const names = toolNames(baseContext())

    expect(names).toContain('get_portfolio_summary')
    expect(names).toContain('get_holdings')
    expect(names).not.toContain('add_net_worth_entry')
    expect(names).not.toContain('create_tracker_goal')
    expect(names).not.toContain('update_tracker_goal')
    expect(names).not.toContain('save_custom_report_pdf')
  })

  it('registers a mutation tool only when its callback is supplied', async () => {
    const appendNetWorthEntry = vi.fn(async () => 'logged')
    const context = { ...baseContext(), appendNetWorthEntry }
    const tools = createFinocurveTools(context)
    const addEntry = tools.find((tool) => tool.name === 'add_net_worth_entry')

    expect(addEntry).toBeDefined()
    await expect(addEntry!.invoke({ amount: 250_000, note: 'Quarter end' })).resolves.toBe('logged')
    expect(appendNetWorthEntry).toHaveBeenCalledWith({
      amount: 250_000,
      note: 'Quarter end',
      recordedAt: undefined,
    })
  })

  it('does not infer optional external-data permissions from unrelated callbacks', () => {
    const names = toolNames({
      ...baseContext(),
      appendNetWorthEntry: async () => 'logged',
    })

    expect(names).toContain('add_net_worth_entry')
    expect(names).not.toContain('get_congressional_trades')
    expect(names).not.toContain('get_sec_filings')
    expect(names).not.toContain('get_sec_filing_content')
  })
})

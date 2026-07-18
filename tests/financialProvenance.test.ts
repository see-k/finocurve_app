import { describe, expect, it } from 'vitest'
import type { Asset, Portfolio } from '../src/types'
import {
  aggregateAssetValueProvenance,
  createFinancialProvenance,
  demoAssetProvenance,
  deriveAssetValueProvenance,
  deriveCalculatedProvenance,
  formatProvenanceAsOf,
  getAssetCostBasisProvenance,
  getAssetCurrentPriceProvenance,
  getFinancialFreshness,
  normalizePortfolioFinancialProvenance,
  toFinancialAuditContext,
  userEnteredAssetProvenance,
} from '../src/lib/financialProvenance'

const NOW = '2026-07-16T12:00:00.000Z'

function asset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'a1', name: 'Asset', type: 'stock', category: 'public', quantity: 2,
    costBasis: 100, currentPrice: 75, currency: 'USD', tags: [], ...overrides,
  }
}

describe('financial provenance', () => {
  it('enriches legacy portfolios without changing values or business timestamps', () => {
    const portfolio: Portfolio = {
      id: 'p1', name: 'Existing', currency: 'USD', assets: [asset()],
      createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z',
    }
    const enriched = normalizePortfolioFinancialProvenance(portfolio)
    expect(enriched.assets[0].currentPrice).toBe(75)
    expect(enriched.assets[0].costBasis).toBe(100)
    expect(enriched.updatedAt).toBe(portfolio.updatedAt)
    expect(enriched.assets[0].financialProvenance?.currentPrice.sourceName).toBe('Legacy portfolio record')
    expect(enriched.financialProvenanceVersion).toBe(1)
  })

  it('enriches manual assets and loans with category-appropriate legacy methods', () => {
    const portfolio: Portfolio = {
      id: 'p1', name: 'Existing', currency: 'USD', createdAt: '2024-01-01T00:00:00.000Z', updatedAt: NOW,
      assets: [
        asset({ id: 'manual', category: 'manual', purchaseDate: '2020-01-01' }),
        asset({ id: 'loan', category: 'loan', loanStartDate: '2021-03-10', costBasis: -1000, currentPrice: -700 }),
      ],
    }
    const [manual, loan] = normalizePortfolioFinancialProvenance(portfolio).assets
    expect(manual.financialProvenance?.currentPrice.valuationMethod).toBe('manual_mark')
    expect(manual.financialProvenance?.costBasis.asOf).toContain('2020-01-01')
    expect(loan.financialProvenance?.currentPrice.valuationMethod).toBe('outstanding_balance')
    expect(loan.financialProvenance?.costBasis.valuationMethod).toBe('original_principal')
    expect(loan.financialProvenance?.loanTerms?.sourceKind).toBe('imported')
  })

  it('preserves provenance that already exists', () => {
    const currentPrice = createFinancialProvenance({
      sourceKind: 'market', sourceName: 'Yahoo Finance', valuationMethod: 'market_price', asOf: NOW,
    }, NOW)
    const portfolio: Portfolio = {
      id: 'p1', name: 'Existing', currency: 'USD', createdAt: NOW, updatedAt: NOW,
      assets: [asset({ financialProvenance: {
        currentPrice,
        costBasis: createFinancialProvenance({
          sourceKind: 'manual', sourceName: 'User', valuationMethod: 'acquisition_cost', asOf: NOW,
        }, NOW),
      } })],
    }
    expect(normalizePortfolioFinancialProvenance(portfolio).assets[0].financialProvenance?.currentPrice).toEqual(currentPrice)
  })

  it('uses the oldest underlying timestamp and identifies mixed sources for totals', () => {
    const first = createFinancialProvenance({
      sourceKind: 'market', sourceName: 'Yahoo Finance', valuationMethod: 'market_price', asOf: '2026-07-16T11:55:00.000Z',
    }, NOW)
    const second = createFinancialProvenance({
      sourceKind: 'manual', sourceName: 'User-entered valuation', valuationMethod: 'manual_mark', asOf: '2026-07-15T09:00:00.000Z',
    }, NOW)
    const result = aggregateAssetValueProvenance([
      asset({ id: 'a1', financialProvenance: { currentPrice: first, costBasis: first } }),
      asset({ id: 'a2', financialProvenance: { currentPrice: second, costBasis: second } }),
    ], NOW)
    expect(result.asOf).toBe('2026-07-15T09:00:00.000Z')
    expect(result.sourceName).toBe('Mixed sources (2)')
    expect(result.valuationMethod).toBe('portfolio_sum')
  })

  it('describes empty and single-source aggregates', () => {
    const empty = aggregateAssetValueProvenance([], NOW)
    expect(empty.sourceName).toBe('No holdings')
    const manual = userEnteredAssetProvenance(asset({ category: 'manual' }), NOW)
    const aggregate = aggregateAssetValueProvenance([
      asset({ financialProvenance: manual }),
      asset({ id: 'a2', financialProvenance: manual }),
    ], NOW)
    expect(aggregate.sourceName).toBe('User-entered valuation')
  })

  it('creates category-specific manual and demo audit records', () => {
    const manual = userEnteredAssetProvenance(asset({ category: 'manual', purchaseDate: '2022-02-02' }), NOW)
    expect(manual.currentPrice.valuationMethod).toBe('manual_mark')
    expect(manual.costBasis.asOf).toContain('2022-02-02')
    expect(manual.loanTerms).toBeUndefined()

    const loan = asset({ category: 'loan', loanStartDate: '2023-01-15' })
    const enteredLoan = userEnteredAssetProvenance(loan, NOW)
    const demoLoan = demoAssetProvenance(loan, NOW)
    expect(enteredLoan.currentPrice.valuationMethod).toBe('outstanding_balance')
    expect(enteredLoan.loanTerms?.valuationMethod).toBe('amortization')
    expect(demoLoan.currentPrice.sourceKind).toBe('demo')
    expect(demoLoan.loanTerms?.isEstimated).toBe(true)

    const demoPublic = demoAssetProvenance(asset(), NOW)
    const demoManual = demoAssetProvenance(asset({ category: 'manual' }), NOW)
    expect(demoPublic.currentPrice.valuationMethod).toBe('legacy_record')
    expect(demoManual.currentPrice.valuationMethod).toBe('manual_mark')
  })

  it('derives holding and calculated values while preserving input timestamps', () => {
    const stored = createFinancialProvenance({
      sourceKind: 'market', sourceName: ' Yahoo Finance ', valuationMethod: 'market_price',
      asOf: '2026-07-16T11:55:00.000Z', recordedAt: NOW,
    }, NOW)
    const item = asset({ financialProvenance: { currentPrice: stored, costBasis: stored } })
    const holding = deriveAssetValueProvenance(item)
    expect(holding).toMatchObject({ sourceName: 'Yahoo Finance', valuationMethod: 'quantity_times_price', asOf: stored.asOf })
    const risk = deriveCalculatedProvenance(holding, 'FinoCurve risk engine', 'risk_model', NOW)
    expect(risk).toMatchObject({ sourceKind: 'calculated', sourceName: 'FinoCurve risk engine', asOf: stored.asOf })

    const loanHolding = deriveAssetValueProvenance(asset({ category: 'loan', financialProvenance: { currentPrice: stored, costBasis: stored } }))
    expect(loanHolding.valuationMethod).toBe('outstanding_balance')
  })

  it('provides explicit fallbacks for assets without stored metadata', () => {
    const legacy = asset({ purchaseDate: '2020-01-01' })
    expect(getAssetCurrentPriceProvenance(legacy, NOW).valuationMethod).toBe('legacy_record')
    expect(getAssetCostBasisProvenance(legacy, NOW).asOf).toContain('2020-01-01')
  })

  it('applies stricter freshness thresholds to market prices', () => {
    const current = createFinancialProvenance({
      sourceKind: 'market', sourceName: 'Market', valuationMethod: 'market_price', asOf: '2026-07-16T11:45:00.000Z',
    }, NOW)
    const stale = { ...current, asOf: '2026-07-15T11:00:00.000Z' }
    expect(getFinancialFreshness(current, NOW).status).toBe('current')
    expect(getFinancialFreshness(stale, NOW).status).toBe('stale')
    expect(getFinancialFreshness({ ...current, asOf: '2026-07-16T11:00:00.000Z' }, NOW).status).toBe('aging')
  })

  it('grades manual values and handles invalid timestamps', () => {
    const manual = createFinancialProvenance({
      sourceKind: 'manual', sourceName: '', valuationMethod: 'manual_mark', asOf: 'not-a-date', recordedAt: NOW,
    }, NOW)
    expect(manual.sourceName).toBe('Unknown source')
    expect(manual.asOf).toBe(NOW)
    expect(getFinancialFreshness(manual, NOW).status).toBe('current')
    expect(getFinancialFreshness({ ...manual, asOf: '2026-06-01T00:00:00.000Z' }, NOW).status).toBe('aging')
    expect(getFinancialFreshness({ ...manual, asOf: '2025-01-01T00:00:00.000Z' }, NOW).status).toBe('stale')
    expect(getFinancialFreshness({ ...manual, asOf: 'invalid' }, NOW).status).toBe('unknown')
  })

  it('treats acquisition cost as historical rather than stale', () => {
    const value = createFinancialProvenance({
      sourceKind: 'manual', sourceName: 'User', valuationMethod: 'acquisition_cost', asOf: '2010-01-01T00:00:00.000Z',
    }, NOW)
    expect(getFinancialFreshness(value, NOW).status).toBe('historical')
  })

  it('formats valid audit times and labels invalid ones', () => {
    expect(formatProvenanceAsOf(NOW)).not.toBe('Unknown time')
    expect(formatProvenanceAsOf('invalid')).toBe('Unknown time')
    const audit = toFinancialAuditContext(createFinancialProvenance({
      sourceKind: 'demo', sourceName: 'Sample', valuationMethod: 'illustrative_simulation',
      asOf: NOW, isEstimated: true,
    }, NOW))
    expect(audit).toMatchObject({ source: 'Sample', valuationMethod: 'Illustrative simulation', estimated: true })
  })
})

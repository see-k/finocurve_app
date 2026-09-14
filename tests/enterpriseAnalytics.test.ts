import { describe, expect, it } from 'vitest'
import { deriveCustodyMatrix, EXPOSURE_ORDER } from '../src/lib/enterpriseAnalytics'
import type { EnterpriseBalances } from '../src/services/enterprise'

function balances(overrides: Partial<EnterpriseBalances> = {}): EnterpriseBalances {
  return {
    by_product: [],
    aggregate: { total_usd: 0, crypto: [] },
    ...overrides,
  }
}

const schwab = {
  product: 'schwab',
  institution_name: 'Charles Schwab',
  total_usd: 100_000,
  balances: [
    { account_number: '***1234', equity: 75_000, cash_balance: 25_000 },
  ],
}

const bank = {
  product: 'simplefin',
  institution_name: 'First National',
  total_usd: 40_000,
  balances: [
    { account_name: 'Operating', balance: 30_000 },
    { account_name: 'Reserve', balance: 10_000 },
  ],
}

const exchange = {
  product: 'coinbase',
  total_usd: 60_000,
  balances: [
    { currency: 'BTC', available: 0.5, hold: 0, total: 0.5 },
    { currency: 'ETH', available: 4, hold: 0, total: 4 },
  ],
}

describe('deriveCustodyMatrix', () => {
  it('maps provider vocabularies onto shared exposure buckets', () => {
    const matrix = deriveCustodyMatrix(balances({ by_product: [schwab, bank, exchange] }))
    const byKey = Object.fromEntries(matrix.rows.map((r) => [r.key, r]))

    expect(byKey.schwab.exposures.securities).toBeCloseTo(75_000, 6)
    expect(byKey.schwab.exposures.cash).toBeCloseTo(25_000, 6)
    expect(byKey.simplefin.exposures.cash).toBeCloseTo(40_000, 6)
    // Exchanges report quantities, so the product total carries the valuation.
    expect(byKey.coinbase.exposures.crypto).toBeCloseTo(60_000, 6)
  })

  it('reconciles every row to the total the provider reported', () => {
    const matrix = deriveCustodyMatrix(balances({ by_product: [schwab, bank, exchange] }))
    for (const row of matrix.rows) {
      const summed = EXPOSURE_ORDER.reduce((sum, kind) => sum + row.exposures[kind], 0)
      expect(summed).toBeCloseTo(row.total, 6)
    }
  })

  it('reconciles even when the mapped rows disagree with the reported total', () => {
    // Provider total includes a sweep the account rows omit.
    const mismatched = {
      product: 'schwab',
      total_usd: 120_000,
      balances: [{ equity: 75_000, cash_balance: 25_000 }],
    }
    const matrix = deriveCustodyMatrix(balances({ by_product: [mismatched] }))
    const row = matrix.rows[0]
    const summed = EXPOSURE_ORDER.reduce((sum, kind) => sum + row.exposures[kind], 0)
    expect(summed).toBeCloseTo(120_000, 6)
    // The regression this guards: a chart whose bars sum to less than the
    // headline figure printed directly above them.
    expect(summed).toBeCloseTo(matrix.total, 6)
  })

  it('banks the whole total in Other when no row maps to a known bucket', () => {
    const opaque = { product: 'mystery', total_usd: 5_000, balances: [{}] }
    const matrix = deriveCustodyMatrix(balances({ by_product: [opaque] }))
    expect(matrix.rows[0].exposures.other).toBeCloseTo(5_000, 6)
    expect(matrix.total).toBeCloseTo(5_000, 6)
  })

  it('keeps failed products visible but out of the total', () => {
    const failed = { product: 'teller', total_usd: 9_999, balances: [], error: 'rate limited' }
    const matrix = deriveCustodyMatrix(balances({ by_product: [bank, failed] }))
    const row = matrix.rows.find((r) => r.key === 'teller')!
    expect(row.failed).toBe(true)
    expect(row.total).toBe(0)
    expect(matrix.total).toBeCloseTo(40_000, 6)
  })

  it('honours the service flag excluding a product from totals', () => {
    const excluded = { ...bank, product: 'teller', exclude_from_totals: true }
    const matrix = deriveCustodyMatrix(balances({ by_product: [schwab, excluded] }))
    expect(matrix.rows.find((r) => r.key === 'teller')!.total).toBe(0)
    expect(matrix.total).toBeCloseTo(100_000, 6)
  })

  it('weights institutions against the consolidated total', () => {
    const matrix = deriveCustodyMatrix(balances({ by_product: [schwab, bank, exchange] }))
    expect(matrix.total).toBeCloseTo(200_000, 6)
    expect(matrix.rows.reduce((sum, r) => sum + r.weight, 0)).toBeCloseTo(100, 6)
    expect(matrix.rows.find((r) => r.key === 'schwab')!.weight).toBeCloseTo(50, 6)
  })

  it('ranks institutions by size and exposes the peak cell for scaling', () => {
    const matrix = deriveCustodyMatrix(balances({ by_product: [bank, schwab, exchange] }))
    expect(matrix.rows.map((r) => r.key)).toEqual(['schwab', 'coinbase', 'simplefin'])
    expect(matrix.peakCell).toBeCloseTo(75_000, 6)
  })

  it('counts accounts and distinct digital assets', () => {
    const matrix = deriveCustodyMatrix(balances({
      by_product: [schwab, bank, exchange],
      aggregate: {
        total_usd: 200_000,
        crypto: [
          { asset: 'BTC', amount: 0.5, product: 'coinbase' },
          { asset: 'ETH', amount: 4, product: 'coinbase' },
          { asset: 'BTC', amount: 0.1, product: 'binance_us' },
        ],
      },
    }))
    expect(matrix.accountCount).toBe(5)
    expect(matrix.cryptoAssetCount).toBe(2)
  })

  it('returns an empty matrix rather than throwing on null balances', () => {
    const matrix = deriveCustodyMatrix(null)
    expect(matrix.rows).toEqual([])
    expect(matrix.total).toBe(0)
    expect(matrix.peakCell).toBe(0)
  })

  it('never produces a negative exposure from a negative portfolio remainder', () => {
    // Cash exceeding portfolio value would otherwise yield negative securities.
    const odd = {
      product: 'alpaca',
      total_usd: 10_000,
      balances: [{ portfolio_value: 3_000, cash: 10_000 }],
    }
    const matrix = deriveCustodyMatrix(balances({ by_product: [odd] }))
    for (const kind of EXPOSURE_ORDER) {
      expect(matrix.rows[0].exposures[kind]).toBeGreaterThanOrEqual(0)
    }
  })
})

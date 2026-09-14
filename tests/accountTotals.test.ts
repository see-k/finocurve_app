import { describe, expect, it } from 'vitest'
import { deriveAccountTotals } from '../src/lib/accountTotals'
import { balancedAssets, cashOnlyAssets, loanAsset } from './fixtures/portfolioFixtures'

describe('deriveAccountTotals', () => {
  it('separates holdings from liabilities', () => {
    const totals = deriveAccountTotals([...balancedAssets, loanAsset])
    expect(totals.holdings).toHaveLength(balancedAssets.length)
    expect(totals.loans).toHaveLength(1)
  })

  it('states liabilities as a positive number and nets them into net worth', () => {
    const totals = deriveAccountTotals([...balancedAssets, loanAsset])
    expect(totals.grossAssets).toBe(100_000)
    expect(totals.totalLiabilities).toBe(280_000)
    expect(totals.netWorth).toBe(100_000 - 280_000)
  })

  it('keeps invested cost free of liability cost basis', () => {
    const withoutLoan = deriveAccountTotals(balancedAssets)
    const withLoan = deriveAccountTotals([...balancedAssets, loanAsset])
    // A mortgage's negative basis must not net against deployed capital.
    expect(withLoan.investedCost).toBe(withoutLoan.investedCost)
    expect(withLoan.investedCost).toBe(87_000)
  })

  it('reports a return that agrees with the unrealized gain it is derived from', () => {
    const totals = deriveAccountTotals([...balancedAssets, loanAsset])
    expect(totals.unrealizedGain).toBe(totals.grossAssets - totals.investedCost)
    expect(totals.totalReturnPercent).toBeCloseTo(
      (totals.unrealizedGain / totals.investedCost) * 100, 10
    )
    // The regression this guards: gain positive while the rate reads zero.
    expect(totals.unrealizedGain).toBeGreaterThan(0)
    expect(totals.totalReturnPercent).toBeGreaterThan(0)
  })

  it('reports a zero return rather than a division by zero when no cost is on file', () => {
    const totals = deriveAccountTotals([{ ...cashOnlyAssets[0], costBasis: 0 }])
    expect(totals.investedCost).toBe(0)
    expect(totals.totalReturnPercent).toBe(0)
  })

  it('returns zeroed totals for an empty account', () => {
    const totals = deriveAccountTotals([])
    expect(totals).toMatchObject({
      grossAssets: 0, totalLiabilities: 0, netWorth: 0,
      investedCost: 0, unrealizedGain: 0, totalReturnPercent: 0,
    })
  })

  it('never reports negative gross assets when only liabilities are on file', () => {
    const totals = deriveAccountTotals([loanAsset])
    expect(totals.grossAssets).toBe(0)
    expect(totals.totalLiabilities).toBe(280_000)
    expect(totals.netWorth).toBe(-280_000)
  })
})

import { describe, expect, it } from 'vitest'
import {
  assetCurrentValue,
  assetGainLoss,
  assetGainLossPercent,
  loanBalance,
  loanPaidOff,
  loanPayoffPercent,
  loanPrincipal,
  portfolioAllocationByCountry,
  portfolioAllocationByType,
  portfolioTotalCost,
  portfolioTotalGainLoss,
  portfolioTotalGainLossPercent,
  portfolioTotalValue,
} from '../src/types'
import { balancedAssets, loanAsset, portfolio } from './fixtures/portfolioFixtures'

describe('financial calculations', () => {
  it('calculates asset value and gain/loss from quantity, price, and cost basis', () => {
    const holding = { ...balancedAssets[0], quantity: 4, currentPrice: 125, costBasis: 350 }

    expect(assetCurrentValue(holding)).toBe(500)
    expect(assetGainLoss(holding)).toBe(150)
    expect(assetGainLossPercent(holding)).toBeCloseTo(42.8571, 4)
    expect(assetGainLossPercent({ ...holding, costBasis: 0 })).toBe(0)
  })

  it('treats stored negative loan values as positive liability metrics', () => {
    expect(loanPrincipal(loanAsset)).toBe(350_000)
    expect(loanBalance(loanAsset)).toBe(280_000)
    expect(loanPaidOff(loanAsset)).toBe(70_000)
    expect(loanPayoffPercent(loanAsset)).toBe(20)
    expect(loanBalance(balancedAssets[0])).toBe(0)
  })

  it('calculates portfolio totals without silently dropping liabilities', () => {
    const fixture = portfolio([...balancedAssets, loanAsset])

    expect(portfolioTotalValue(fixture)).toBe(-180_000)
    expect(portfolioTotalCost(fixture)).toBe(-263_000)
    expect(portfolioTotalGainLoss(fixture)).toBe(83_000)
    expect(portfolioTotalGainLossPercent(fixture)).toBe(0)
  })

  it('groups allocations and can exclude loans from geographic exposure', () => {
    const fixture = portfolio([
      { ...balancedAssets[0], country: 'US' },
      { ...balancedAssets[1], country: 'CA' },
      { ...loanAsset, country: 'US' },
    ])

    expect(portfolioAllocationByType(fixture)).toEqual({ stock: 40_000, etf: 20_000, real_estate: -280_000 })
    expect(portfolioAllocationByCountry(fixture)).toEqual({ US: -240_000, CA: 20_000 })
    expect(portfolioAllocationByCountry(fixture, true)).toEqual({ US: 40_000, CA: 20_000 })
  })
})

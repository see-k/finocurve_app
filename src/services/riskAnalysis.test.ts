import { describe, expect, it } from 'vitest'
import type { Asset } from '../types'
import { analyzePortfolio } from './riskAnalysis'

function asset(overrides: Partial<Asset> & Pick<Asset, 'name' | 'type'>): Asset {
  return {
    id: overrides.id ?? 'asset-1',
    category: 'public',
    quantity: 1,
    costBasis: 100,
    currentPrice: 100,
    currency: 'USD',
    tags: [],
    ...overrides,
  }
}

describe('analyzePortfolio', () => {
  it('returns null for empty portfolios or zero total value', () => {
    expect(analyzePortfolio([], 0, 0)).toBeNull()
    expect(analyzePortfolio([asset({ name: 'Cash', type: 'cash', currentPrice: 0 })], 0, 0)).toBeNull()
  })

  it('assigns moderate risk and low volatility to bond-heavy portfolios', () => {
    const assets = [
      asset({ id: 'b1', name: 'Treasury', type: 'bond', currentPrice: 7000 }),
      asset({ id: 'c1', name: 'Cash', type: 'cash', currentPrice: 3000 }),
    ]
    const result = analyzePortfolio(assets, 10_000, 2)

    expect(result).not.toBeNull()
    expect(result!.riskLevel).toBe('moderate')
    expect(result!.riskScore).toBeLessThan(45)
    expect(result!.annualizedVolatility).toBeLessThan(15)
  })

  it('classifies crypto-heavy portfolios as aggressive with high volatility', () => {
    const assets = [
      asset({ id: 'c1', name: 'Bitcoin', type: 'crypto', currentPrice: 8000 }),
      asset({ id: 's1', name: 'Apple', type: 'stock', currentPrice: 2000 }),
    ]
    const result = analyzePortfolio(assets, 10_000, 15)

    expect(result).not.toBeNull()
    expect(result!.riskLevel).toBe('aggressive')
    expect(result!.annualizedVolatility).toBeGreaterThan(60)
    expect(result!.volatilityLevel).toBe('very_high')
  })

  it('warns when a single asset exceeds 25% of the portfolio', () => {
    const assets = [
      asset({ id: 'a1', name: 'Mega Corp', type: 'stock', currentPrice: 6000 }),
      asset({ id: 'a2', name: 'Bond Fund', type: 'bond', currentPrice: 4000 }),
    ]
    const result = analyzePortfolio(assets, 10_000, 5)

    expect(result!.concentrationWarnings.some((w) => w.asset === 'Mega Corp' && w.type === 'high')).toBe(true)
    expect(result!.concentrationIndex).toBeGreaterThan(0.5)
  })

  it('includes Crypto Winter only when crypto is held', () => {
    const stockOnly = analyzePortfolio(
      [asset({ name: 'Apple', type: 'stock', currentPrice: 10_000 })],
      10_000,
      8,
    )
    const withCrypto = analyzePortfolio(
      [
        asset({ id: 's1', name: 'Apple', type: 'stock', currentPrice: 5000 }),
        asset({ id: 'c1', name: 'Bitcoin', type: 'crypto', currentPrice: 5000 }),
      ],
      10_000,
      8,
    )

    expect(stockOnly!.scenarioAnalysis.some((s) => s.name === 'Crypto Winter')).toBe(false)
    expect(withCrypto!.scenarioAnalysis.some((s) => s.name === 'Crypto Winter')).toBe(true)
  })

  it('adds a low-diversification warning when fewer than three asset types are held', () => {
    const result = analyzePortfolio(
      [
        asset({ id: 's1', name: 'Apple', type: 'stock', currentPrice: 6000 }),
        asset({ id: 's2', name: 'Microsoft', type: 'stock', currentPrice: 4000 }),
      ],
      10_000,
      4,
    )

    expect(
      result!.concentrationWarnings.some((w) => w.message.includes('Low diversification')),
    ).toBe(true)
  })

  it('sorts top risk contributors by contribution weight', () => {
    const result = analyzePortfolio(
      [
        asset({ id: 'c1', name: 'Bitcoin', type: 'crypto', currentPrice: 7000 }),
        asset({ id: 'b1', name: 'Bond', type: 'bond', currentPrice: 3000 }),
      ],
      10_000,
      6,
    )

    expect(result!.topRiskContributors[0].assetName).toBe('Bitcoin')
    expect(result!.topRiskContributors[0].riskContribution).toBeGreaterThan(
      result!.topRiskContributors[1].riskContribution,
    )
  })
})

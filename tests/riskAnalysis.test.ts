import { describe, expect, it } from 'vitest'
import { analyzePortfolio } from '../src/services/riskAnalysis'
import {
  balancedAssets,
  cashOnlyAssets,
  concentratedCryptoAssets,
} from './fixtures/portfolioFixtures'

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

describe('risk analysis', () => {
  it('returns no analysis when the portfolio has no usable value', () => {
    expect(analyzePortfolio([], 0, 0)).toBeNull()
    expect(analyzePortfolio(cashOnlyAssets, 0, 0)).toBeNull()
  })

  it('produces stable metrics for a diversified mixed portfolio', () => {
    const result = analyzePortfolio(balancedAssets, 100_000, 15)

    expect(result).not.toBeNull()
    expect(result?.riskScore).toBe(51)
    expect(result?.riskLevel).toBe('growth')
    expect(result?.annualizedVolatility).toBe(16.6)
    expect(result?.volatilityLevel).toBe('moderate')
    expect(result?.liquidityScore).toBe(70)
    expect(result?.concentrationIndex).toBeCloseTo(0.26, 4)
    expect(result?.scenarioAnalysis.map((scenario) => scenario.name)).not.toContain('Crypto Winter')
    expect(sum(Object.values(result?.riskContributionByType ?? {}))).toBeCloseTo(100, 0)
    expect(sum(Object.values(result?.liquidityBreakdown ?? {}))).toBeCloseTo(100, 5)
    expect(result?.explainableMetrics?.every((metric) => metric.explainable.dataSource.length > 0)).toBe(true)
  })

  it('flags concentrated crypto exposure and applies crypto stress', () => {
    const result = analyzePortfolio(concentratedCryptoAssets, 100_000, 53.8461538)
    const cryptoWinter = result?.scenarioAnalysis.find((scenario) => scenario.name === 'Crypto Winter')

    expect(result?.riskScore).toBe(100)
    expect(result?.riskLevel).toBe('aggressive')
    expect(result?.annualizedVolatility).toBe(80)
    expect(result?.maxDrawdownPercent).toBe(80)
    expect(result?.concentrationWarnings.some((warning) => warning.type === 'high')).toBe(true)
    expect(cryptoWinter?.impactPercent).toBe(-80)
    expect(cryptoWinter?.impactAmount).toBe(-80_000)
    expect(result?.topRiskContributors[0]?.assetName).toBe('Bitcoin')
  })

  it('keeps every bounded score finite and within its documented range', () => {
    for (const assets of [balancedAssets, cashOnlyAssets, concentratedCryptoAssets]) {
      const totalValue = sum(assets.map((asset) => asset.quantity * asset.currentPrice))
      const result = analyzePortfolio(assets, totalValue, 8)

      expect(result).not.toBeNull()
      expect(result?.riskScore).toBeGreaterThanOrEqual(0)
      expect(result?.riskScore).toBeLessThanOrEqual(100)
      expect(result?.liquidityScore).toBeGreaterThanOrEqual(0)
      expect(result?.liquidityScore).toBeLessThanOrEqual(100)
      expect(result?.diversificationScore).toBeGreaterThanOrEqual(0)
      expect(result?.diversificationScore).toBeLessThanOrEqual(100)
      expect(result?.scenarioAnalysis.every((scenario) => Number.isFinite(scenario.impactAmount))).toBe(true)
      expect(result?.rebalancingSuggestions.every((suggestion) => suggestion.changeAmount >= 0)).toBe(true)
    }
  })

  it('covers alternative assets and moderate rebalancing recommendations', () => {
    const moderateStockTilt = [
      { ...cashOnlyAssets[0], id: 'stock-50', name: 'Stocks', type: 'stock' as const, category: 'public' as const, currentPrice: 50_000, costBasis: 45_000 },
      { ...cashOnlyAssets[0], id: 'etf-20', name: 'ETFs', type: 'etf' as const, category: 'public' as const, currentPrice: 20_000, costBasis: 18_000 },
      { ...cashOnlyAssets[0], id: 'bond-15', name: 'Bonds', type: 'bond' as const, category: 'public' as const, currentPrice: 15_000, costBasis: 15_000 },
      { ...cashOnlyAssets[0], id: 'property-10', name: 'Property', type: 'real_estate' as const, currentPrice: 10_000, costBasis: 9_000 },
      { ...cashOnlyAssets[0], id: 'cash-5', currentPrice: 5_000, costBasis: 5_000 },
    ]
    const tiltedResult = analyzePortfolio(moderateStockTilt, 100_000, 8)
    const stockSuggestion = tiltedResult?.rebalancingSuggestions.find(
      (suggestion) => suggestion.assetType === 'Stocks',
    )

    expect(stockSuggestion?.action).toBe('sell')
    expect(stockSuggestion?.priority).toBe('medium')

    const commodity = [{
      ...cashOnlyAssets[0],
      id: 'gold',
      name: 'Gold',
      type: 'commodity' as const,
      currentPrice: 100_000,
      costBasis: 80_000,
    }]
    const alternativeResult = analyzePortfolio(commodity, 100_000, 25)

    expect(alternativeResult?.rebalancingSuggestions).toContainEqual(
      expect.objectContaining({ action: 'review', assetType: 'Commodities', priority: 'medium' }),
    )
  })

  it('classifies negative and exceptional risk-adjusted returns', () => {
    const poor = analyzePortfolio(cashOnlyAssets, 10_000, -10)
    const excellent = analyzePortfolio(cashOnlyAssets, 10_000, 10)

    expect(poor?.sharpeRating).toBe('poor')
    expect(poor?.benchmarkComparison.verdict).toContain('Underperforming')
    expect(excellent?.sharpeRating).toBe('excellent')
    expect(excellent?.benchmarkComparison.portfolioSharpe).toBeGreaterThan(2)
  })
})

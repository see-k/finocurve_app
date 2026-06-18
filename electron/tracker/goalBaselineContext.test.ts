import { describe, expect, it } from 'vitest'
import type { PortfolioContext } from '../../src/ai/types'
import {
  currentValueForGoalSourceFromContext,
  goalProgressPercentForSummary,
  naturalBaselineForGoalSource,
  normalizeGoalProgressSource,
} from './goalBaselineContext'

const portfolio: PortfolioContext = {
  portfolioName: 'Test',
  totalValue: 150,
  totalGainLossPercent: 0,
  assetCount: 2,
  holdings: [
    {
      symbol: 'TST',
      name: 'Test',
      type: 'stock',
      category: 'public',
      value: 150,
      quantity: 10,
      costBasis: 100,
      currency: 'USD',
    },
  ],
  topHoldings: [{ symbol: 'TST', name: 'Test', value: 150 }],
  loans: [{ name: 'Mortgage', balance: 150_000 }],
  riskScore: 42,
}

describe('normalizeGoalProgressSource', () => {
  it('maps aliases and defaults to net_worth', () => {
    expect(normalizeGoalProgressSource(undefined)).toBe('net_worth')
    expect(normalizeGoalProgressSource('portfolio')).toBe('portfolio_balance')
    expect(normalizeGoalProgressSource('debt')).toBe('debt_loans')
    expect(normalizeGoalProgressSource('risk-score')).toBe('risk_score')
    expect(normalizeGoalProgressSource('holdings')).toBe('portfolio_balance')
  })
})

describe('currentValueForGoalSourceFromContext', () => {
  it('reads net worth, holdings, debt, and risk from synced portfolio cache', () => {
    expect(currentValueForGoalSourceFromContext('net_worth', 500, portfolio)).toBe(500)
    expect(currentValueForGoalSourceFromContext('portfolio_balance', null, portfolio)).toBe(150)
    expect(currentValueForGoalSourceFromContext('debt_loans', null, portfolio)).toBe(150_000)
    expect(currentValueForGoalSourceFromContext('risk_score', null, portfolio)).toBe(42)
  })

  it('returns null for risk_score when portfolio cache has no riskScore (stale sync)', () => {
    const stale: PortfolioContext = {
      portfolioName: portfolio.portfolioName,
      totalValue: portfolio.totalValue,
      totalGainLossPercent: portfolio.totalGainLossPercent,
      assetCount: portfolio.assetCount,
      holdings: portfolio.holdings,
    }
    expect(currentValueForGoalSourceFromContext('risk_score', null, stale)).toBeNull()
  })

  it('falls back to topHoldings when holdings is empty', () => {
    const ctx: PortfolioContext = {
      portfolioName: 'Fallback',
      totalValue: 99,
      totalGainLossPercent: 0,
      assetCount: 1,
      holdings: [],
      topHoldings: [{ symbol: 'X', name: 'X', value: 99 }],
    }
    expect(currentValueForGoalSourceFromContext('portfolio_balance', null, ctx)).toBe(99)
  })
})

describe('naturalBaselineForGoalSource', () => {
  it('matches renderer goal baseline rules', () => {
    expect(naturalBaselineForGoalSource('portfolio_balance', 500)).toBe(0)
    expect(naturalBaselineForGoalSource('risk_score', 42)).toBe(100)
    expect(naturalBaselineForGoalSource('net_worth', 1234)).toBe(1234)
    expect(naturalBaselineForGoalSource('debt_loans', 50_000)).toBe(50_000)
  })
})

describe('goalProgressPercentForSummary', () => {
  it('calculates growth and paydown progress with null-safe current', () => {
    expect(goalProgressPercentForSummary({ baselineAmount: 0, targetAmount: 100 }, 50)).toBe(50)
    expect(goalProgressPercentForSummary({ baselineAmount: 200_000, targetAmount: 100_000 }, 150_000)).toBe(50)
    expect(goalProgressPercentForSummary({ baselineAmount: 100, targetAmount: 100 }, 100)).toBeNull()
    expect(goalProgressPercentForSummary({ baselineAmount: 0, targetAmount: 100 }, null)).toBe(0)
  })
})

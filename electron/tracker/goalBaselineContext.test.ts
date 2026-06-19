import { describe, expect, it } from 'vitest'
import type { PortfolioContext } from '../../src/ai/types'
import {
  currentValueForGoalSourceFromContext,
  goalProgressPercentForSummary,
  naturalBaselineForGoalSource,
  normalizeGoalProgressSource,
} from './goalBaselineContext'

const portfolio: PortfolioContext = {
  totalValue: 250_000,
  holdings: [
    { symbol: 'AAPL', name: 'Apple', value: 50_000, weight: 20 },
    { symbol: 'MSFT', name: 'Microsoft', value: 30_000, weight: 12 },
  ],
  loans: [{ name: 'Mortgage', balance: 120_000 }],
  riskScore: 42,
}

describe('normalizeGoalProgressSource', () => {
  it('normalizes aliases and defaults to net_worth', () => {
    expect(normalizeGoalProgressSource(undefined)).toBe('net_worth')
    expect(normalizeGoalProgressSource('portfolio')).toBe('portfolio_balance')
    expect(normalizeGoalProgressSource('holdings')).toBe('portfolio_balance')
    expect(normalizeGoalProgressSource('debt-loans')).toBe('debt_loans')
    expect(normalizeGoalProgressSource('risk')).toBe('risk_score')
    expect(normalizeGoalProgressSource('unknown-metric')).toBe('net_worth')
  })
})

describe('currentValueForGoalSourceFromContext', () => {
  it('derives live values from synced portfolio context', () => {
    expect(currentValueForGoalSourceFromContext('net_worth', 500_000, portfolio)).toBe(500_000)
    expect(currentValueForGoalSourceFromContext('portfolio_balance', null, portfolio)).toBe(80_000)
    expect(currentValueForGoalSourceFromContext('debt_loans', null, portfolio)).toBe(120_000)
    expect(currentValueForGoalSourceFromContext('risk_score', null, portfolio)).toBe(42)
  })

  it('returns null for risk_score when portfolio cache has no riskScore', () => {
    const stale: PortfolioContext = { ...portfolio, riskScore: undefined }
    expect(currentValueForGoalSourceFromContext('risk_score', null, stale)).toBeNull()
  })
})

describe('goalBaselineContext progress helpers', () => {
  it('assigns natural baselines consistent with renderer goal metrics', () => {
    expect(naturalBaselineForGoalSource('portfolio_balance', 500)).toBe(0)
    expect(naturalBaselineForGoalSource('risk_score', 42)).toBe(100)
    expect(naturalBaselineForGoalSource('net_worth', 1234)).toBe(1234)
  })

  it('calculates growth and paydown progress for AI goal summaries', () => {
    expect(goalProgressPercentForSummary({ baselineAmount: 0, targetAmount: 100 }, 50)).toBe(50)
    expect(goalProgressPercentForSummary({ baselineAmount: 200_000, targetAmount: 100_000 }, 150_000)).toBe(50)
    expect(goalProgressPercentForSummary({ baselineAmount: 100, targetAmount: 100 }, 100)).toBeNull()
  })
})

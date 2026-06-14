import { describe, expect, it } from 'vitest'
import type { Portfolio } from '../types'
import {
  currentValueForGoalSource,
  goalProgressPercent,
  naturalBaselineForGoalSource,
  portfolioHoldingsValue,
  portfolioTotalDebt,
} from './trackerGoalMetrics'

const portfolio: Portfolio = {
  id: 'p1',
  name: 'Test',
  currency: 'USD',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  assets: [
    {
      id: 'a1',
      name: 'Stock',
      type: 'stock',
      category: 'public',
      symbol: 'TST',
      quantity: 10,
      costBasis: 100,
      currentPrice: 15,
      currency: 'USD',
      tags: [],
    },
    {
      id: 'l1',
      name: 'Mortgage',
      type: 'other',
      category: 'loan',
      quantity: 1,
      costBasis: -200_000,
      currentPrice: -150_000,
      currency: 'USD',
      tags: [],
      loanType: 'mortgage',
      interestRate: 4,
      loanTermMonths: 360,
    },
  ],
}

describe('trackerGoalMetrics', () => {
  it('computes holdings value excluding loans', () => {
    expect(portfolioHoldingsValue(portfolio)).toBe(150)
    expect(portfolioTotalDebt(portfolio)).toBe(150_000)
  })

  it('maps goal sources to current values', () => {
    expect(currentValueForGoalSource('portfolio_balance', 1_000, portfolio)).toBe(150)
    expect(currentValueForGoalSource('debt_loans', null, portfolio)).toBe(150_000)
    expect(currentValueForGoalSource('net_worth', 500, portfolio)).toBe(500)
  })

  it('calculates growth and paydown goal progress', () => {
    expect(goalProgressPercent({ baselineAmount: 0, targetAmount: 100 }, 50)).toBe(50)
    expect(goalProgressPercent({ baselineAmount: 200_000, targetAmount: 100_000 }, 150_000)).toBe(50)
    expect(goalProgressPercent({ baselineAmount: 100, targetAmount: 100 }, 100)).toBeNull()
  })

  it('assigns natural baselines per goal source', () => {
    expect(naturalBaselineForGoalSource('portfolio_balance', 500)).toBe(0)
    expect(naturalBaselineForGoalSource('risk_score', 42)).toBe(100)
    expect(naturalBaselineForGoalSource('net_worth', 1234)).toBe(1234)
  })
})

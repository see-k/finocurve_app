/**
 * Goal baseline / current metric from synced portfolio cache (PortfolioContext).
 * Mirrors src/lib/trackerGoalMetrics semantics without importing riskAnalysis in main.
 */

import type { PortfolioContext } from '../../src/ai/types'

export type GoalProgressSource = 'net_worth' | 'portfolio_balance' | 'debt_loans' | 'risk_score'

export function normalizeGoalProgressSource(raw: string | undefined | null): GoalProgressSource {
  const s = (raw ?? 'net_worth').trim().toLowerCase().replace(/-/g, '_')
  if (s === 'portfolio_balance' || s === 'portfolio' || s === 'holdings') return 'portfolio_balance'
  if (s === 'debt_loans' || s === 'debt' || s === 'loans') return 'debt_loans'
  if (s === 'risk_score' || s === 'risk') return 'risk_score'
  return 'net_worth'
}

function holdingsTotalFromContext(p: PortfolioContext | null): number {
  if (!p) return 0
  const list = p.holdings?.length ? p.holdings : p.topHoldings ?? []
  return list.reduce((s, h) => s + h.value, 0)
}

function debtTotalFromContext(p: PortfolioContext | null): number {
  if (!p?.loans?.length) return 0
  return p.loans.reduce((s, l) => s + (Number.isFinite(l.balance) ? l.balance : 0), 0)
}

/**
 * Live value for the chosen metric (same rules as UI goal progress).
 * Returns null for risk_score when the portfolio was synced without riskScore (stale cache).
 */
export function currentValueForGoalSourceFromContext(
  source: GoalProgressSource,
  latestNetWorth: number | null,
  portfolio: PortfolioContext | null
): number | null {
  switch (source) {
    case 'net_worth':
      return latestNetWorth ?? 0
    case 'portfolio_balance':
      return holdingsTotalFromContext(portfolio)
    case 'debt_loans':
      return debtTotalFromContext(portfolio)
    case 'risk_score':
      if (portfolio?.riskScore === undefined || portfolio.riskScore === null) return null
      return portfolio.riskScore
    default:
      return 0
  }
}

export function naturalBaselineForGoalSource(source: GoalProgressSource, liveCurrentValue: number): number {
  switch (source) {
    case 'portfolio_balance':
      return 0
    case 'risk_score':
      return 100
    default:
      return liveCurrentValue
  }
}

export function goalProgressPercentForSummary(
  goal: { baselineAmount: number; targetAmount: number },
  current: number | null
): number | null {
  const cur = current ?? goal.baselineAmount
  const b = goal.baselineAmount
  const t = goal.targetAmount
  const span = Math.abs(t - b)
  if (span <= 0) return null
  const reducing = b > t
  if (reducing) {
    const moved = b - cur
    return Math.min(100, Math.max(0, (moved / span) * 100))
  }
  const moved = cur - b
  return Math.min(100, Math.max(0, (moved / span) * 100))
}

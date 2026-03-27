import type { Portfolio } from '../types'
import { assetCurrentValue, isLoan, loanBalance } from '../types'
import type { TrackerGoalProgressSource } from '../types'
import { analyzePortfolio } from '../services/riskAnalysis'

/** Investable holdings only (excludes loan liabilities). */
export function portfolioHoldingsValue(portfolio: Portfolio | null): number {
  if (!portfolio?.assets?.length) return 0
  return portfolio.assets.filter((a) => !isLoan(a)).reduce((s, a) => s + assetCurrentValue(a), 0)
}

/** Sum of outstanding loan balances. */
export function portfolioTotalDebt(portfolio: Portfolio | null): number {
  if (!portfolio?.assets?.length) return 0
  return portfolio.assets.filter(isLoan).reduce((s, a) => s + loanBalance(a), 0)
}

/**
 * Same risk score as Dashboard / Risk analysis: non-loan holdings only, 0–100.
 */
export function currentRiskScore(portfolio: Portfolio | null): number {
  if (!portfolio?.assets?.length) return 0
  const nonLoanAssets = portfolio.assets.filter((a) => !isLoan(a))
  const totalInvestableValue = nonLoanAssets.reduce((s, a) => s + assetCurrentValue(a), 0)
  const totalInvestableCost = nonLoanAssets.reduce((s, a) => s + a.costBasis, 0)
  const totalInvestableGainLossPercent =
    totalInvestableCost > 0 ? ((totalInvestableValue - totalInvestableCost) / totalInvestableCost) * 100 : 0
  if (nonLoanAssets.length === 0 || totalInvestableValue <= 0) return 0
  const r = analyzePortfolio(nonLoanAssets, totalInvestableValue, totalInvestableGainLossPercent)
  return r?.riskScore ?? 0
}

export function currentValueForGoalSource(
  source: TrackerGoalProgressSource,
  latestNetWorth: number | null,
  portfolio: Portfolio | null,
  liveRiskScore?: number
): number {
  switch (source) {
    case 'net_worth':
      return latestNetWorth ?? 0
    case 'portfolio_balance':
      return portfolioHoldingsValue(portfolio)
    case 'debt_loans':
      return portfolioTotalDebt(portfolio)
    case 'risk_score':
      return liveRiskScore !== undefined ? liveRiskScore : currentRiskScore(portfolio)
    default:
      return 0
  }
}

/**
 * Progress 0–100. Supports growth goals (target above baseline) and paydown goals (target below baseline, e.g. debt).
 */
export function goalProgressPercent(
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

/**
 * Returns the baseline amount to store for a new (or re-sourced) goal.
 *
 * - net_worth / debt_loans: live current value — progress fills as the metric moves.
 * - portfolio_balance: always 0 — "build from zero to target"; current/target gives
 *   immediate, meaningful progress even when you already exceed the target (100%).
 * - risk_score: always 100 — treat as "starting from max-possible risk and working
 *   toward a lower target"; gives (100−current)/(100−target) immediately.
 */
export function naturalBaselineForGoalSource(
  source: TrackerGoalProgressSource,
  liveCurrentValue: number
): number {
  switch (source) {
    case 'portfolio_balance':
      return 0
    case 'risk_score':
      return 100
    default:
      return liveCurrentValue
  }
}

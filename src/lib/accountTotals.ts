/**
 * Account-level totals, split the way a brokerage statement splits them.
 *
 * The portfolio store's `totalCost` sums every line item, so a mortgage's
 * negative cost basis nets against invested capital and can drive the figure to
 * zero or below — which then suppresses the return percentage while unrealized
 * gain still reads positive. Reporting cost, gain and return over investable
 * holdings only, with liabilities stated separately, keeps the figures
 * internally consistent.
 */
import type { Asset } from '../types'
import { assetCurrentValue, isLoan, loanBalance } from '../types'

export interface AccountTotals {
  holdings: Asset[]
  loans: Asset[]
  /** Market value of investable holdings. Never negative. */
  grossAssets: number
  /** Sum of outstanding balances, stated as a positive number. */
  totalLiabilities: number
  /** Gross assets less liabilities. */
  netWorth: number
  /** Capital deployed into investable holdings. */
  investedCost: number
  /** Gross assets less invested cost. */
  unrealizedGain: number
  /** Unrealized gain as a rate on invested cost. Zero when no cost is on file. */
  totalReturnPercent: number
}

export function deriveAccountTotals(assets: Asset[]): AccountTotals {
  const holdings = assets.filter((asset) => !isLoan(asset))
  const loans = assets.filter(isLoan)

  const grossAssets = holdings.reduce((sum, asset) => sum + assetCurrentValue(asset), 0)
  const totalLiabilities = loans.reduce((sum, loan) => sum + loanBalance(loan), 0)
  const investedCost = holdings.reduce((sum, asset) => sum + asset.costBasis, 0)
  const unrealizedGain = grossAssets - investedCost

  return {
    holdings,
    loans,
    grossAssets,
    totalLiabilities,
    netWorth: grossAssets - totalLiabilities,
    investedCost,
    unrealizedGain,
    totalReturnPercent: investedCost > 0 ? (unrealizedGain / investedCost) * 100 : 0,
  }
}

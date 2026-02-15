/**
 * Comprehensive Risk Analysis Service
 * Ported from the FinoCurve mobile app's risk_analysis_service.dart
 */
import type {
  Asset, AssetType, RiskAnalysisResult, RiskLevel, VolatilityLevel,
  SharpeRating, LiquidityLevel, LiquidityCategory, ScenarioResult, ScenarioSeverity,
  ConcentrationWarning, CorrelationPair, BenchmarkComparison, AssetRiskContribution,
  RebalancingSuggestion, SuggestionPriority,
} from '../types'
import { assetCurrentValue, ASSET_TYPE_LABELS } from '../types'

const RISK_FREE_RATE = 0.05
const SP500_RETURN = 10  // %
const SP500_VOLATILITY = 16  // %
const SP500_SHARPE = 0.5

// ── Asset-type volatility (annualized) ──
const TYPE_VOLATILITY: Record<string, number> = {
  crypto: 80, stock: 25, etf: 18, commodity: 30, real_estate: 12,
  private_equity: 35, bond: 8, cash: 2, other: 20,
}

// ── Asset-type max drawdown % ──
const TYPE_MAX_DRAWDOWN: Record<string, number> = {
  crypto: 80, stock: 50, etf: 40, commodity: 45, real_estate: 30,
  private_equity: 60, bond: 15, cash: 2, other: 35,
}

// ── Risk weights per type (for score & contribution) ──
const TYPE_RISK_WEIGHT: Record<string, number> = {
  crypto: 5.0, stock: 2.5, etf: 2.0, commodity: 3.0, real_estate: 1.5,
  private_equity: 3.5, bond: 1.0, cash: 0.2, other: 2.0,
}

// ── Risk score weights (additive to base 50) ──
const TYPE_SCORE_WEIGHT: Record<string, number> = {
  crypto: 0.8, stock: 0.3, etf: 0.2, commodity: 0.4, real_estate: 0.1,
  private_equity: 0.5, bond: -0.3, cash: -0.5, other: 0.2,
}

// ── Liquidity ──
const TYPE_LIQUIDITY: Record<string, LiquidityCategory> = {
  cash: 'immediate', stock: 'short_term', etf: 'short_term', crypto: 'short_term',
  bond: 'medium_term', commodity: 'medium_term',
  real_estate: 'long_term', private_equity: 'long_term', other: 'long_term',
}
const LIQUIDITY_SCORE: Record<LiquidityCategory, number> = {
  immediate: 100, short_term: 80, medium_term: 50, long_term: 20,
}

// ── Scenario effects per type ──
const SCENARIOS: { name: string; description: string; severity: ScenarioSeverity; effects: Record<string, number> }[] = [
  {
    name: 'Market Crash', description: 'Similar to 2008 financial crisis', severity: 'extreme',
    effects: { stock: -0.50, etf: -0.45, crypto: -0.70, real_estate: -0.30, private_equity: -0.40, commodity: -0.35, bond: 0.05, cash: 0, other: -0.25 },
  },
  {
    name: 'Recession', description: 'Economic downturn lasting 6-18 months', severity: 'severe',
    effects: { stock: -0.25, etf: -0.20, crypto: -0.40, real_estate: -0.15, private_equity: -0.20, commodity: -0.15, bond: 0.03, cash: 0, other: -0.15 },
  },
  {
    name: 'Interest Rate Hike', description: 'Federal Reserve raises rates by 1%', severity: 'moderate',
    effects: { stock: -0.10, etf: -0.08, crypto: -0.15, real_estate: -0.12, private_equity: -0.08, commodity: 0.05, bond: -0.10, cash: 0.02, other: -0.05 },
  },
  {
    name: 'Crypto Winter', description: 'Extended cryptocurrency bear market', severity: 'severe',
    effects: { stock: -0.05, etf: -0.03, crypto: -0.80, real_estate: 0, private_equity: -0.05, commodity: 0, bond: 0, cash: 0, other: -0.05 },
  },
  {
    name: 'Inflation Surge', description: 'Inflation rises to 8-10% annually', severity: 'moderate',
    effects: { stock: -0.08, etf: -0.06, crypto: 0.10, real_estate: 0.05, private_equity: -0.05, commodity: 0.15, bond: -0.12, cash: -0.08, other: 0 },
  },
]

// ── Target allocation for balanced portfolio ──
const TARGET_ALLOCATION: Record<string, number> = {
  stock: 40, etf: 20, bond: 20, real_estate: 10, cash: 5, crypto: 5,
}

// ──────────────────────────────────────
// Main analysis function
// ──────────────────────────────────────
export function analyzePortfolio(assets: Asset[], totalValue: number, totalGainLossPercent: number): RiskAnalysisResult | null {
  if (!assets.length || totalValue === 0) return null

  // 1. Allocation by type (percent)
  const alloc: Record<string, number> = {}
  for (const a of assets) {
    const pct = (assetCurrentValue(a) / totalValue) * 100
    alloc[a.type] = (alloc[a.type] || 0) + pct
  }

  // 2. Risk score
  let riskScore = 50
  for (const [type, pct] of Object.entries(alloc)) {
    riskScore += pct * (TYPE_SCORE_WEIGHT[type] ?? 0)
  }
  const maxAlloc = Math.max(...Object.values(alloc))
  if (maxAlloc > 50) riskScore += (maxAlloc - 50) * 0.3
  const typeCount = Object.keys(alloc).length
  if (typeCount < 3) riskScore += 10
  else if (typeCount >= 5) riskScore -= 5
  riskScore = Math.round(Math.max(0, Math.min(100, riskScore)))

  const riskLevel: RiskLevel = riskScore < 30 ? 'conservative' : riskScore < 50 ? 'moderate' : riskScore < 70 ? 'growth' : 'aggressive'

  // 3. Volatility
  let weightedVol = 0
  for (const a of assets) {
    const w = assetCurrentValue(a) / totalValue
    weightedVol += w * (TYPE_VOLATILITY[a.type] ?? 20)
  }
  const annualizedVolatility = +weightedVol.toFixed(2)
  const volatility = +(annualizedVolatility / Math.sqrt(252)).toFixed(2)
  const volatilityLevel: VolatilityLevel = annualizedVolatility < 10 ? 'low' : annualizedVolatility < 20 ? 'moderate' : annualizedVolatility < 35 ? 'high' : 'very_high'

  // 4. Sharpe ratio
  const portfolioReturn = totalGainLossPercent / 100
  const excessReturn = portfolioReturn - RISK_FREE_RATE
  const sharpeRatio = annualizedVolatility > 0 ? +(excessReturn / (annualizedVolatility / 100)).toFixed(2) : 0
  const sharpeRating: SharpeRating = sharpeRatio < 0 ? 'poor' : sharpeRatio < 0.5 ? 'below_average' : sharpeRatio < 1 ? 'average' : sharpeRatio < 2 ? 'good' : 'excellent'

  // 5. Max drawdown
  let maxDDPct = 0
  for (const a of assets) {
    const w = assetCurrentValue(a) / totalValue
    maxDDPct += w * (TYPE_MAX_DRAWDOWN[a.type] ?? 35)
  }
  const maxDrawdownPercent = +maxDDPct.toFixed(2)
  const maxDrawdown = +(totalValue * maxDDPct / 100).toFixed(2)

  // 6. Concentration warnings
  const concentrationWarnings: ConcentrationWarning[] = []
  for (const [type, pct] of Object.entries(alloc)) {
    const label = ASSET_TYPE_LABELS[type as AssetType] || type
    if (pct > 50) concentrationWarnings.push({ type: 'high', message: `${label} represents ${pct.toFixed(0)}% of your portfolio`, asset: label, percentage: pct })
    else if (pct > 30) concentrationWarnings.push({ type: 'medium', message: `Consider diversifying ${label} (${pct.toFixed(0)}%)`, asset: label, percentage: pct })
  }
  for (const a of assets) {
    const pct = (assetCurrentValue(a) / totalValue) * 100
    if (pct > 25) concentrationWarnings.push({ type: 'high', message: `${a.name} is ${pct.toFixed(0)}% of portfolio`, asset: a.name, percentage: pct })
  }
  if (typeCount < 3) concentrationWarnings.push({ type: 'medium', message: `Low diversification - only ${typeCount} asset types`, asset: 'Portfolio', percentage: 0 })

  // HHI
  let hhi = 0
  for (const pct of Object.values(alloc)) hhi += (pct ** 2)
  const concentrationIndex = +(hhi / 10000).toFixed(4)

  // 7. Liquidity
  const liquidityBreakdown: Record<LiquidityCategory, number> = { immediate: 0, short_term: 0, medium_term: 0, long_term: 0 }
  let liqScore = 0
  for (const a of assets) {
    const pct = (assetCurrentValue(a) / totalValue) * 100
    const cat = TYPE_LIQUIDITY[a.type] || 'long_term'
    liquidityBreakdown[cat] = (liquidityBreakdown[cat] || 0) + pct
    liqScore += pct * LIQUIDITY_SCORE[cat] / 100
  }
  const liquidityScore = +liqScore.toFixed(0)
  const liquidityLevel: LiquidityLevel = liquidityScore >= 80 ? 'high' : liquidityScore >= 60 ? 'moderate' : liquidityScore >= 40 ? 'low' : 'illiquid'

  // 8. Correlations & diversification
  const highCorrelations: CorrelationPair[] = []
  let diversificationScore = 100
  const assetsByType: Record<string, Asset[]> = {}
  for (const a of assets) { (assetsByType[a.type] ??= []).push(a) }
  const corrPairs: [string, string, number][] = [['stock', 'etf', 0.85], ['crypto', 'crypto', 0.75], ['bond', 'cash', 0.60]]
  for (const [t1, t2, corr] of corrPairs) {
    if (assetsByType[t1] && assetsByType[t2]) {
      if (t1 === t2 && assetsByType[t1].length > 1) {
        diversificationScore -= 10
        highCorrelations.push({ asset1: `${ASSET_TYPE_LABELS[t1 as AssetType] || t1} assets`, asset2: 'Same type', correlation: corr })
      } else if (t1 !== t2) {
        diversificationScore -= 5
        highCorrelations.push({ asset1: ASSET_TYPE_LABELS[t1 as AssetType] || t1, asset2: ASSET_TYPE_LABELS[t2 as AssetType] || t2, correlation: corr })
      }
    }
  }
  if (typeCount >= 4) diversificationScore += 15
  diversificationScore = Math.max(0, Math.min(100, diversificationScore))

  // 9. Scenario analysis
  const hasCrypto = !!alloc['crypto']
  const scenarioAnalysis: ScenarioResult[] = SCENARIOS
    .filter(s => s.name !== 'Crypto Winter' || hasCrypto)
    .map(s => {
      let impact = 0
      for (const [type, pct] of Object.entries(alloc)) impact += (pct / 100) * (s.effects[type] ?? 0)
      return {
        name: s.name, description: s.description, severity: s.severity,
        impactPercent: +(impact * 100).toFixed(2),
        impactAmount: +(totalValue * impact).toFixed(2),
      }
    })

  // 10. Risk contribution by type
  const riskContributionByType: Record<string, number> = {}
  let totalRW = 0
  for (const [type, pct] of Object.entries(alloc)) totalRW += pct * (TYPE_RISK_WEIGHT[type] ?? 1)
  for (const [type, pct] of Object.entries(alloc)) {
    riskContributionByType[ASSET_TYPE_LABELS[type as AssetType] || type] = +((pct * (TYPE_RISK_WEIGHT[type] ?? 1)) / totalRW * 100).toFixed(1)
  }

  // 11. Benchmark comparison
  const pReturn = totalGainLossPercent
  const pVol = annualizedVolatility
  const returnDiff = pReturn - SP500_RETURN
  const riskDiff = pVol - SP500_VOLATILITY
  let verdict = 'Performance in line with market expectations'
  if (sharpeRatio > SP500_SHARPE && returnDiff > 0) verdict = 'Outperforming with better risk-adjusted returns'
  else if (sharpeRatio > SP500_SHARPE) verdict = 'Better risk-adjusted returns despite lower absolute returns'
  else if (returnDiff > 0 && riskDiff > 5) verdict = 'Higher returns but with significantly more risk'
  else if (returnDiff < -5) verdict = 'Underperforming the benchmark - consider rebalancing'
  const benchmarkComparison: BenchmarkComparison = {
    benchmarkName: 'S&P 500', benchmarkReturn: SP500_RETURN, benchmarkVolatility: SP500_VOLATILITY, benchmarkSharpe: SP500_SHARPE,
    portfolioReturn: +pReturn.toFixed(2), portfolioVolatility: +pVol.toFixed(2), portfolioSharpe: +sharpeRatio.toFixed(2),
    returnDiff: +returnDiff.toFixed(2), riskDiff: +riskDiff.toFixed(2), verdict,
  }

  // 12. Top risk contributors
  let totalAssetRW = 0
  for (const a of assets) totalAssetRW += (assetCurrentValue(a) / totalValue) * (TYPE_RISK_WEIGHT[a.type] ?? 1)
  const topRiskContributors: AssetRiskContribution[] = assets
    .map(a => {
      const w = assetCurrentValue(a) / totalValue
      const rw = TYPE_RISK_WEIGHT[a.type] ?? 1
      return { assetName: a.name, symbol: a.symbol, type: a.type, portfolioWeight: +(w * 100).toFixed(1), riskContribution: +((w * rw) / totalAssetRW * 100).toFixed(1) }
    })
    .sort((a, b) => b.riskContribution - a.riskContribution)
    .slice(0, 5)

  // 13. Rebalancing suggestions
  const rebalancingSuggestions: RebalancingSuggestion[] = []
  for (const [type, target] of Object.entries(TARGET_ALLOCATION)) {
    const current = alloc[type] ?? 0
    const diff = current - target
    const changeAmount = totalValue * Math.abs(diff) / 100
    const label = ASSET_TYPE_LABELS[type as AssetType] || type
    if (diff > 15) rebalancingSuggestions.push({ action: 'sell', assetType: label, currentPercent: +current.toFixed(1), targetPercent: target, changeAmount, reason: 'Significantly overweight - consider taking profits', priority: 'high' })
    else if (diff > 5) rebalancingSuggestions.push({ action: 'sell', assetType: label, currentPercent: +current.toFixed(1), targetPercent: target, changeAmount, reason: 'Slightly overweight - monitor closely', priority: 'medium' })
    else if (diff < -15) rebalancingSuggestions.push({ action: 'buy', assetType: label, currentPercent: +current.toFixed(1), targetPercent: target, changeAmount, reason: 'Significantly underweight - consider adding exposure', priority: 'high' })
    else if (diff < -5) rebalancingSuggestions.push({ action: 'buy', assetType: label, currentPercent: +current.toFixed(1), targetPercent: target, changeAmount, reason: 'Slightly underweight - opportunity to add', priority: 'low' })
  }
  // Non-target types
  for (const [type, pct] of Object.entries(alloc)) {
    if (!(type in TARGET_ALLOCATION) && pct > 10) {
      rebalancingSuggestions.push({ action: 'review', assetType: ASSET_TYPE_LABELS[type as AssetType] || type, currentPercent: +pct.toFixed(1), targetPercent: 5, changeAmount: totalValue * (pct - 5) / 100, reason: 'Alternative asset - ensure it fits your risk profile', priority: 'medium' })
    }
  }
  rebalancingSuggestions.sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.priority]) - ({ high: 0, medium: 1, low: 2 }[b.priority]))

  return {
    riskScore, riskLevel,
    volatility, annualizedVolatility, volatilityLevel,
    sharpeRatio, sharpeRating,
    maxDrawdown, maxDrawdownPercent,
    concentrationWarnings, concentrationIndex,
    liquidityScore, liquidityLevel, liquidityBreakdown,
    diversificationScore, highCorrelations,
    scenarioAnalysis,
    riskContributionByType,
    benchmarkComparison,
    topRiskContributors,
    rebalancingSuggestions,
  }
}

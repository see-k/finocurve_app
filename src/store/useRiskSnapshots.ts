/**
 * Risk snapshot store for outcome tracking and "what changed since last report".
 * Persists to localStorage for defensible, explainable risk intelligence.
 */
import { useState, useCallback } from 'react'
import type { RiskSnapshot, RiskAnalysisResult, Asset, VolatilityLevel, SharpeRating, LiquidityLevel, LiquidityCategory } from '../types'
import { assetCurrentValue } from '../types'

/** Build a minimal RiskAnalysisResult from a snapshot for historical view (limited data) */
export function snapshotToMinimalRisk(s: RiskSnapshot): RiskAnalysisResult {
  const volLevel: VolatilityLevel = s.annualizedVolatility < 10 ? 'low' : s.annualizedVolatility < 20 ? 'moderate' : s.annualizedVolatility < 30 ? 'high' : 'very_high'
  const sharpeRating: SharpeRating = s.sharpeRatio < 0 ? 'poor' : s.sharpeRatio < 0.3 ? 'below_average' : s.sharpeRatio < 0.7 ? 'average' : s.sharpeRatio < 1.2 ? 'good' : 'excellent'
  const liqLevel: LiquidityLevel = s.liquidityScore >= 70 ? 'high' : s.liquidityScore >= 40 ? 'moderate' : s.liquidityScore >= 20 ? 'low' : 'illiquid'
  const liqBreakdown: Record<LiquidityCategory, number> = { immediate: 0, short_term: 0, medium_term: 0, long_term: 0 }
  const maxDrawdown = (s.portfolioValue * s.maxDrawdownPercent) / 100
  return {
    riskScore: s.riskScore,
    riskLevel: s.riskLevel,
    volatility: s.annualizedVolatility,
    annualizedVolatility: s.annualizedVolatility,
    volatilityLevel: volLevel,
    sharpeRatio: s.sharpeRatio,
    sharpeRating,
    maxDrawdown,
    maxDrawdownPercent: s.maxDrawdownPercent,
    concentrationWarnings: [],
    concentrationIndex: 0,
    liquidityScore: s.liquidityScore,
    liquidityLevel: liqLevel,
    liquidityBreakdown: liqBreakdown,
    diversificationScore: s.diversificationScore,
    highCorrelations: [],
    scenarioAnalysis: [],
    riskContributionByType: s.allocationByType,
    benchmarkComparison: {
      benchmarkName: 'S&P 500',
      benchmarkReturn: 10,
      benchmarkVolatility: 16,
      benchmarkSharpe: 0.5,
      portfolioReturn: 0,
      portfolioVolatility: s.annualizedVolatility,
      portfolioSharpe: s.sharpeRatio,
      returnDiff: 0,
      riskDiff: 0,
      verdict: 'Historical snapshot — full benchmark comparison not available.',
    },
    topRiskContributors: [],
    rebalancingSuggestions: [],
    changeSummary: [],
  }
}

const STORAGE_KEY = 'finocurve-risk-snapshots'
const MAX_SNAPSHOTS = 20

function loadSnapshots(): RiskSnapshot[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as RiskSnapshot[]
      return Array.isArray(parsed) ? parsed : []
    }
  } catch { /* ignore */ }
  return []
}

function saveSnapshots(snapshots: RiskSnapshot[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshots))
  } catch { /* ignore */ }
}

function riskToSnapshot(risk: RiskAnalysisResult, assets: Asset[], totalValue: number): RiskSnapshot {
  const alloc: Record<string, number> = {}
  for (const a of assets) {
    const pct = (assetCurrentValue(a) / totalValue) * 100
    alloc[a.type] = (alloc[a.type] || 0) + pct
  }
  return {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    portfolioValue: totalValue,
    assetCount: assets.length,
    riskScore: risk.riskScore,
    riskLevel: risk.riskLevel,
    sharpeRatio: risk.sharpeRatio,
    annualizedVolatility: risk.annualizedVolatility,
    maxDrawdownPercent: risk.maxDrawdownPercent,
    diversificationScore: risk.diversificationScore,
    liquidityScore: risk.liquidityScore,
    allocationByType: alloc,
  }
}

/** Compare current risk to previous snapshot and return human-readable changes */
export function computeChangeSummary(
  current: RiskAnalysisResult,
  assets: Asset[],
  totalValue: number,
  previous: RiskSnapshot | null
): string[] {
  if (!previous) return []
  const changes: string[] = []
  const alloc: Record<string, number> = {}
  for (const a of assets) {
    const pct = (assetCurrentValue(a) / totalValue) * 100
    alloc[a.type] = (alloc[a.type] || 0) + pct
  }

  if (current.riskScore !== previous.riskScore) {
    const diff = current.riskScore - previous.riskScore
    changes.push(`Risk score ${diff > 0 ? 'increased' : 'decreased'} by ${Math.abs(diff)} points (${previous.riskScore} → ${current.riskScore})`)
  }
  if (Math.abs(current.sharpeRatio - previous.sharpeRatio) > 0.05) {
    changes.push(`Sharpe ratio changed from ${previous.sharpeRatio.toFixed(2)} to ${current.sharpeRatio.toFixed(2)}`)
  }
  if (Math.abs(current.annualizedVolatility - previous.annualizedVolatility) > 1) {
    changes.push(`Volatility ${current.annualizedVolatility > previous.annualizedVolatility ? 'increased' : 'decreased'} (${previous.annualizedVolatility}% → ${current.annualizedVolatility}%)`)
  }
  if (current.riskLevel !== previous.riskLevel) {
    changes.push(`Risk level shifted from ${previous.riskLevel} to ${current.riskLevel}`)
  }
  if (assets.length !== previous.assetCount) {
    changes.push(`Portfolio now has ${assets.length} assets (was ${previous.assetCount})`)
  }
  if (Math.abs(totalValue - previous.portfolioValue) / Math.max(previous.portfolioValue, 1) > 0.05) {
    const pctChange = ((totalValue - previous.portfolioValue) / previous.portfolioValue * 100).toFixed(1)
    changes.push(`Portfolio value ${Number(pctChange) >= 0 ? '+' : ''}${pctChange}% since last report`)
  }
  for (const [type, pct] of Object.entries(alloc)) {
    const prevPct = previous.allocationByType[type] ?? 0
    if (Math.abs(pct - prevPct) > 5) {
      changes.push(`${type} allocation changed from ${prevPct.toFixed(1)}% to ${pct.toFixed(1)}%`)
    }
  }
  return changes
}

export function useRiskSnapshots() {
  const [snapshots, setSnapshots] = useState<RiskSnapshot[]>(() => loadSnapshots())

  const addSnapshot = useCallback((risk: RiskAnalysisResult, assets: Asset[], totalValue: number) => {
    const next = riskToSnapshot(risk, assets, totalValue)
    setSnapshots((prev) => {
      const updated = [next, ...prev].slice(0, MAX_SNAPSHOTS)
      saveSnapshots(updated)
      return updated
    })
    return next
  }, [])

  const lastSnapshot = snapshots[0] ?? null
  const clearSnapshots = useCallback(() => {
    setSnapshots([])
    saveSnapshots([])
  }, [])

  return { snapshots, lastSnapshot, addSnapshot, clearSnapshots }
}

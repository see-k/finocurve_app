import type {
  Asset,
  FinancialSourceKind,
  FinancialValueProvenance,
  FinancialValuationMethod,
  Portfolio,
} from '../types'
import type { FinancialAuditContext } from '../ai/types'

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

export interface ProvenanceInput {
  sourceKind: FinancialSourceKind
  sourceName: string
  valuationMethod: FinancialValuationMethod
  asOf?: string
  recordedAt?: string
  isEstimated?: boolean
}

export type FinancialFreshnessStatus = 'current' | 'aging' | 'stale' | 'historical' | 'unknown'

export interface FinancialFreshness {
  status: FinancialFreshnessStatus
  label: string
  ageMs: number | null
}

export const VALUATION_METHOD_LABELS: Record<FinancialValuationMethod, string> = {
  market_price: 'Market price',
  manual_mark: 'Manual valuation',
  quantity_times_price: 'Quantity × price',
  acquisition_cost: 'Acquisition cost',
  original_principal: 'Original principal',
  outstanding_balance: 'Outstanding balance',
  portfolio_sum: 'Sum of holdings',
  historical_close: 'Historical close',
  amortization: 'Amortization model',
  user_reported: 'User-reported',
  risk_model: 'FinoCurve risk model',
  illustrative_simulation: 'Illustrative simulation',
  legacy_record: 'Legacy stored value',
}

function validIso(value: string | undefined, fallback: string): string {
  if (!value || !Number.isFinite(Date.parse(value))) return fallback
  return new Date(value).toISOString()
}

export function createFinancialProvenance(input: ProvenanceInput, now = new Date().toISOString()): FinancialValueProvenance {
  const recordedAt = validIso(input.recordedAt, validIso(now, new Date().toISOString()))
  return {
    sourceKind: input.sourceKind,
    sourceName: input.sourceName.trim() || 'Unknown source',
    asOf: validIso(input.asOf, recordedAt),
    recordedAt,
    valuationMethod: input.valuationMethod,
    ...(input.isEstimated ? { isEstimated: true } : {}),
  }
}

function legacyCurrentPrice(asset: Asset, portfolio: Portfolio): FinancialValueProvenance {
  const asOf = portfolio.updatedAt || portfolio.createdAt
  if (asset.category === 'loan') {
    return createFinancialProvenance({
      sourceKind: 'imported',
      sourceName: 'Legacy portfolio record',
      valuationMethod: 'outstanding_balance',
      asOf,
      recordedAt: asOf,
      isEstimated: true,
    })
  }
  return createFinancialProvenance({
    sourceKind: 'imported',
    sourceName: 'Legacy portfolio record',
    valuationMethod: asset.category === 'manual' ? 'manual_mark' : 'legacy_record',
    asOf,
    recordedAt: asOf,
    isEstimated: true,
  })
}

function legacyCostBasis(asset: Asset, portfolio: Portfolio): FinancialValueProvenance {
  const recordedAt = portfolio.updatedAt || portfolio.createdAt
  return createFinancialProvenance({
    sourceKind: 'imported',
    sourceName: 'Legacy portfolio record',
    valuationMethod: asset.category === 'loan' ? 'original_principal' : 'acquisition_cost',
    asOf: asset.purchaseDate || asset.loanStartDate || portfolio.createdAt || recordedAt,
    recordedAt,
  })
}

/**
 * Adds missing audit metadata without changing a single financial value or business timestamp.
 * Existing provenance is preserved field-for-field.
 */
export function normalizePortfolioFinancialProvenance(portfolio: Portfolio): Portfolio {
  const assets = (portfolio.assets ?? []).map((asset) => {
    const existing = asset.financialProvenance
    const currentPrice = existing?.currentPrice ?? legacyCurrentPrice(asset, portfolio)
    const costBasis = existing?.costBasis ?? legacyCostBasis(asset, portfolio)
    const loanTerms = existing?.loanTerms ?? (asset.category === 'loan'
      ? createFinancialProvenance({
          sourceKind: 'imported',
          sourceName: 'Legacy portfolio record',
          valuationMethod: 'legacy_record',
          asOf: asset.loanStartDate || portfolio.updatedAt || portfolio.createdAt,
          recordedAt: portfolio.updatedAt || portfolio.createdAt,
          isEstimated: true,
        })
      : undefined)
    return {
      ...asset,
      financialProvenance: { currentPrice, costBasis, ...(loanTerms ? { loanTerms } : {}) },
    }
  })
  return { ...portfolio, assets, financialProvenanceVersion: 1 }
}

export function userEnteredAssetProvenance(asset: Asset, now = new Date().toISOString()) {
  const currentPrice = createFinancialProvenance({
    sourceKind: 'manual',
    sourceName: asset.category === 'loan' ? 'User-entered loan balance' : 'User-entered valuation',
    valuationMethod: asset.category === 'loan' ? 'outstanding_balance' : 'manual_mark',
    asOf: now,
    recordedAt: now,
  }, now)
  const costBasis = createFinancialProvenance({
    sourceKind: 'manual',
    sourceName: asset.category === 'loan' ? 'User-entered original principal' : 'User-entered cost basis',
    valuationMethod: asset.category === 'loan' ? 'original_principal' : 'acquisition_cost',
    asOf: asset.purchaseDate || asset.loanStartDate || now,
    recordedAt: now,
  }, now)
  const loanTerms = asset.category === 'loan'
    ? createFinancialProvenance({
        sourceKind: 'manual',
        sourceName: 'User-entered loan terms',
        valuationMethod: 'amortization',
        asOf: now,
        recordedAt: now,
      }, now)
    : undefined
  return { currentPrice, costBasis, ...(loanTerms ? { loanTerms } : {}) }
}

export function demoAssetProvenance(asset: Asset, now = new Date().toISOString()) {
  const currentPrice = createFinancialProvenance({
    sourceKind: 'demo',
    sourceName: 'FinoCurve demo dataset',
    valuationMethod: asset.category === 'loan' ? 'outstanding_balance' : asset.category === 'manual' ? 'manual_mark' : 'legacy_record',
    asOf: now,
    recordedAt: now,
    isEstimated: true,
  }, now)
  const costBasis = createFinancialProvenance({
    sourceKind: 'demo',
    sourceName: 'FinoCurve demo dataset',
    valuationMethod: asset.category === 'loan' ? 'original_principal' : 'acquisition_cost',
    asOf: asset.purchaseDate || asset.loanStartDate || now,
    recordedAt: now,
    isEstimated: true,
  }, now)
  const loanTerms = asset.category === 'loan'
    ? createFinancialProvenance({
        sourceKind: 'demo', sourceName: 'FinoCurve demo dataset', valuationMethod: 'amortization',
        asOf: now, recordedAt: now, isEstimated: true,
      }, now)
    : undefined
  return { currentPrice, costBasis, ...(loanTerms ? { loanTerms } : {}) }
}

export function getAssetCurrentPriceProvenance(asset: Asset, fallbackAsOf = new Date().toISOString()): FinancialValueProvenance {
  return asset.financialProvenance?.currentPrice ?? createFinancialProvenance({
    sourceKind: 'imported', sourceName: 'Legacy portfolio record', valuationMethod: 'legacy_record',
    asOf: fallbackAsOf, recordedAt: fallbackAsOf, isEstimated: true,
  }, fallbackAsOf)
}

export function getAssetCostBasisProvenance(asset: Asset, fallbackAsOf = new Date().toISOString()): FinancialValueProvenance {
  return asset.financialProvenance?.costBasis ?? createFinancialProvenance({
    sourceKind: 'imported', sourceName: 'Legacy portfolio record', valuationMethod: 'acquisition_cost',
    asOf: asset.purchaseDate || asset.loanStartDate || fallbackAsOf, recordedAt: fallbackAsOf,
  }, fallbackAsOf)
}

export function deriveAssetValueProvenance(asset: Asset): FinancialValueProvenance {
  const input = getAssetCurrentPriceProvenance(asset)
  return createFinancialProvenance({
    sourceKind: 'calculated',
    sourceName: input.sourceName,
    valuationMethod: asset.category === 'loan' ? 'outstanding_balance' : 'quantity_times_price',
    asOf: input.asOf,
    recordedAt: input.recordedAt,
    isEstimated: input.isEstimated,
  }, input.recordedAt)
}

export function aggregateAssetValueProvenance(assets: Asset[], now = new Date().toISOString()): FinancialValueProvenance {
  if (assets.length === 0) {
    return createFinancialProvenance({
      sourceKind: 'calculated', sourceName: 'No holdings', valuationMethod: 'portfolio_sum',
      asOf: now, recordedAt: now,
    }, now)
  }
  const inputs = assets.map(deriveAssetValueProvenance)
  const sourceNames = [...new Set(inputs.map((item) => item.sourceName))]
  const validTimes = inputs.map((item) => Date.parse(item.asOf)).filter(Number.isFinite)
  const oldestAsOf = validTimes.length > 0 ? new Date(Math.min(...validTimes)).toISOString() : now
  return createFinancialProvenance({
    sourceKind: 'calculated',
    sourceName: sourceNames.length === 1 ? sourceNames[0] : `Mixed sources (${sourceNames.length})`,
    valuationMethod: 'portfolio_sum',
    asOf: oldestAsOf,
    recordedAt: now,
    isEstimated: inputs.some((item) => item.isEstimated),
  }, now)
}

export function deriveCalculatedProvenance(
  base: FinancialValueProvenance,
  sourceName: string,
  valuationMethod: FinancialValuationMethod,
  now = new Date().toISOString()
): FinancialValueProvenance {
  return createFinancialProvenance({
    sourceKind: 'calculated', sourceName, valuationMethod,
    asOf: base.asOf, recordedAt: now, isEstimated: base.isEstimated,
  }, now)
}

export function getFinancialFreshness(
  provenance: FinancialValueProvenance,
  now: string | Date | number = Date.now()
): FinancialFreshness {
  if (['acquisition_cost', 'original_principal', 'historical_close'].includes(provenance.valuationMethod)) {
    return { status: 'historical', label: 'Historical', ageMs: null }
  }
  const asOf = Date.parse(provenance.asOf)
  const nowMs = now instanceof Date ? now.getTime() : typeof now === 'number' ? now : Date.parse(now)
  if (!Number.isFinite(asOf) || !Number.isFinite(nowMs)) return { status: 'unknown', label: 'Freshness unknown', ageMs: null }
  const ageMs = Math.max(0, nowMs - asOf)
  const marketLike = provenance.sourceKind === 'market'
  const currentLimit = marketLike ? 20 * MINUTE : 30 * DAY
  const agingLimit = marketLike ? DAY : 90 * DAY
  if (ageMs <= currentLimit) return { status: 'current', label: 'Current', ageMs }
  if (ageMs <= agingLimit) return { status: 'aging', label: 'Aging', ageMs }
  return { status: 'stale', label: 'Stale', ageMs }
}

export function formatProvenanceAsOf(value: string): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'Unknown time'
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium', timeStyle: 'short',
  }).format(date)
}

export function toFinancialAuditContext(provenance: FinancialValueProvenance): FinancialAuditContext {
  const freshness = getFinancialFreshness(provenance)
  return {
    source: provenance.sourceName,
    asOf: provenance.asOf,
    valuationMethod: VALUATION_METHOD_LABELS[provenance.valuationMethod] ?? provenance.valuationMethod,
    freshness: freshness.label,
    ...(provenance.isEstimated ? { estimated: true } : {}),
  }
}

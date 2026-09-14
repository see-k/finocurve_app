/**
 * Shapes Finocurve Service balances into the institution × exposure matrix the
 * enterprise dashboard plots and tabulates.
 *
 * Providers report balances in their own vocabulary — a bank sends `balance`, a
 * broker sends `equity` and `cash_balance`, an exchange sends asset quantities
 * with no USD at all. This module maps each provider's rows onto four common
 * exposure buckets, then forces the buckets to reconcile to the product's own
 * `total_usd` by pushing any residual into `other`.
 *
 * That reconciliation is the point: the landscape and the table are summations
 * of the same figure the service reports as the headline total, so the chart can
 * never disagree with the number above it.
 */
import type { EnterpriseBalanceProduct, EnterpriseBalances } from '../services/enterprise'

export type ExposureKind = 'cash' | 'securities' | 'crypto' | 'other'

export const EXPOSURE_ORDER: ExposureKind[] = ['cash', 'securities', 'crypto', 'other']

export const EXPOSURE_LABELS: Record<ExposureKind, string> = {
  cash: 'Cash',
  securities: 'Securities',
  crypto: 'Digital assets',
  other: 'Other',
}

/**
 * Fixed categorical assignment. Slots 1–3 of the shared palette validate
 * all-pairs in both modes; `other` takes the reserved neutral rather than a
 * fourth hue.
 */
export const EXPOSURE_COLORS: Record<ExposureKind, string> = {
  cash: 'var(--fin-cat-1)',
  securities: 'var(--fin-cat-2)',
  crypto: 'var(--fin-cat-3)',
  other: 'var(--fin-cat-other)',
}

export interface CustodyRow {
  /** Stable key — the provider id. */
  key: string
  /** Institution name where the provider reports one, else the product label. */
  label: string
  product: string
  /** Account rows the provider returned. */
  accountCount: number
  /** USD by exposure bucket. Sums to `total`. */
  exposures: Record<ExposureKind, number>
  /** The provider's own reported total, which the buckets reconcile to. */
  total: number
  /** Share of consolidated assets under administration. */
  weight: number
  /** True when the provider returned an error for this product. */
  failed: boolean
  /** True when the service excludes this product from the aggregate. */
  excluded: boolean
}

export interface CustodyMatrix {
  rows: CustodyRow[]
  exposures: ExposureKind[]
  /** Consolidated total across included products. */
  total: number
  /** Column totals by exposure bucket. */
  exposureTotals: Record<ExposureKind, number>
  /** Largest single institution × exposure cell, for scaling the landscape. */
  peakCell: number
  accountCount: number
  /** Distinct digital assets reported across providers. */
  cryptoAssetCount: number
}

/** Providers whose balances are digital-asset custody rather than fiat. */
const CRYPTO_PRODUCTS = new Set(['coinbase', 'binance_us'])

const PRODUCT_LABELS: Record<string, string> = {
  simplefin: 'SimpleFIN',
  teller: 'Teller',
  schwab: 'Charles Schwab',
  coinbase: 'Coinbase',
  alpaca: 'Alpaca',
  binance_us: 'Binance US',
  kalshi: 'Kalshi',
}

function numeric(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function emptyExposures(): Record<ExposureKind, number> {
  return { cash: 0, securities: 0, crypto: 0, other: 0 }
}

/**
 * Maps one provider's account rows onto exposure buckets, in that provider's
 * own field vocabulary. Returns raw sums; reconciliation happens in the caller.
 */
function readExposures(product: EnterpriseBalanceProduct): Record<ExposureKind, number> {
  const exposures = emptyExposures()
  const rows = product.balances ?? []

  if (CRYPTO_PRODUCTS.has(product.product)) {
    // Exchanges report asset quantities, not USD, so per-row sums are
    // meaningless here. The product total carries the valuation.
    exposures.crypto = numeric(product.total_usd)
    return exposures
  }

  for (const row of rows) {
    switch (product.product) {
      case 'schwab':
        exposures.securities += numeric(row.equity)
        exposures.cash += numeric(row.cash_balance)
        break
      case 'alpaca': {
        const cash = numeric(row.cash)
        exposures.cash += cash
        // Portfolio value is inclusive of cash; the remainder is held securities.
        exposures.securities += Math.max(0, numeric(row.portfolio_value) - cash)
        break
      }
      case 'kalshi': {
        const cash = numeric(row.balance)
        exposures.cash += cash
        exposures.securities += Math.max(0, numeric(row.portfolio_value) - cash)
        break
      }
      case 'simplefin':
      case 'teller':
        exposures.cash += numeric(row.balance)
        break
      default:
        exposures.other += numeric(row.balance ?? row.total ?? row.equity ?? row.portfolio_value)
        break
    }
  }

  return exposures
}

/**
 * Builds the institution × exposure matrix from a balances payload.
 *
 * Products the service flags as excluded from totals, and products that errored,
 * are kept as rows (so a failure is visible rather than silently dropped) but
 * contribute nothing to the consolidated total.
 */
export function deriveCustodyMatrix(balances: EnterpriseBalances | null): CustodyMatrix {
  const products = balances?.by_product ?? []
  const exposureTotals = emptyExposures()

  const rows: CustodyRow[] = products.map((product) => {
    const failed = product.error != null
    const excluded = product.exclude_from_totals === true
    const reported = numeric(product.total_usd)
    const counted = failed || excluded ? 0 : reported

    const raw = readExposures(product)
    const exposures = emptyExposures()

    if (counted > 0) {
      const mapped = raw.cash + raw.securities + raw.crypto + raw.other
      if (mapped <= 0) {
        exposures.other = counted
      } else if (mapped > counted) {
        // Mapped rows overstate the headline total — scale them down so the
        // chart cannot exceed the figure the service reported.
        const scale = counted / mapped
        exposures.cash = raw.cash * scale
        exposures.securities = raw.securities * scale
        exposures.crypto = raw.crypto * scale
        exposures.other = raw.other * scale
      } else {
        // Preserve known buckets and park any unmapped remainder in `other`.
        exposures.cash = raw.cash
        exposures.securities = raw.securities
        exposures.crypto = raw.crypto
        exposures.other = raw.other + (counted - mapped)
      }
    }

    for (const kind of EXPOSURE_ORDER) exposureTotals[kind] += exposures[kind]

    return {
      key: product.product,
      label: product.institution_name || PRODUCT_LABELS[product.product] || product.product,
      product: product.product,
      accountCount: (product.balances ?? []).length,
      exposures,
      total: counted,
      weight: 0,
      failed,
      excluded,
    }
  })

  const total = rows.reduce((sum, row) => sum + row.total, 0)
  for (const row of rows) {
    row.weight = total > 0 ? (row.total / total) * 100 : 0
  }

  rows.sort((a, b) => b.total - a.total)

  const peakCell = rows.reduce(
    (peak, row) => Math.max(peak, ...EXPOSURE_ORDER.map((kind) => row.exposures[kind])),
    0
  )

  return {
    rows,
    exposures: EXPOSURE_ORDER,
    total,
    exposureTotals,
    peakCell,
    accountCount: rows.reduce((sum, row) => sum + row.accountCount, 0),
    cryptoAssetCount: new Set((balances?.aggregate.crypto ?? []).map((entry) => entry.asset)).size,
  }
}

/**
 * Normalises broker position feeds proxied by Finocurve Service into one row
 * shape the dashboard can rank and total.
 *
 * The service forwards each broker's own API response unchanged, so each
 * reader below follows that broker's published schema. Every field is read
 * defensively: a missing or malformed value drops to null rather than
 * inventing a zero that would read as a real figure.
 */

export type PositionVenue = 'alpaca' | 'kalshi' | 'polymarket_us' | 'schwab'

export type PositionClass = 'equity' | 'fund' | 'option' | 'crypto' | 'fixed_income' | 'event_contract' | 'cash' | 'other'

export interface EnterprisePosition {
  key: string
  venue: PositionVenue
  symbol: string
  name: string
  assetClass: PositionClass
  /** Signed: negative for short (or Kalshi "No") positions. */
  quantity: number
  /** USD. When `valuedAtCost` is set, this is cost rather than a mark. */
  marketValue: number
  costBasis: number | null
  unrealizedPl: number | null
  /** Percent, e.g. 6.8 for +6.8%. */
  unrealizedPlPercent: number | null
  /** True when the venue reports no mark, so `marketValue` is cost. */
  valuedAtCost: boolean
}

/** Dashboard request paths per venue. Each must be on the Electron allowlist. */
export const POSITION_PATHS: Record<PositionVenue, string> = {
  alpaca: '/api/alpaca/v2/positions',
  kalshi: '/api/kalshi/portfolio/positions',
  polymarket_us: '/api/polymarket-us/portfolio/positions',
  schwab: '/api/schwab/accounts?fields=positions',
}

export const POSITION_CLASS_LABELS: Record<PositionClass, string> = {
  equity: 'Equities',
  fund: 'Funds',
  option: 'Options',
  crypto: 'Crypto',
  fixed_income: 'Fixed income',
  event_contract: 'Event contracts',
  cash: 'Cash equivalents',
  other: 'Other',
}

type Row = Record<string, unknown>

function num(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function str(value: unknown): string {
  return value == null ? '' : String(value)
}

function isRow(value: unknown): value is Row {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Accept a bare array, or one wrapped under a common envelope key. */
function listFrom(data: unknown, ...keys: string[]): Row[] {
  if (Array.isArray(data)) return data.filter(isRow)
  if (!isRow(data)) return []
  for (const key of [...keys, 'data', 'results']) {
    const inner = data[key]
    if (Array.isArray(inner)) return inner.filter(isRow)
  }
  return []
}

function percentOf(pl: number | null, cost: number | null): number | null {
  if (pl == null || cost == null || cost === 0) return null
  return (pl / Math.abs(cost)) * 100
}

/* ── Alpaca: GET /v2/positions ─────────────────────────────────────────── */

function alpacaClass(assetClass: string): PositionClass {
  if (assetClass === 'crypto') return 'crypto'
  if (assetClass === 'us_option') return 'option'
  if (assetClass === 'us_equity') return 'equity'
  return 'other'
}

export function readAlpacaPositions(data: unknown): EnterprisePosition[] {
  return listFrom(data, 'positions').flatMap((row) => {
    const symbol = str(row.symbol)
    const marketValue = num(row.market_value)
    if (!symbol || marketValue == null) return []
    const qty = num(row.qty) ?? 0
    const side = str(row.side)
    const costBasis = num(row.cost_basis)
    const unrealizedPl = num(row.unrealized_pl)
    const plpc = num(row.unrealized_plpc)
    return [{
      key: `alpaca:${str(row.asset_id) || symbol}`,
      venue: 'alpaca' as const,
      symbol,
      name: symbol,
      assetClass: alpacaClass(str(row.asset_class)),
      quantity: side === 'short' && qty > 0 ? -qty : qty,
      marketValue,
      costBasis,
      unrealizedPl,
      // Alpaca reports the rate as a fraction.
      unrealizedPlPercent: plpc != null ? plpc * 100 : percentOf(unrealizedPl, costBasis),
      valuedAtCost: false,
    }]
  })
}

/* ── Kalshi: GET /portfolio/positions ──────────────────────────────────── */

export function readKalshiPositions(data: unknown): EnterprisePosition[] {
  return listFrom(data, 'market_positions').flatMap((row) => {
    const ticker = str(row.ticker)
    const position = num(row.position_fp) ?? num(row.position) ?? 0
    if (!ticker || position === 0) return []
    // Newer responses carry dollar strings; older ones integer cents.
    const exposure = num(row.market_exposure_dollars)
      ?? (num(row.market_exposure) != null ? (num(row.market_exposure) as number) / 100 : null)
    if (exposure == null) return []
    return [{
      key: `kalshi:${ticker}`,
      venue: 'kalshi' as const,
      symbol: ticker,
      name: position > 0 ? 'Yes contracts' : 'No contracts',
      assetClass: 'event_contract' as const,
      quantity: position,
      marketValue: Math.abs(exposure),
      costBasis: Math.abs(exposure),
      unrealizedPl: null,
      unrealizedPlPercent: null,
      valuedAtCost: true,
    }]
  })
}

/* ── Polymarket US: GET /v1/portfolio/positions ────────────────────────── */
/*
 * The proxy returns the upstream body unchanged: `positions` is a map of
 * market slug to position. Amounts are `{ value, currency }` decimal dollars.
 * `cost` is cost basis; `cashValue` is unrealized P/L, so current value is
 * their sum. A missing mark falls back to cost.
 */

function amountValue(value: unknown): number | null {
  if (isRow(value) && 'value' in value) return num(value.value)
  return num(value)
}

function polymarketRows(data: unknown): Array<[string, Row]> {
  if (!isRow(data)) return []
  const positions = data.positions
  if (Array.isArray(positions)) {
    return positions.filter(isRow).map((row, index) => {
      const meta = isRow(row.marketMetadata) ? row.marketMetadata : {}
      return [str(meta.slug) || str(row.slug) || String(index), row] as [string, Row]
    })
  }
  if (!isRow(positions)) return []
  return Object.entries(positions).flatMap(([slug, row]) => (isRow(row) ? [[slug, row] as [string, Row]] : []))
}

export function readPolymarketUsPositions(data: unknown): EnterprisePosition[] {
  return polymarketRows(data).flatMap(([slug, row]) => {
    const quantity = num(row.netPositionDecimal) ?? num(row.netPosition) ?? 0
    if (!slug || quantity === 0) return []
    const meta = isRow(row.marketMetadata) ? row.marketMetadata : {}
    const title = str(meta.title)
    const outcome = str(meta.outcome)
    const costBasis = amountValue(row.cost)
    const unrealized = amountValue(row.cashValue)
    const marked = costBasis != null && unrealized != null
    const marketValue = marked ? costBasis + unrealized : costBasis != null ? Math.abs(costBasis) : null
    if (marketValue == null) return []
    return [{
      key: `polymarket_us:${slug}`,
      venue: 'polymarket_us' as const,
      symbol: title || slug,
      name: outcome || title || slug,
      assetClass: 'event_contract' as const,
      quantity,
      marketValue,
      costBasis,
      unrealizedPl: marked ? unrealized : null,
      unrealizedPlPercent: marked ? percentOf(unrealized, costBasis) : null,
      valuedAtCost: !marked,
    }]
  })
}

/* ── Schwab: GET /trader/v1/accounts?fields=positions ──────────────────── */

function schwabClass(assetType: string): PositionClass {
  switch (assetType) {
    case 'EQUITY': return 'equity'
    case 'COLLECTIVE_INVESTMENT':
    case 'MUTUAL_FUND': return 'fund'
    case 'OPTION': return 'option'
    case 'FIXED_INCOME': return 'fixed_income'
    case 'CASH_EQUIVALENT': return 'cash'
    default: return 'other'
  }
}

export function readSchwabPositions(data: unknown): EnterprisePosition[] {
  return listFrom(data, 'accounts').flatMap((account) => {
    const securities = isRow(account.securitiesAccount) ? account.securitiesAccount : account
    const accountKey = str(securities.hashValue ?? securities.accountNumber).slice(-4)
    const positions = Array.isArray(securities.positions) ? securities.positions.filter(isRow) : []
    return positions.flatMap((row) => {
      const instrument = isRow(row.instrument) ? row.instrument : {}
      const symbol = str(instrument.symbol)
      const marketValue = num(row.marketValue)
      if (!symbol || marketValue == null) return []
      const long = num(row.longQuantity) ?? 0
      const short = num(row.shortQuantity) ?? 0
      const quantity = long - short
      const openPl = num(row.longOpenProfitLoss) ?? num(row.shortOpenProfitLoss)
      const average = num(row.averagePrice)
      const costBasis = openPl != null
        ? marketValue - openPl
        : average != null ? average * Math.abs(quantity) : null
      const unrealizedPl = openPl ?? (costBasis != null ? marketValue - costBasis : null)
      return [{
        key: `schwab:${accountKey}:${str(instrument.cusip) || symbol}`,
        venue: 'schwab' as const,
        symbol,
        name: str(instrument.description) || symbol,
        assetClass: schwabClass(str(instrument.assetType)),
        quantity,
        marketValue,
        costBasis,
        unrealizedPl,
        unrealizedPlPercent: percentOf(unrealizedPl, costBasis),
        valuedAtCost: false,
      }]
    })
  })
}

export const POSITION_READERS: Record<PositionVenue, (data: unknown) => EnterprisePosition[]> = {
  alpaca: readAlpacaPositions,
  kalshi: readKalshiPositions,
  polymarket_us: readPolymarketUsPositions,
  schwab: readSchwabPositions,
}

export interface PositionTotals {
  /** Net: short positions subtract. */
  marketValue: number
  /** Sum of absolute market values; the denominator for weights. */
  grossValue: number
  /** Cost and P/L over positions that report both; marked-at-cost rows excluded. */
  costBasis: number
  unrealizedPl: number
  unrealizedPlPercent: number | null
  /** Positions contributing to the P/L figures. */
  measured: number
}

export function totalPositions(positions: EnterprisePosition[]): PositionTotals {
  let marketValue = 0
  let grossValue = 0
  let costBasis = 0
  let unrealizedPl = 0
  let measured = 0
  for (const position of positions) {
    marketValue += position.marketValue
    grossValue += Math.abs(position.marketValue)
    if (position.valuedAtCost || position.costBasis == null || position.unrealizedPl == null) continue
    costBasis += Math.abs(position.costBasis)
    unrealizedPl += position.unrealizedPl
    measured += 1
  }
  return {
    marketValue,
    grossValue,
    costBasis,
    unrealizedPl,
    unrealizedPlPercent: measured > 0 && costBasis !== 0 ? (unrealizedPl / costBasis) * 100 : null,
    measured,
  }
}

/** Market value by asset class, largest first. */
export function allocateByClass(positions: EnterprisePosition[]): Array<{ name: string; value: number }> {
  const groups = new Map<PositionClass, number>()
  for (const position of positions) {
    groups.set(position.assetClass, (groups.get(position.assetClass) ?? 0) + Math.abs(position.marketValue))
  }
  return Array.from(groups, ([kind, value]) => ({ name: POSITION_CLASS_LABELS[kind], value }))
    .sort((a, b) => b.value - a.value)
}

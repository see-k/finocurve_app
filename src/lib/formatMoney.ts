/**
 * Number formatting for account-facing screens.
 *
 * One convention per column is the point: currency figures always carry two
 * decimals, percentages always two, and axis ticks always abbreviate. Mixing
 * conventions inside a column is what makes a statement look untrustworthy.
 */

const CURRENCY_FRACTION = { minimumFractionDigits: 2, maximumFractionDigits: 2 } as const

/** `$1,234.56` — always two decimals, always signed by the caller if needed. */
export function formatCurrency(value: number, currency = 'USD'): string {
  if (!Number.isFinite(value)) return '—'
  return value.toLocaleString('en-US', { style: 'currency', currency, ...CURRENCY_FRACTION })
}

/** Absolute value formatted as currency — pair with an explicit sign or glyph. */
export function formatCurrencyAbs(value: number, currency = 'USD'): string {
  if (!Number.isFinite(value)) return '—'
  return formatCurrency(Math.abs(value), currency)
}

/** Signed currency with an explicit leading `+` on gains. */
export function formatCurrencySigned(value: number, currency = 'USD'): string {
  if (!Number.isFinite(value)) return '—'
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${sign}${formatCurrency(Math.abs(value), currency)}`
}

/** Splits a currency string so the cents can be de-emphasised in a hero figure. */
export function splitCurrency(value: number, currency = 'USD'): { whole: string; cents: string } {
  if (!Number.isFinite(value)) return { whole: '—', cents: '' }
  const formatted = formatCurrency(value, currency)
  const idx = formatted.lastIndexOf('.')
  if (idx === -1) return { whole: formatted, cents: '' }
  return { whole: formatted.slice(0, idx), cents: formatted.slice(idx) }
}

/** `+6.81%` / `−2.40%` — two decimals, typographic minus. */
export function formatPercentSigned(value: number): string {
  if (!Number.isFinite(value)) return '—'
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${sign}${Math.abs(value).toFixed(2)}%`
}

/** `6.8%` — unsigned, one decimal. For weights and allocations. */
export function formatWeight(value: number): string {
  if (!Number.isFinite(value)) return '—'
  return `${value.toFixed(1)}%`
}

function currencyPrefix(currency: string): string {
  try {
    const part = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
    }).formatToParts(0).find((entry) => entry.type === 'currency')
    return part?.value ?? `${currency} `
  } catch {
    return `${currency} `
  }
}

/** `$188k` / `−$1.2M` — axis ticks only, never table figures. */
export function formatCompactCurrency(value: number, currency = 'USD'): string {
  if (!Number.isFinite(value)) return ''
  const abs = Math.abs(value)
  const sign = value < 0 ? '−' : ''
  const prefix = currencyPrefix(currency)
  if (abs >= 1_000_000_000) return `${sign}${prefix}${(abs / 1_000_000_000).toFixed(abs >= 10_000_000_000 ? 0 : 1)}B`
  if (abs >= 1_000_000) return `${sign}${prefix}${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`
  if (abs >= 1_000) return `${sign}${prefix}${Math.round(abs / 1_000)}k`
  return `${sign}${prefix}${Math.round(abs)}`
}

/** Share quantity — up to four decimals for fractional lots, no trailing zeros. */
export function formatQuantity(value: number): string {
  if (!Number.isFinite(value)) return '—'
  return value.toLocaleString('en-US', { maximumFractionDigits: 4 })
}

import { formatCurrencySigned, formatPercentSigned } from '../../lib/formatMoney'

type DeltaSize = 'sm' | 'md'

interface DeltaProps {
  /** Signed change. Drives both the colour and the direction glyph. */
  value: number
  /** `currency` renders a money amount; `percent` renders a rate. */
  kind?: 'currency' | 'percent'
  currency?: string
  /** Renders on a tinted chip. Use once per view, for the headline figure. */
  pill?: boolean
  size?: DeltaSize
  className?: string
}

/** Treat sub-cent / sub-basis-point moves as flat rather than painting them. */
const FLAT_EPSILON = 0.005

/**
 * A signed change. Direction is carried by a glyph as well as colour, so the
 * value never depends on colour alone.
 */
export default function Delta({
  value,
  kind = 'currency',
  currency = 'USD',
  pill = false,
  size = 'md',
  className = '',
}: DeltaProps) {
  const flat = !Number.isFinite(value) || Math.abs(value) < FLAT_EPSILON
  const direction = flat ? 'flat' : value > 0 ? 'up' : 'down'
  const glyph = flat ? '—' : value > 0 ? '▲' : '▼'
  const text = kind === 'percent'
    ? formatPercentSigned(flat ? 0 : value)
    : formatCurrencySigned(flat ? 0 : value, currency)
  const label = flat ? 'unchanged' : value > 0 ? 'up' : 'down'

  return (
    <span
      className={`fin-delta fin-delta--${direction} ${pill ? 'fin-delta--pill' : ''} ${className}`.trim()}
      style={size === 'sm' ? { fontSize: 12 } : undefined}
    >
      <span className="fin-delta__glyph" aria-hidden>{glyph}</span>
      <span className="fin-num">{text}</span>
      <span className="fin-sr-only">{label}</span>
    </span>
  )
}

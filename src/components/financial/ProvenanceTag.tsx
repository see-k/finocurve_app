import type { FinancialValueProvenance } from '../../types'
import {
  formatProvenanceAsOf,
  getFinancialFreshness,
  VALUATION_METHOD_LABELS,
} from '../../lib/financialProvenance'
import './ProvenanceTag.css'

interface ProvenanceTagProps {
  provenance: FinancialValueProvenance
  /** Names the figure the provenance belongs to, for the accessible description. */
  label: string
  /** Hides the source text, leaving only the freshness dot. For dense tables. */
  dotOnly?: boolean
  className?: string
}

/** Short source names keep the column narrow; the full name stays in the tooltip. */
const SOURCE_ABBREVIATIONS: [RegExp, string][] = [
  [/yahoo/i, 'Yahoo'],
  [/finocurve/i, 'FinoCurve'],
  [/demo/i, 'Demo'],
  [/manual|user/i, 'Manual'],
  [/legacy/i, 'Legacy'],
  [/import/i, 'Import'],
]

function abbreviateSource(sourceName: string): string {
  for (const [pattern, short] of SOURCE_ABBREVIATIONS) {
    if (pattern.test(sourceName)) return short
  }
  return sourceName.length > 14 ? `${sourceName.slice(0, 13)}…` : sourceName
}

/**
 * Per-row provenance: a freshness dot plus the abbreviated source, carrying the
 * full audit trail (source, as-of, method, freshness) in its tooltip and
 * accessible description. Colour never carries the meaning alone — the source
 * text and the description do.
 */
export default function ProvenanceTag({
  provenance,
  label,
  dotOnly = false,
  className = '',
}: ProvenanceTagProps) {
  const freshness = getFinancialFreshness(provenance)
  const method = VALUATION_METHOD_LABELS[provenance.valuationMethod] ?? provenance.valuationMethod
  const asOf = formatProvenanceAsOf(provenance.asOf)
  const description =
    `${label}. Source: ${provenance.sourceName}. As of: ${asOf}. ` +
    `Method: ${method}. Freshness: ${freshness.label}.` +
    (provenance.isEstimated ? ' Estimated value.' : '')

  return (
    <span className={`fin-prov ${className}`.trim()} title={description}>
      <span className={`fin-prov__dot fin-prov__dot--${freshness.status}`} aria-hidden />
      {!dotOnly && (
        <span className="fin-prov__source">
          {abbreviateSource(provenance.sourceName)}
          {provenance.isEstimated && <span className="fin-prov__est">est</span>}
        </span>
      )}
      <span className="fin-sr-only">{description}</span>
    </span>
  )
}

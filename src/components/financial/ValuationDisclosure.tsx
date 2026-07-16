import { Database, Clock3, Calculator, CircleGauge } from 'lucide-react'
import type { FinancialValueProvenance } from '../../types'
import {
  formatProvenanceAsOf,
  getFinancialFreshness,
  VALUATION_METHOD_LABELS,
} from '../../lib/financialProvenance'
import './ValuationDisclosure.css'

interface ValuationDisclosureProps {
  provenance: FinancialValueProvenance
  label?: string
  compact?: boolean
  className?: string
}

export default function ValuationDisclosure({
  provenance,
  label = 'Valuation details',
  compact = false,
  className = '',
}: ValuationDisclosureProps) {
  const freshness = getFinancialFreshness(provenance)
  const method = VALUATION_METHOD_LABELS[provenance.valuationMethod] ?? provenance.valuationMethod
  const asOf = formatProvenanceAsOf(provenance.asOf)
  const description = `${label}. Source: ${provenance.sourceName}. As of: ${asOf}. Valuation method: ${method}. Freshness: ${freshness.label}.`

  return (
    <div
      className={`valuation-disclosure ${compact ? 'valuation-disclosure--compact' : ''} ${className}`.trim()}
      aria-label={description}
      title={description}
    >
      {!compact && <span className="valuation-disclosure__label">{label}</span>}
      <span className="valuation-disclosure__item">
        <Database size={compact ? 11 : 13} aria-hidden />
        <span className="valuation-disclosure__key">Source</span>
        <strong>{provenance.sourceName}</strong>
      </span>
      <span className="valuation-disclosure__item">
        <Clock3 size={compact ? 11 : 13} aria-hidden />
        <span className="valuation-disclosure__key">As of</span>
        <strong>{asOf}</strong>
      </span>
      <span className="valuation-disclosure__item">
        <Calculator size={compact ? 11 : 13} aria-hidden />
        <span className="valuation-disclosure__key">Method</span>
        <strong>{method}</strong>
      </span>
      <span className={`valuation-disclosure__freshness valuation-disclosure__freshness--${freshness.status}`}>
        <CircleGauge size={compact ? 11 : 13} aria-hidden />
        {freshness.label}{provenance.isEstimated ? ' · Estimated' : ''}
      </span>
    </div>
  )
}

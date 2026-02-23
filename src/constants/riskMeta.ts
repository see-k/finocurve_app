/** Shared risk level metadata for Dashboard and Risk Analysis screens */
export const RISK_LEVEL_META: Record<string, { color: string; label: string; desc: string }> = {
  conservative: { color: '#10b981', label: 'Conservative', desc: 'Low risk tolerance with focus on capital preservation' },
  moderate:     { color: '#6366f1', label: 'Moderate',     desc: 'Balanced approach between growth and stability' },
  growth:       { color: '#f59e0b', label: 'Growth',       desc: 'Higher risk tolerance for potential growth' },
  aggressive:   { color: '#ef4444', label: 'Aggressive',   desc: 'High risk tolerance with focus on maximum returns' },
}

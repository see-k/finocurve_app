import type {
  RiskAnalysisResult,
  Asset,
  ScenarioSeverity,
  SuggestionPriority,
  FinancialValueProvenance,
} from '../../../types'

export const DOCUMENTS_PREFIX = 'finocurve/documents/'
export const REPORTS_PREFIX = 'finocurve/reports/'

export interface LoadedAnalysis {
  source: 'saved' | 'snapshot'
  generatedAt: string
  risk: RiskAnalysisResult
  assets: Asset[]
  totalValue: number
  totalGainLossPercent: number
  portfolioName: string
  sectorAlloc: Record<string, number>
  countryAlloc: Record<string, number>
  typeAlloc: Record<string, number>
  advancedAnalysis?: { sections: { title: string; content: string }[] }
  valuationProvenance?: FinancialValueProvenance
}

export const RISK_BG = 'https://images.unsplash.com/photo-1515266591878-f93e32bc5937?q=80&w=1287&auto=format&fit=crop'
export const CHART_COLORS = ['#6366f1', '#8b5cf6', '#a78bfa', '#c084fc', '#06b6d4', '#14b8a6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#64748b', '#84cc16']

export const VOL_LEVEL_META: Record<string, { color: string; label: string }> = {
  low: { color: '#10b981', label: 'Low' }, moderate: { color: '#6366f1', label: 'Moderate' },
  high: { color: '#f59e0b', label: 'High' }, very_high: { color: '#ef4444', label: 'Very High' },
}

export const SHARPE_META: Record<string, { color: string; label: string; desc: string }> = {
  poor:          { color: '#ef4444', label: 'Poor',          desc: 'Returns do not justify the risk taken' },
  below_average: { color: '#f59e0b', label: 'Below Average', desc: 'Below market average risk-adjusted returns' },
  average:       { color: '#6366f1', label: 'Average',       desc: 'Market average risk-adjusted returns' },
  good:          { color: '#06b6d4', label: 'Good',          desc: 'Good risk-adjusted returns' },
  excellent:     { color: '#10b981', label: 'Excellent',     desc: 'Excellent risk-adjusted returns' },
}

export const LIQ_LABEL: Record<string, string> = {
  immediate: 'Immediate (0-1 day)', short_term: 'Short-term (1-7 days)',
  medium_term: 'Medium-term (1-4 wks)', long_term: 'Long-term (1+ months)',
}
export const LIQ_COLOR: Record<string, string> = { immediate: '#10b981', short_term: '#06b6d4', medium_term: '#f59e0b', long_term: '#ef4444' }

export const SEVERITY_META: Record<ScenarioSeverity, { color: string; bg: string }> = {
  mild:     { color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  moderate: { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  severe:   { color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  extreme:  { color: '#dc2626', bg: 'rgba(220,38,38,0.15)' },
}

export const PRIORITY_META: Record<SuggestionPriority, { color: string; bg: string }> = {
  high:   { color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  medium: { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  low:    { color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
}

export const CONFIDENCE_META: Record<string, { color: string; label: string }> = {
  high:   { color: '#10b981', label: 'High confidence' },
  medium: { color: '#f59e0b', label: 'Medium confidence' },
  low:    { color: '#64748b', label: 'Low confidence' },
}

export const fmt = (n: number) => '$' + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function generateVolHistory(score: number) {
  const data = []
  let v = score
  for (let i = 0; i < 52; i++) {
    v += (Math.random() - 0.48) * 4
    v = Math.max(5, Math.min(50, v))
    data.push({ week: `W${i + 1}`, vol: +v.toFixed(1) })
  }
  return data
}

export const pieData = (alloc: Record<string, number>, labels: Record<string, string>) =>
  Object.entries(alloc).filter(([, v]) => v > 0).map(([k, v]) => ({ name: labels[k as keyof typeof labels] || k, value: +v.toFixed(2) })).sort((a, b) => b.value - a.value)

// Country code → emoji flag
const COUNTRY_TO_ISO2: Record<string, string> = {
  US: 'US', USA: 'US', 'United States': 'US', UK: 'GB', 'United Kingdom': 'GB', GB: 'GB',
  Germany: 'DE', DE: 'DE', France: 'FR', FR: 'FR', Japan: 'JP', JP: 'JP',
  China: 'CN', CN: 'CN', India: 'IN', IN: 'IN', Australia: 'AU', AU: 'AU',
  Canada: 'CA', CA: 'CA', Brazil: 'BR', BR: 'BR', 'South Korea': 'KR', KR: 'KR',
  Switzerland: 'CH', CH: 'CH', Netherlands: 'NL', NL: 'NL', Italy: 'IT', IT: 'IT',
  Spain: 'ES', ES: 'ES', Sweden: 'SE', SE: 'SE', Norway: 'NO', NO: 'NO',
  Denmark: 'DK', DK: 'DK', Finland: 'FI', FI: 'FI', Ireland: 'IE', IE: 'IE',
  Taiwan: 'TW', TW: 'TW', Singapore: 'SG', SG: 'SG', 'Hong Kong': 'HK', HK: 'HK',
  'New Zealand': 'NZ', NZ: 'NZ', 'South Africa': 'ZA', ZA: 'ZA', Mexico: 'MX', MX: 'MX',
  Argentina: 'AR', AR: 'AR', 'Saudi Arabia': 'SA', SA: 'SA', UAE: 'AE', AE: 'AE',
  Israel: 'IL', IL: 'IL', Russia: 'RU', RU: 'RU', Poland: 'PL', PL: 'PL',
  Belgium: 'BE', BE: 'BE', Austria: 'AT', AT: 'AT', Global: 'UN',
}

export function countryFlag(name: string): string {
  const iso2 = COUNTRY_TO_ISO2[name] || COUNTRY_TO_ISO2[name.toUpperCase()]
  if (!iso2) return '🌍'
  return iso2.split('').map(c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)).join('')
}

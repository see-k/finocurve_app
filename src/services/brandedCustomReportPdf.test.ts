import { describe, expect, it } from 'vitest'
import { safeReportFileSlug } from './brandedCustomReportPdf'

describe('safeReportFileSlug', () => {
  it('normalizes unicode, punctuation, and whitespace into filesystem-safe slugs', () => {
    expect(safeReportFileSlug('Q4 Holdings Report!')).toBe('Q4_Holdings_Report')
    expect(safeReportFileSlug('Café Résumé — 2026')).toBe('Cafe_Resume_2026')
    expect(safeReportFileSlug('___already___trimmed___')).toBe('already_trimmed')
  })

  it('respects maxLen and falls back to Report for empty titles', () => {
    expect(safeReportFileSlug('Very Long Report Title That Should Be Truncated', 12)).toBe('Very_Long_Re')
    expect(safeReportFileSlug('!!!')).toBe('Report')
    expect(safeReportFileSlug('')).toBe('Report')
  })
})

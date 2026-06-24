import { describe, expect, it } from 'vitest'
import { secHtmlToPlainText } from './secHtmlToPlainText'

describe('secHtmlToPlainText', () => {
  it('strips tags and collapses whitespace from SEC-style HTML', () => {
    const html = `
      <html><body>
        <h1>10-K Annual Report</h1>
        <p>Revenue was <strong>$100M</strong> in fiscal 2024.</p>
        <p>See <a href="https://sec.gov">our filing</a> for details.</p>
      </body></html>
    `
    const text = secHtmlToPlainText(html)
    expect(text.toLowerCase()).toContain('10-k annual report')
    expect(text).toContain('Revenue was $100M in fiscal 2024')
    expect(text).not.toContain('<strong>')
    expect(text).not.toContain('<a href')
  })

  it('returns empty string for empty HTML', () => {
    expect(secHtmlToPlainText('')).toBe('')
    expect(secHtmlToPlainText('<html><body></body></html>')).toBe('')
  })

  it('normalizes runs of whitespace and blank lines', () => {
    const html = '<div>Line   one</div>\n\n\n<div>Line two</div>'
    const text = secHtmlToPlainText(html)
    expect(text).not.toMatch(/\s{3,}/)
    expect(text).toContain('Line one')
    expect(text).toContain('Line two')
  })
})

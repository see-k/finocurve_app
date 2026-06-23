import { describe, expect, it } from 'vitest'
import { htmlToPlainText } from './secHtmlToPlainText'

describe('htmlToPlainText', () => {
  it('strips tags and collapses whitespace from SEC-style HTML', () => {
    const html = '<html><body><p>Item 1A. <b>Risk Factors</b></p><p>Market volatility may affect results.</p></body></html>'
    const text = htmlToPlainText(html)
    expect(text).toContain('Item 1A.')
    expect(text).toContain('Risk Factors')
    expect(text).toContain('Market volatility may affect results.')
    expect(text).not.toContain('<p>')
    expect(text).not.toContain('<b>')
  })

  it('hides redundant link hrefs when link text matches the URL', () => {
    const html = '<a href="https://www.sec.gov">https://www.sec.gov</a>'
    const text = htmlToPlainText(html)
    expect(text).toBe('https://www.sec.gov')
    expect(text).not.toContain('href')
  })

  it('returns empty string for empty HTML', () => {
    expect(htmlToPlainText('')).toBe('')
    expect(htmlToPlainText('   ')).toBe('')
  })
})

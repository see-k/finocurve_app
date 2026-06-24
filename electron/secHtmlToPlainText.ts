/**
 * Convert SEC filing HTML to plain text for AI consumption.
 */
import { convert } from 'html-to-text'

export function secHtmlToPlainText(html: string): string {
  const text = convert(html, {
    wordwrap: false,
    selectors: [{ selector: 'a', options: { hideLinkHrefIfSameAsText: true } }],
  })
  return text.replace(/\s+/g, ' ').replace(/\n\s*\n/g, '\n').trim()
}

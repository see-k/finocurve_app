import { convert } from 'html-to-text'

/** Convert SEC filing HTML to plain text for AI consumption. */
export function htmlToPlainText(html: string): string {
  const text = convert(html, {
    wordwrap: false,
    selectors: [{ selector: 'a', options: { hideLinkHrefIfSameAsText: true } }],
  })
  return text.replace(/\s+/g, ' ').replace(/\n\s*\n/g, '\n').trim()
}

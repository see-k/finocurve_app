/**
 * Pure navigation verification and page-text assembly for in-app browser tools.
 */

import { KNOWN_MAIN_TABS } from './appBrowserRouteValidation'

export const MAX_PAGE_TEXT_CHARS = 36_000

export function expectedMainTabFromPath(targetPath: string): string {
  const q = targetPath.split('?', 2)[1] ?? ''
  const t = new URLSearchParams(q).get('tab')
  return t && KNOWN_MAIN_TABS.has(t) ? t : 'dashboard'
}

export function mainTabLabelMatchesExpected(activeNavLabel: string, expectedTab: string): boolean {
  const labelTab = activeNavLabel.toLowerCase()
  return (
    labelTab === expectedTab ||
    labelTab.startsWith(expectedTab) ||
    (expectedTab === 'risk' && labelTab.includes('risk')) ||
    (expectedTab === 'news' && labelTab.includes('news'))
  )
}

export function evaluateMainShellNavigation(params: {
  targetPath: string
  currentPath: string | null
  activeNavLabel: string | null
}): { ok: boolean; note?: string } {
  let ok = !!params.currentPath && params.currentPath === params.targetPath
  let note: string | undefined

  if (ok && params.targetPath.startsWith('/main')) {
    const expectedTab = expectedMainTabFromPath(params.targetPath)
    if (params.activeNavLabel) {
      if (!mainTabLabelMatchesExpected(params.activeNavLabel, expectedTab)) {
        ok = false
        note = `URL applied but the rendered tab is "${params.activeNavLabel}" instead of "${expectedTab}".`
      }
    }
  }
  if (!ok && !note) {
    note =
      'Hash applied but route did not resolve to the requested path. Call app_browser_list_routes to verify available routes.'
  }
  return { ok, note }
}

export function shouldIncludePageOutline(includeOutline: unknown): boolean {
  return includeOutline !== false && includeOutline !== 'false'
}

export function assemblePageTextPayload(
  extracted: {
    headings?: string[]
    listSnippets?: string[]
    innerText?: string
    currentPath?: string
  },
  options: { includeOutline: boolean; maxChars?: number }
): {
  ok: true
  currentPath?: string
  text: string
  chars: number
  truncated: boolean
  note?: string
} {
  const maxChars = options.maxChars ?? MAX_PAGE_TEXT_CHARS
  const headings = Array.isArray(extracted.headings)
    ? extracted.headings.filter((x) => typeof x === 'string')
    : []
  const listSnippets = Array.isArray(extracted.listSnippets)
    ? extracted.listSnippets.filter((x) => typeof x === 'string')
    : []
  const innerText = typeof extracted.innerText === 'string' ? extracted.innerText : ''
  const currentPath = typeof extracted.currentPath === 'string' ? extracted.currentPath : undefined

  const sections: string[] = []
  if (options.includeOutline) {
    if (headings.length) {
      sections.push(`--- Headings ---\n${headings.join('\n')}`)
    }
    if (listSnippets.length) {
      sections.push(`--- List excerpts ---\n${listSnippets.slice(0, 24).join('\n---\n')}`)
    }
  }
  if (innerText.length) sections.push(innerText)

  const fullText = sections.length ? sections.join('\n\n') : ''
  const charCountBeforeCap = fullText.length
  const truncated = charCountBeforeCap > maxChars
  const text = truncated ? fullText.slice(0, maxChars) : fullText

  return {
    ok: true,
    currentPath,
    text,
    chars: charCountBeforeCap,
    truncated,
    ...(truncated
      ? { note: `Truncated at ${maxChars} characters; navigate or scroll and call again for more.` }
      : {}),
  }
}

export function parseScreenshotScaleFactor(scaleFactor: unknown): number {
  return typeof scaleFactor === 'number' && Number.isFinite(scaleFactor) && scaleFactor > 0
    ? scaleFactor
    : 1
}

export function parseScrollDeltas(
  args: Record<string, unknown>
): { ok: true; deltaX: number; deltaY: number } | { ok: false; error: string } {
  const deltaY = typeof args.deltaY === 'number' && Number.isFinite(args.deltaY) ? args.deltaY : 0
  const deltaX = typeof args.deltaX === 'number' && Number.isFinite(args.deltaX) ? args.deltaX : 0
  if (deltaY === 0 && deltaX === 0) {
    return { ok: false, error: 'Provide deltaY and/or deltaX (non-zero) to scroll.' }
  }
  return { ok: true, deltaX, deltaY }
}

export function validateClickArgs(
  args: Record<string, unknown>
):
  | { ok: true; text: string; selector: string; role: string; nth: number }
  | { ok: false; error: string } {
  const text = typeof args.text === 'string' ? args.text.trim() : ''
  const selector = typeof args.selector === 'string' ? args.selector.trim() : ''
  const role = typeof args.role === 'string' ? args.role.trim() : ''
  const nth =
    typeof args.nth === 'number' && Number.isFinite(args.nth) ? Math.max(0, Math.floor(args.nth)) : 0
  if (!text && !selector) {
    return { ok: false, error: 'Provide either "text" or "selector".' }
  }
  return { ok: true, text, selector, role, nth }
}

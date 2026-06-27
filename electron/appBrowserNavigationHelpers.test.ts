import { describe, expect, it } from 'vitest'
import {
  assemblePageTextPayload,
  computeScreenshotDimensions,
  evaluateMainShellNavigation,
  expectedMainTabFromPath,
  mainTabLabelMatchesExpected,
  parseScreenshotScaleFactor,
  parseScrollDeltas,
  shouldIncludePageOutline,
  validateClickArgs,
} from './appBrowserNavigationHelpers'

describe('expectedMainTabFromPath', () => {
  it('defaults to dashboard for bare /main', () => {
    expect(expectedMainTabFromPath('/main')).toBe('dashboard')
  })

  it('reads known tab query params', () => {
    expect(expectedMainTabFromPath('/main?tab=portfolio')).toBe('portfolio')
  })
})

describe('mainTabLabelMatchesExpected', () => {
  it('matches exact and prefixed labels', () => {
    expect(mainTabLabelMatchesExpected('Portfolio', 'portfolio')).toBe(true)
    expect(mainTabLabelMatchesExpected('Portfolio holdings', 'portfolio')).toBe(true)
  })

  it('allows risk and news labels to contain extra words', () => {
    expect(mainTabLabelMatchesExpected('Risk Analysis', 'risk')).toBe(true)
    expect(mainTabLabelMatchesExpected('News & Data', 'news')).toBe(true)
  })

  it('rejects mismatched tabs', () => {
    expect(mainTabLabelMatchesExpected('Settings', 'portfolio')).toBe(false)
  })
})

describe('evaluateMainShellNavigation', () => {
  it('accepts matching portfolio navigation', () => {
    expect(
      evaluateMainShellNavigation({
        targetPath: '/main?tab=portfolio',
        currentPath: '/main?tab=portfolio',
        activeNavLabel: 'Portfolio',
      })
    ).toEqual({ ok: true })
  })

  it('flags URL/label mismatch on main tabs', () => {
    const result = evaluateMainShellNavigation({
      targetPath: '/main?tab=portfolio',
      currentPath: '/main?tab=portfolio',
      activeNavLabel: 'Settings',
    })
    expect(result.ok).toBe(false)
    expect(result.note).toContain('rendered tab is "Settings"')
  })

  it('leaves ok true when nav label is unavailable', () => {
    expect(
      evaluateMainShellNavigation({
        targetPath: '/main?tab=portfolio',
        currentPath: '/main?tab=portfolio',
        activeNavLabel: null,
      })
    ).toEqual({ ok: true })
  })

  it('adds fallback note when hash path does not resolve', () => {
    const result = evaluateMainShellNavigation({
      targetPath: '/settings/ai-config',
      currentPath: '/main',
      activeNavLabel: null,
    })
    expect(result.ok).toBe(false)
    expect(result.note).toContain('app_browser_list_routes')
  })
})

describe('assemblePageTextPayload', () => {
  it('prepends outline sections when enabled', () => {
    const payload = assemblePageTextPayload(
      {
        headings: ['Dashboard'],
        listSnippets: ['- Item one'],
        innerText: 'Body text',
        currentPath: '/main',
      },
      { includeOutline: true, maxChars: 1000 }
    )
    expect(payload.text).toContain('--- Headings ---')
    expect(payload.text).toContain('--- List excerpts ---')
    expect(payload.text).toContain('Body text')
    expect(payload.truncated).toBe(false)
  })

  it('treats string "false" as outline disabled', () => {
    expect(shouldIncludePageOutline('false')).toBe(false)
    const payload = assemblePageTextPayload(
      { headings: ['Hidden'], innerText: 'Only body' },
      { includeOutline: shouldIncludePageOutline('false'), maxChars: 1000 }
    )
    expect(payload.text).toBe('Only body')
  })

  it('truncates oversized text with a note', () => {
    const payload = assemblePageTextPayload(
      { innerText: 'x'.repeat(50) },
      { includeOutline: false, maxChars: 20 }
    )
    expect(payload.text).toHaveLength(20)
    expect(payload.truncated).toBe(true)
    expect(payload.note).toContain('Truncated at 20 characters')
  })
})

describe('computeScreenshotDimensions', () => {
  it('downscales so the longest side fits the max dimension', () => {
    expect(computeScreenshotDimensions(1920, 1080)).toEqual({ width: 1280, height: 720 })
    expect(computeScreenshotDimensions(800, 1600)).toEqual({ width: 640, height: 1280 })
  })

  it('leaves small captures unchanged before scale factor', () => {
    expect(computeScreenshotDimensions(640, 480)).toEqual({ width: 640, height: 480 })
  })

  it('applies scale factor after downscaling', () => {
    expect(computeScreenshotDimensions(1920, 1080, { scaleFactor: 2 })).toEqual({
      width: 2560,
      height: 1440,
    })
  })

  it('never returns zero dimensions', () => {
    expect(computeScreenshotDimensions(1, 5000)).toEqual({ width: 1, height: 1280 })
  })
})

describe('tool arg helpers', () => {
  it('defaults invalid screenshot scale factors to 1', () => {
    expect(parseScreenshotScaleFactor(undefined)).toBe(1)
    expect(parseScreenshotScaleFactor(0)).toBe(1)
    expect(parseScreenshotScaleFactor(1.5)).toBe(1.5)
  })

  it('rejects zero scroll deltas', () => {
    expect(parseScrollDeltas({})).toEqual({
      ok: false,
      error: 'Provide deltaY and/or deltaX (non-zero) to scroll.',
    })
    expect(parseScrollDeltas({ deltaY: 10 })).toEqual({ ok: true, deltaX: 0, deltaY: 10 })
  })

  it('requires click text or selector and floors nth', () => {
    expect(validateClickArgs({})).toEqual({ ok: false, error: 'Provide either "text" or "selector".' })
    expect(validateClickArgs({ text: 'Save', nth: 1.9 })).toEqual({
      ok: true,
      text: 'Save',
      selector: '',
      role: '',
      nth: 1,
    })
  })
})

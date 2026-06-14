import { describe, expect, it } from 'vitest'
import { normalizeHashRoute, validateRequestedPath } from './appBrowserRouteValidation'

describe('validateRequestedPath', () => {
  it('accepts known main tabs', () => {
    expect(validateRequestedPath('/main?tab=portfolio')).toEqual({ ok: true })
    expect(validateRequestedPath('/main')).toEqual({ ok: true })
  })

  it('rejects unknown tabs with alias suggestion for documents', () => {
    const result = validateRequestedPath('/main?tab=documents')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('Unknown /main tab "documents"')
      expect(result.suggestion).toBe('/main?tab=reports')
    }
  })

  it('accepts parameterized asset routes', () => {
    expect(validateRequestedPath('/asset/abc-123')).toEqual({ ok: true })
    expect(validateRequestedPath('/main/loan/loan-42')).toEqual({ ok: true })
  })

  it('rejects paths outside the catalog', () => {
    const result = validateRequestedPath('/does-not-exist')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('not in the route catalog')
    }
  })
})

describe('normalizeHashRoute', () => {
  it('normalizes bare and hash-prefixed paths', () => {
    expect(normalizeHashRoute('/main?tab=news')).toBe('#/main?tab=news')
    expect(normalizeHashRoute('#main')).toBe('#/main')
    expect(normalizeHashRoute('')).toBe('#/')
  })
})

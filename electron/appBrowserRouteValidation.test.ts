import { describe, expect, it } from 'vitest'
import {
  normalizeHashRoute,
  pathMatchesCatalog,
  validateRequestedPath,
} from './appBrowserRouteValidation'

describe('normalizeHashRoute', () => {
  it('normalizes bare paths and hash prefixes', () => {
    expect(normalizeHashRoute('/main?tab=portfolio')).toBe('#/main?tab=portfolio')
    expect(normalizeHashRoute('main?tab=portfolio')).toBe('#/main?tab=portfolio')
    expect(normalizeHashRoute('#/settings/ai-config')).toBe('#/settings/ai-config')
    expect(normalizeHashRoute('#main')).toBe('#/main')
    expect(normalizeHashRoute('')).toBe('#/')
  })
})

describe('pathMatchesCatalog', () => {
  it('accepts literal catalog paths', () => {
    expect(pathMatchesCatalog('/settings/ai-config')).toBe(true)
    expect(pathMatchesCatalog('/main?tab=reports')).toBe(true)
  })

  it('accepts parameterized routes with concrete ids', () => {
    expect(pathMatchesCatalog('/asset/abc-123')).toBe(true)
    expect(pathMatchesCatalog('/main/loan/loan-42')).toBe(true)
  })

  it('rejects unknown paths', () => {
    expect(pathMatchesCatalog('/settings/unknown-screen')).toBe(false)
    expect(pathMatchesCatalog('/main/documents')).toBe(false)
  })
})

describe('validateRequestedPath', () => {
  it('accepts known main tabs and bare /main', () => {
    expect(validateRequestedPath('/main')).toEqual({ ok: true })
    expect(validateRequestedPath('/main?tab=portfolio')).toEqual({ ok: true })
    expect(validateRequestedPath('/main?tab=reports')).toEqual({ ok: true })
  })

  it('rejects unknown tabs with alias suggestion for documents', () => {
    const result = validateRequestedPath('/main?tab=documents')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('Unknown /main tab "documents"')
      expect(result.suggestion).toBe('/main?tab=reports')
    }
  })

  it('suggests /main when users ask for home tab', () => {
    const result = validateRequestedPath('/main?tab=home')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.suggestion).toBe('/main')
    }
  })

  it('rejects unknown main tabs instead of silently falling back to dashboard', () => {
    const result = validateRequestedPath('/main?tab=not-a-tab')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('Unknown /main tab')
    }
  })

  it('accepts non-main catalog routes', () => {
    expect(validateRequestedPath('/settings/plugins/fmp')).toEqual({ ok: true })
    expect(validateRequestedPath('/asset/xyz')).toEqual({ ok: true })
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

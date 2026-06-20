// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { hasPersistedPortfolio, shouldEnterMainAfterSignIn } from './onboardingRouting'

describe('onboardingRouting', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('detects a valid persisted portfolio', () => {
    expect(hasPersistedPortfolio()).toBe(false)
    localStorage.setItem(
      'finocurve-portfolio',
      JSON.stringify({ id: 'p1', name: 'Main', assets: [] }),
    )
    expect(hasPersistedPortfolio()).toBe(true)
  })

  it('rejects malformed or incomplete portfolio JSON', () => {
    localStorage.setItem('finocurve-portfolio', 'not-json')
    expect(hasPersistedPortfolio()).toBe(false)
    localStorage.setItem('finocurve-portfolio', JSON.stringify({ id: 'p1', name: '  ', assets: [] }))
    expect(hasPersistedPortfolio()).toBe(false)
    localStorage.setItem('finocurve-portfolio', JSON.stringify({ id: 'p1', name: 'Main' }))
    expect(hasPersistedPortfolio()).toBe(false)
  })

  it('routes returning users to main when onboarding or portfolio exists', () => {
    expect(shouldEnterMainAfterSignIn({}, null)).toBe(false)
    expect(shouldEnterMainAfterSignIn({ hasCompletedOnboarding: true }, null)).toBe(true)
    expect(shouldEnterMainAfterSignIn({}, { hasCompletedOnboarding: true })).toBe(true)
    localStorage.setItem(
      'finocurve-portfolio',
      JSON.stringify({ id: 'p1', name: 'Main', assets: [] }),
    )
    expect(shouldEnterMainAfterSignIn({}, null)).toBe(true)
  })
})

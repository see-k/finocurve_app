// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  buildSignInPreferences,
  initialsFromName,
  switchActiveSessionForSignIn,
} from './loginSessionHelpers'

describe('initialsFromName', () => {
  it('uses first and last name initials when both are present', () => {
    expect(initialsFromName('Jane Doe', 'jane@example.com')).toBe('JD')
  })

  it('uses the first two letters of a single name', () => {
    expect(initialsFromName('Alexander', 'alex@example.com')).toBe('AL')
  })

  it('falls back to the email local-part when name is empty', () => {
    expect(initialsFromName('', 'chike@finocurve.com')).toBe('CH')
    expect(initialsFromName('   ', 'x@y.com')).toBe('X')
  })
})

describe('buildSignInPreferences', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('merges saved profile fields and routes returning users to main', () => {
    localStorage.setItem(
      'finocurve-portfolio',
      JSON.stringify({ id: 'p1', name: 'Main', assets: [] }),
    )
    const { preferences, goMain } = buildSignInPreferences(
      'User@Example.com',
      {
        userName: 'Jane Doe',
        profilePicturePath: 'data:image/jpeg;base64,abc',
        hasCompletedOnboarding: false,
      },
      JSON.stringify({ theme: 'light-warm', defaultCurrency: 'EUR' }),
    )

    expect(preferences.userEmail).toBe('User@Example.com')
    expect(preferences.userName).toBe('Jane Doe')
    expect(preferences.profilePicturePath).toBe('data:image/jpeg;base64,abc')
    expect(preferences.defaultCurrency).toBe('EUR')
    expect(preferences.theme).toBe('light-warm')
    expect(preferences.hasCompletedOnboarding).toBe(true)
    expect(goMain).toBe(true)
  })

  it('sends first-time users to onboarding when no portfolio or saved flag exists', () => {
    const { preferences, goMain } = buildSignInPreferences(
      'new@example.com',
      { hasCompletedOnboarding: false },
      null,
    )

    expect(preferences.hasCompletedOnboarding).toBe(false)
    expect(goMain).toBe(false)
  })

  it('ignores malformed preference JSON', () => {
    const { preferences } = buildSignInPreferences(
      'a@test.com',
      { userName: 'A', hasCompletedOnboarding: true },
      'not-json',
    )

    expect(preferences.userName).toBe('A')
    expect(preferences.theme).toBe('dark-graphite')
    expect(preferences.hasCompletedOnboarding).toBe(true)
  })
})

describe('switchActiveSessionForSignIn', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('restores archived session data for the selected email', () => {
    localStorage.setItem('finocurve-portfolio:user:a@test.com', '{"id":"archived"}')
    localStorage.setItem('finocurve-portfolio', '{"id":"stale-active"}')

    switchActiveSessionForSignIn('a@test.com')

    expect(localStorage.getItem('finocurve-portfolio')).toBe('{"id":"archived"}')
    expect(localStorage.getItem('finocurve-portfolio:user:a@test.com')).toBe('{"id":"archived"}')
  })

  it('clears active session keys when no archive exists for the email', () => {
    localStorage.setItem('finocurve-portfolio', '{"id":"other-user"}')
    localStorage.setItem('finocurve-portfolio:user:b@test.com', '{"id":"b"}')

    switchActiveSessionForSignIn('new@test.com')

    expect(localStorage.getItem('finocurve-portfolio')).toBeNull()
    expect(localStorage.getItem('finocurve-portfolio:user:b@test.com')).toBe('{"id":"b"}')
  })
})

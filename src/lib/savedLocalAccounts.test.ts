// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  getSavedLocalAccount,
  loadSavedLocalAccounts,
  removeSavedLocalAccount,
  upsertSavedLocalAccount,
} from './savedLocalAccounts'

describe('savedLocalAccounts', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('loads legacy password-prefixed auth fields into localAuth fields', () => {
    localStorage.setItem(
      'finocurve-saved-local-accounts',
      JSON.stringify([
        {
          email: 'legacy@example.com',
          hasCompletedOnboarding: true,
          updatedAt: '2026-01-01T00:00:00.000Z',
          passwordSaltB64: 'salt',
          passwordHashB64: 'hash',
          passwordKdf: 'pbkdf2-sha256-210k',
        },
      ]),
    )
    const [account] = loadSavedLocalAccounts()
    expect(account.localAuthSaltB64).toBe('salt')
    expect(account.localAuthDigestB64).toBe('hash')
    expect(account.localAuthKdf).toBe('pbkdf2-sha256-210k')
  })

  it('upserts by normalized email and sorts newest first', () => {
    upsertSavedLocalAccount({
      email: 'User@Example.com',
      hasCompletedOnboarding: false,
    })
    upsertSavedLocalAccount({
      email: 'user@example.com',
      hasCompletedOnboarding: true,
      userName: 'User',
    })
    const accounts = loadSavedLocalAccounts()
    expect(accounts).toHaveLength(1)
    expect(accounts[0].email).toBe('user@example.com')
    expect(accounts[0].hasCompletedOnboarding).toBe(true)
    expect(getSavedLocalAccount('USER@example.com')?.userName).toBe('User')
  })

  it('removes accounts case-insensitively', () => {
    upsertSavedLocalAccount({ email: 'a@test.com', hasCompletedOnboarding: true })
    removeSavedLocalAccount('A@test.com')
    expect(loadSavedLocalAccounts()).toHaveLength(0)
  })
})

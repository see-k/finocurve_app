/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  getSavedLocalAccount,
  loadSavedLocalAccounts,
  removeSavedLocalAccount,
  upsertSavedLocalAccount,
} from './savedLocalAccounts'

const STORAGE_KEY = 'finocurve-saved-local-accounts'

describe('savedLocalAccounts', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('migrates legacy password* auth field names to localAuth*', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        {
          email: 'legacy@example.com',
          hasCompletedOnboarding: true,
          updatedAt: '2026-01-01T00:00:00.000Z',
          passwordSaltB64: 'legacy-salt',
          passwordHashB64: 'legacy-digest',
          passwordKdf: 'pbkdf2-sha256-210k',
        },
      ]),
    )

    const [account] = loadSavedLocalAccounts()
    expect(account.localAuthSaltB64).toBe('legacy-salt')
    expect(account.localAuthDigestB64).toBe('legacy-digest')
    expect(account.localAuthKdf).toBe('pbkdf2-sha256-210k')
  })

  it('upserts by normalized email and sorts newest first', () => {
    upsertSavedLocalAccount({
      email: 'User@Example.com',
      hasCompletedOnboarding: false,
      localAuthSaltB64: 'salt-a',
      localAuthDigestB64: 'digest-a',
      localAuthKdf: 'pbkdf2-sha256-210k',
    })
    upsertSavedLocalAccount({
      email: 'user@example.com',
      hasCompletedOnboarding: true,
      localAuthDigestB64: 'digest-b',
    })

    const accounts = loadSavedLocalAccounts()
    expect(accounts).toHaveLength(1)
    expect(accounts[0].hasCompletedOnboarding).toBe(true)
    expect(accounts[0].localAuthDigestB64).toBe('digest-b')
    expect(accounts[0].localAuthSaltB64).toBe('salt-a')
    expect(getSavedLocalAccount('USER@example.com')?.email).toBe('user@example.com')
  })

  it('removes accounts by normalized email', () => {
    upsertSavedLocalAccount({ email: 'keep@example.com', hasCompletedOnboarding: true })
    upsertSavedLocalAccount({ email: 'drop@example.com', hasCompletedOnboarding: false })
    removeSavedLocalAccount('DROP@example.com')
    expect(loadSavedLocalAccounts().map((a) => a.email)).toEqual(['keep@example.com'])
  })
})

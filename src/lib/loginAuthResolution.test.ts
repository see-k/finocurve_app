// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { hashPassword } from './localPasswordAuth'
import { resolveLoginAuth } from './loginAuthResolution'
import type { SavedLocalAccount } from './savedLocalAccounts'

function baseAccount(overrides: Partial<SavedLocalAccount> = {}): SavedLocalAccount {
  return {
    email: 'user@example.com',
    hasCompletedOnboarding: true,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('resolveLoginAuth', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns no_profile when the email is not saved locally', async () => {
    const result = await resolveLoginAuth(undefined, 'any-password')
    expect(result).toEqual({ ok: false, error: 'no_profile' })
  })

  it('verifies stored PBKDF2 credentials', async () => {
    const password = 'correct horse battery staple'
    const { saltB64, hashB64 } = await hashPassword(password)
    const saved = baseAccount({
      localAuthSaltB64: saltB64,
      localAuthDigestB64: hashB64,
      localAuthKdf: 'pbkdf2-sha256-210k',
    })

    await expect(resolveLoginAuth(saved, password)).resolves.toEqual({ ok: true })
    await expect(resolveLoginAuth(saved, 'wrong')).resolves.toEqual({ ok: false, error: 'incorrect_password' })
  })

  it('accepts a first-time password when no digest is stored yet', async () => {
    const saved = baseAccount()
    const result = await resolveLoginAuth(saved, 'first-time-password')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.newLocalAuth?.saltB64.length).toBeGreaterThan(0)
      expect(result.newLocalAuth?.digestB64.length).toBeGreaterThan(0)
    }
  })

  it('requires minimum length when setting a first-time password', async () => {
    const saved = baseAccount()
    const result = await resolveLoginAuth(saved, 'short')
    expect(result).toEqual({ ok: false, error: 'password_too_short', minLength: 8 })
  })
})

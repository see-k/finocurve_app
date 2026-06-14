import { describe, expect, it } from 'vitest'
import { hashPassword, isPasswordLongEnough, verifyPassword } from './localPasswordAuth'

describe('localPasswordAuth', () => {
  it('enforces minimum password length', () => {
    expect(isPasswordLongEnough('short')).toBe(false)
    expect(isPasswordLongEnough('long-enough')).toBe(true)
  })

  it('hashes and verifies passwords with PBKDF2', async () => {
    const password = 'correct horse battery staple'
    const { saltB64, hashB64 } = await hashPassword(password)
    expect(saltB64.length).toBeGreaterThan(0)
    expect(hashB64.length).toBeGreaterThan(0)
    await expect(verifyPassword(password, saltB64, hashB64)).resolves.toBe(true)
    await expect(verifyPassword('wrong password', saltB64, hashB64)).resolves.toBe(false)
  })

  it('returns false for malformed stored credentials', async () => {
    await expect(verifyPassword('pw', 'not-valid-b64!!!', 'also-bad')).resolves.toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { hashPassword, isPasswordLongEnough, PASSWORD_MIN_LENGTH, verifyPassword } from './localPasswordAuth'

describe('localPasswordAuth', () => {
  it('enforces minimum password length', () => {
    expect(isPasswordLongEnough('short')).toBe(false)
    expect(isPasswordLongEnough('a'.repeat(PASSWORD_MIN_LENGTH))).toBe(true)
  })

  it('hashes and verifies passwords with distinct salts', async () => {
    const first = await hashPassword('correct horse battery staple')
    const second = await hashPassword('correct horse battery staple')
    expect(first.saltB64).not.toBe(second.saltB64)
    expect(first.hashB64).not.toBe(second.hashB64)

    await expect(verifyPassword('correct horse battery staple', first.saltB64, first.hashB64)).resolves.toBe(true)
    await expect(verifyPassword('wrong password', first.saltB64, first.hashB64)).resolves.toBe(false)
  })

  it('returns false for malformed stored credentials', async () => {
    await expect(verifyPassword('password123', 'not-base64!!!', 'also-bad')).resolves.toBe(false)
  })
})

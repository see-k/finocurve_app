import { describe, expect, it } from 'vitest'
import { maskEnterpriseApiToken } from '../electron/enterpriseHandlers'

describe('maskEnterpriseApiToken', () => {
  it('shows only the last four characters', () => {
    expect(maskEnterpriseApiToken('sk_live_abcdefgh1234')).toBe('••••1234')
  })

  it('discloses nothing for a very short token', () => {
    // Showing the last four of a four-character token would be the whole thing.
    expect(maskEnterpriseApiToken('abcd')).toBe('••••')
    expect(maskEnterpriseApiToken('ab')).toBe('••••')
  })

  it('returns an empty hint when no token is set', () => {
    expect(maskEnterpriseApiToken('')).toBe('')
    expect(maskEnterpriseApiToken('   ')).toBe('')
  })

  it('never returns more than four real characters of the secret', () => {
    const secret = 'A'.repeat(64)
    const masked = maskEnterpriseApiToken(secret)
    expect(masked.replace(/•/g, '').length).toBeLessThanOrEqual(4)
    expect(masked).not.toContain(secret)
  })

  it('ignores surrounding whitespace when deriving the hint', () => {
    expect(maskEnterpriseApiToken('  tok_wxyz  ')).toBe('••••wxyz')
  })
})

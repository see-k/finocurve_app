// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { ACTIVE_SESSION_DATA_KEYS } from './perUserLocalArchive'
import { prepareStorageForNewAccountSignup } from './prepareNewAccountSession'

describe('prepareStorageForNewAccountSignup', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('clears active session keys and signup-specific prefs without touching saved accounts or archives', () => {
    for (const key of ACTIVE_SESSION_DATA_KEYS) {
      localStorage.setItem(key, 'active')
      localStorage.setItem(`${key}:user:existing@test.com`, 'archived')
    }
    localStorage.setItem('finocurve-saved-local-accounts', '[{"email":"existing@test.com"}]')
    localStorage.setItem('finocurve-preferences', '{"theme":"dark"}')
    localStorage.setItem('finocurve-risk-snapshots', '[]')
    localStorage.setItem('finocurve-tracker-goal-expanded-overrides', '{}')
    localStorage.setItem('finocurve-ai-chat-messages-existing@test.com', '[]')

    prepareStorageForNewAccountSignup()

    for (const key of ACTIVE_SESSION_DATA_KEYS) {
      expect(localStorage.getItem(key)).toBeNull()
      expect(localStorage.getItem(`${key}:user:existing@test.com`)).toBe('archived')
    }
    expect(localStorage.getItem('finocurve-saved-local-accounts')).toBe('[{"email":"existing@test.com"}]')
    expect(localStorage.getItem('finocurve-preferences')).toBeNull()
    expect(localStorage.getItem('finocurve-risk-snapshots')).toBeNull()
    expect(localStorage.getItem('finocurve-tracker-goal-expanded-overrides')).toBeNull()
    expect(localStorage.getItem('finocurve-ai-chat-messages-existing@test.com')).toBe('[]')
  })
})

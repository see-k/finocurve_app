// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { prepareStorageForNewAccountSignup } from './prepareNewAccountSession'

describe('prepareStorageForNewAccountSignup', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('clears active session keys and signup-scoped prefs without touching archives or saved accounts', () => {
    localStorage.setItem('finocurve-portfolio', '{"id":"stale"}')
    localStorage.setItem('finocurve-watchlist', '[]')
    localStorage.setItem('finocurve-notifications', '[]')
    localStorage.setItem('finocurve-portfolio-value-history', '[]')
    localStorage.setItem('finocurve-preferences', '{"theme":"dark"}')
    localStorage.setItem('finocurve-risk-snapshots', '[]')
    localStorage.setItem('finocurve-tracker-goal-expanded-overrides', '{}')
    localStorage.setItem('finocurve-saved-local-accounts', '[{"email":"a@test.com"}]')
    localStorage.setItem('finocurve-portfolio:user:a@test.com', '{"id":"archived"}')

    prepareStorageForNewAccountSignup()

    expect(localStorage.getItem('finocurve-portfolio')).toBeNull()
    expect(localStorage.getItem('finocurve-watchlist')).toBeNull()
    expect(localStorage.getItem('finocurve-notifications')).toBeNull()
    expect(localStorage.getItem('finocurve-portfolio-value-history')).toBeNull()
    expect(localStorage.getItem('finocurve-preferences')).toBeNull()
    expect(localStorage.getItem('finocurve-risk-snapshots')).toBeNull()
    expect(localStorage.getItem('finocurve-tracker-goal-expanded-overrides')).toBeNull()
    expect(localStorage.getItem('finocurve-saved-local-accounts')).toBe('[{"email":"a@test.com"}]')
    expect(localStorage.getItem('finocurve-portfolio:user:a@test.com')).toBe('{"id":"archived"}')
  })
})

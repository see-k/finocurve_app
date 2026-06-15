// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  ACTIVE_SESSION_DATA_KEYS,
  archiveActiveSessionForEmail,
  clearActiveUserDataStorage,
  hasArchivedSessionForEmail,
  removeArchivedSessionForEmail,
  restoreActiveSessionForEmail,
} from './perUserLocalArchive'

describe('perUserLocalArchive', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('archives active session keys per email and clears active keys', () => {
    localStorage.setItem('finocurve-portfolio', '{"id":"p1"}')
    localStorage.setItem('finocurve-watchlist', '[]')
    localStorage.setItem('finocurve-notifications', '[]')
    localStorage.setItem('finocurve-portfolio-value-history', '[]')

    archiveActiveSessionForEmail('User@Example.com')

    for (const key of ACTIVE_SESSION_DATA_KEYS) {
      expect(localStorage.getItem(key)).toBeNull()
      expect(localStorage.getItem(`${key}:user:user@example.com`)).not.toBeNull()
    }
  })

  it('detects archived sessions case-insensitively', () => {
    expect(hasArchivedSessionForEmail('a@test.com')).toBe(false)
    localStorage.setItem('finocurve-portfolio:user:a@test.com', '{"id":"p1"}')
    expect(hasArchivedSessionForEmail('A@test.com')).toBe(true)
  })

  it('restores archived session into active keys without touching other profiles', () => {
    localStorage.setItem('finocurve-portfolio:user:a@test.com', '{"id":"a"}')
    localStorage.setItem('finocurve-portfolio:user:b@test.com', '{"id":"b"}')
    localStorage.setItem('finocurve-portfolio', '{"id":"stale"}')

    restoreActiveSessionForEmail('a@test.com')

    expect(localStorage.getItem('finocurve-portfolio')).toBe('{"id":"a"}')
    expect(localStorage.getItem('finocurve-portfolio:user:b@test.com')).toBe('{"id":"b"}')
  })

  it('clears only active session keys, not per-user archives', () => {
    localStorage.setItem('finocurve-portfolio', '{"id":"active"}')
    localStorage.setItem('finocurve-portfolio:user:a@test.com', '{"id":"archived"}')
    localStorage.setItem('finocurve-saved-local-accounts', '[]')

    clearActiveUserDataStorage()

    expect(localStorage.getItem('finocurve-portfolio')).toBeNull()
    expect(localStorage.getItem('finocurve-portfolio:user:a@test.com')).toBe('{"id":"archived"}')
    expect(localStorage.getItem('finocurve-saved-local-accounts')).toBe('[]')
  })

  it('removes archived keys for a single email', () => {
    localStorage.setItem('finocurve-portfolio:user:a@test.com', '{"id":"a"}')
    localStorage.setItem('finocurve-portfolio:user:b@test.com', '{"id":"b"}')

    removeArchivedSessionForEmail('A@test.com')

    expect(localStorage.getItem('finocurve-portfolio:user:a@test.com')).toBeNull()
    expect(localStorage.getItem('finocurve-portfolio:user:b@test.com')).toBe('{"id":"b"}')
  })
})

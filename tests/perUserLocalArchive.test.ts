import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ACTIVE_SESSION_DATA_KEYS,
  archiveActiveSessionForEmail,
  clearActiveUserDataStorage,
  hasArchivedSessionForEmail,
  removeArchivedSessionForEmail,
  restoreActiveSessionForEmail,
} from '../src/lib/perUserLocalArchive'

class MemoryStorage implements Storage {
  private values = new Map<string, string>()

  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, String(value)) }
}

const CONVERSATIONS = 'finocurve-conversations'
const AGENTS = 'finocurve-agents'

beforeEach(() => {
  const storage = new MemoryStorage()
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true })
  // coreDataStorage's mirror path reads window.electronAPI; no bridge in tests.
  Object.defineProperty(globalThis, 'window', { value: { electronAPI: {} }, configurable: true })
})

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'window')
  Reflect.deleteProperty(globalThis, 'localStorage')
})

describe('per-user local archive', () => {
  it('treats chats, agents, and tracker expand overrides as session-scoped keys', () => {
    expect(ACTIVE_SESSION_DATA_KEYS).toContain(CONVERSATIONS)
    expect(ACTIVE_SESSION_DATA_KEYS).toContain(AGENTS)
    expect(ACTIVE_SESSION_DATA_KEYS).toContain('finocurve-tracker-goal-expanded-overrides')
  })

  it('archives chats and agents per email and clears the active keys', () => {
    localStorage.setItem(CONVERSATIONS, '[{"id":"a-chat"}]')
    localStorage.setItem(AGENTS, '[{"id":"a-agent"}]')

    archiveActiveSessionForEmail('A@Example.com')

    // Active keys no longer expose the previous profile's data.
    expect(localStorage.getItem(CONVERSATIONS)).toBeNull()
    expect(localStorage.getItem(AGENTS)).toBeNull()
    // Data is retained under the normalized per-user archive.
    expect(localStorage.getItem(`${CONVERSATIONS}:user:a@example.com`)).toBe('[{"id":"a-chat"}]')
    expect(localStorage.getItem(`${AGENTS}:user:a@example.com`)).toBe('[{"id":"a-agent"}]')
    expect(hasArchivedSessionForEmail('a@example.com')).toBe(true)
  })

  it('does not leak one profile chats/agents into another profile session', () => {
    localStorage.setItem(CONVERSATIONS, '[{"id":"a-chat"}]')
    localStorage.setItem(AGENTS, '[{"id":"a-agent"}]')
    archiveActiveSessionForEmail('a@example.com')

    // Profile B signs in: no archive exists, so start from a clean active state.
    expect(hasArchivedSessionForEmail('b@example.com')).toBe(false)
    clearActiveUserDataStorage()
    restoreActiveSessionForEmail('b@example.com')

    expect(localStorage.getItem(CONVERSATIONS)).toBeNull()
    expect(localStorage.getItem(AGENTS)).toBeNull()

    // Switching back to A restores only A's chats and agents.
    clearActiveUserDataStorage()
    restoreActiveSessionForEmail('a@example.com')
    expect(localStorage.getItem(CONVERSATIONS)).toBe('[{"id":"a-chat"}]')
    expect(localStorage.getItem(AGENTS)).toBe('[{"id":"a-agent"}]')
  })

  it('removes archived chats and agents when an account is deleted', () => {
    localStorage.setItem(CONVERSATIONS, '[{"id":"a-chat"}]')
    localStorage.setItem(AGENTS, '[{"id":"a-agent"}]')
    archiveActiveSessionForEmail('a@example.com')

    removeArchivedSessionForEmail('a@example.com')

    expect(localStorage.getItem(`${CONVERSATIONS}:user:a@example.com`)).toBeNull()
    expect(localStorage.getItem(`${AGENTS}:user:a@example.com`)).toBeNull()
    expect(hasArchivedSessionForEmail('a@example.com')).toBe(false)
  })

  it('clears active chats and agents without touching archives', () => {
    localStorage.setItem(CONVERSATIONS, '[{"id":"a-chat"}]')
    localStorage.setItem(AGENTS, '[{"id":"a-agent"}]')
    archiveActiveSessionForEmail('a@example.com')
    restoreActiveSessionForEmail('a@example.com')

    clearActiveUserDataStorage()

    expect(localStorage.getItem(CONVERSATIONS)).toBeNull()
    expect(localStorage.getItem(AGENTS)).toBeNull()
    // Archive remains for the next sign-in.
    expect(localStorage.getItem(`${CONVERSATIONS}:user:a@example.com`)).toBe('[{"id":"a-chat"}]')
    expect(localStorage.getItem(`${AGENTS}:user:a@example.com`)).toBe('[{"id":"a-agent"}]')
  })
})

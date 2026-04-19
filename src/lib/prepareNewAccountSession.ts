import { clearActiveUserDataStorage } from './perUserLocalArchive'

/**
 * Clears in-progress session data so a new signup starts clean on this device.
 * Does NOT remove:
 * - `finocurve-saved-local-accounts` (saved profile bubbles)
 * - Any `finocurve-*:user:<email>` archived portfolio / watchlist / etc.
 * - Other users' AI chat threads (`finocurve-ai-chat-messages-*` by email id)
 */
const EXTRA_KEYS_ON_NEW_SIGNUP = [
  'finocurve-preferences',
  'finocurve-risk-snapshots',
  'finocurve-tracker-goal-expanded-overrides',
] as const

export function prepareStorageForNewAccountSignup(): void {
  clearActiveUserDataStorage()
  for (const k of EXTRA_KEYS_ON_NEW_SIGNUP) {
    try {
      localStorage.removeItem(k)
    } catch { /* ignore */ }
  }
}

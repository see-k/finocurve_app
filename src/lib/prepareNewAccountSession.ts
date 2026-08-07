import { clearActiveUserDataStorage } from './perUserLocalArchive'
import { clearActiveTrackerSession } from './trackerSessionArchive'

/**
 * Clears in-progress session data so a new signup starts clean on this device.
 * Does NOT remove:
 * - `finocurve-saved-local-accounts` (saved profile bubbles)
 * - Any `finocurve-*:user:<email>` archived portfolio / watchlist / etc.
 * - Other users' AI chat threads (`finocurve-ai-chat-messages-*` by email id)
 * - Other users' archived tracker DBs (`finocurve-tracker.user.<email>.db`)
 */
const EXTRA_KEYS_ON_NEW_SIGNUP = [
  'finocurve-preferences',
  'finocurve-risk-snapshots',
] as const

export function prepareStorageForNewAccountSignup(): void {
  clearActiveUserDataStorage()
  for (const k of EXTRA_KEYS_ON_NEW_SIGNUP) {
    try {
      localStorage.removeItem(k)
    } catch { /* ignore */ }
  }
  // Tracker goals/net-worth live in Electron SQLite — clear the active DB so the
  // new profile does not inherit the previous session's goals.
  void clearActiveTrackerSession()
}

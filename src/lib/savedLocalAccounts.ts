const STORAGE_KEY = 'finocurve-saved-local-accounts'

/**
 * Saved local profile metadata for a device. The "local auth" fields are PBKDF2
 * derivatives (salt + derived key digest + algorithm tag) used only for
 * device-local password verification. They contain no user-supplied secret —
 * the password itself is never stored.
 */
export interface SavedLocalAccount {
  email: string
  userName?: string
  profilePicturePath?: string
  hasCompletedOnboarding: boolean
  updatedAt: string
  /** PBKDF2 salt (base64). Salts are non-secret by design. */
  localAuthSaltB64?: string
  /** PBKDF2 derived-key digest (base64). Used to verify local password input. */
  localAuthDigestB64?: string
  /** Algorithm tag (e.g. `pbkdf2-sha256-210k`). */
  localAuthKdf?: string
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function readStr(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined
}

export function loadSavedLocalAccounts(): SavedLocalAccount[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (x): x is SavedLocalAccount =>
          !!x &&
          typeof x === 'object' &&
          typeof (x as SavedLocalAccount).email === 'string' &&
          (x as SavedLocalAccount).email.trim().length > 0,
      )
      .map(x => {
        return {
          email: x.email.trim(),
          userName: readStr(x.userName),
          profilePicturePath: readStr(x.profilePicturePath),
          hasCompletedOnboarding: !!x.hasCompletedOnboarding,
          updatedAt: readStr(x.updatedAt) ?? new Date(0).toISOString(),
          localAuthSaltB64: readStr(x.localAuthSaltB64),
          localAuthDigestB64: readStr(x.localAuthDigestB64),
          localAuthKdf: readStr(x.localAuthKdf),
        }
      })
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
  } catch {
    return []
  }
}

export function getSavedLocalAccount(email: string): SavedLocalAccount | undefined {
  const key = normalizeEmail(email)
  return loadSavedLocalAccounts().find(a => normalizeEmail(a.email) === key)
}

export function upsertSavedLocalAccount(partial: {
  email: string
  userName?: string
  profilePicturePath?: string
  hasCompletedOnboarding: boolean
  localAuthSaltB64?: string
  localAuthDigestB64?: string
  localAuthKdf?: string
}): void {
  const email = partial.email.trim()
  if (!email) return
  const now = new Date().toISOString()
  const existing = loadSavedLocalAccounts()
  const key = normalizeEmail(email)
  const idx = existing.findIndex(a => normalizeEmail(a.email) === key)
  const next: SavedLocalAccount = {
    email,
    userName: partial.userName,
    profilePicturePath: partial.profilePicturePath,
    hasCompletedOnboarding: partial.hasCompletedOnboarding,
    updatedAt: now,
    ...(partial.localAuthSaltB64 !== undefined ? { localAuthSaltB64: partial.localAuthSaltB64 } : {}),
    ...(partial.localAuthDigestB64 !== undefined ? { localAuthDigestB64: partial.localAuthDigestB64 } : {}),
    ...(partial.localAuthKdf !== undefined ? { localAuthKdf: partial.localAuthKdf } : {}),
  }
  if (idx >= 0) {
    existing[idx] = { ...existing[idx], ...next }
  } else {
    existing.unshift(next)
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing))
  } catch { /* ignore */ }
}

export function removeSavedLocalAccount(email: string): void {
  const key = normalizeEmail(email)
  const filtered = loadSavedLocalAccounts().filter(a => normalizeEmail(a.email) !== key)
  try {
    if (filtered.length === 0) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered))
  } catch { /* ignore */ }
}

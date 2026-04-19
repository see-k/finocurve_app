const STORAGE_KEY = 'finocurve-saved-local-accounts'

export interface SavedLocalAccount {
  email: string
  userName?: string
  profilePicturePath?: string
  hasCompletedOnboarding: boolean
  updatedAt: string
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
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
      .map(x => ({
        email: (x as SavedLocalAccount).email.trim(),
        userName: typeof x.userName === 'string' ? x.userName : undefined,
        profilePicturePath:
          typeof x.profilePicturePath === 'string' ? x.profilePicturePath : undefined,
        hasCompletedOnboarding: !!(x as SavedLocalAccount).hasCompletedOnboarding,
        updatedAt: typeof x.updatedAt === 'string' ? x.updatedAt : new Date(0).toISOString(),
      }))
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

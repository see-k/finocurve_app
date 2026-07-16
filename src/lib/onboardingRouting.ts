import type { UserPreferences } from '../types'
import { getCoreDataItem, PORTFOLIO_STORAGE_KEY } from './coreDataStorage'

/** Portfolio JSON saved under finocurve-portfolio — used to infer returning users. */
export function hasPersistedPortfolio(): boolean {
  try {
    const raw = getCoreDataItem(PORTFOLIO_STORAGE_KEY)
    if (!raw) return false
    const p = JSON.parse(raw) as { id?: unknown; name?: unknown; assets?: unknown }
    return (
      typeof p?.id === 'string' &&
      typeof p?.name === 'string' &&
      p.name.trim().length > 0 &&
      Array.isArray(p.assets)
    )
  } catch {
    return false
  }
}

export function shouldEnterMainAfterSignIn(
  prefs: Partial<UserPreferences>,
  savedForEmail?: { hasCompletedOnboarding?: boolean } | null,
): boolean {
  if (prefs.hasCompletedOnboarding) return true
  if (savedForEmail?.hasCompletedOnboarding) return true
  if (hasPersistedPortfolio()) return true
  return false
}

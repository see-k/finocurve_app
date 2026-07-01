import { DEFAULT_PREFS } from '../store/usePreferences'
import type { UserPreferences } from '../types'
import { normalizeStoredTheme } from '../theme/themes'
import type { SavedLocalAccount } from './savedLocalAccounts'
import { shouldEnterMainAfterSignIn } from './onboardingRouting'
import {
  clearActiveUserDataStorage,
  hasArchivedSessionForEmail,
  restoreActiveSessionForEmail,
} from './perUserLocalArchive'

/** Avatar initials for saved-account bubbles on the login screen. */
export function initialsFromName(name: string, email: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase().slice(0, 2)
  }
  if (parts.length === 1 && parts[0].length >= 2) {
    return parts[0].slice(0, 2).toUpperCase()
  }
  const local = email.split('@')[0] || email
  return local.slice(0, 2).toUpperCase() || '?'
}

export function buildSignInPreferences(
  email: string,
  saved: Pick<SavedLocalAccount, 'userName' | 'profilePicturePath' | 'hasCompletedOnboarding'>,
  existingRaw?: string | null,
): { preferences: UserPreferences; goMain: boolean } {
  let parsed: Partial<UserPreferences> = {}
  try {
    if (existingRaw) parsed = JSON.parse(existingRaw) as Partial<UserPreferences>
  } catch {
    /* ignore malformed prefs */
  }
  const theme = normalizeStoredTheme(typeof parsed.theme === 'string' ? parsed.theme : null)
  const merged: UserPreferences = {
    ...DEFAULT_PREFS,
    ...parsed,
    theme,
  }
  merged.userEmail = email.trim()
  if (saved.userName) merged.userName = saved.userName
  if (saved.profilePicturePath) merged.profilePicturePath = saved.profilePicturePath
  const goMain = shouldEnterMainAfterSignIn(merged, saved)
  merged.hasCompletedOnboarding = goMain
  return { preferences: merged, goMain }
}

/**
 * Switches the active localStorage session on sign-in without bleeding another
 * profile's data into the selected account.
 */
export function switchActiveSessionForSignIn(email: string): void {
  if (hasArchivedSessionForEmail(email)) {
    clearActiveUserDataStorage()
    restoreActiveSessionForEmail(email)
  } else {
    clearActiveUserDataStorage()
  }
}

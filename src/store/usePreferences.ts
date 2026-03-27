import { useState, useEffect, useCallback } from 'react'
import type { UserPreferences } from '../types'
import { normalizeStoredTheme } from '../theme/themes'

const STORAGE_KEY = 'finocurve-preferences'

const DEFAULT_PREFS: UserPreferences = {
  hasCompletedOnboarding: false,
  isGuest: false,
  selectedAssetTypes: [],
  preferredDataEntry: 'manual',
  defaultCurrency: 'USD',
  theme: 'dark-graphite',
  hasAgreedToTerms: false,
  notificationsEnabled: true,
  priceAlerts: true,
  portfolioUpdates: true,
  marketNews: false,
  trackerS3AutoBackup: false,
  trackerS3AutoSync: false,
}

function loadPreferences(): UserPreferences {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<UserPreferences>
      const theme = normalizeStoredTheme(
        typeof parsed.theme === 'string' ? parsed.theme : null,
      )
      return { ...DEFAULT_PREFS, ...parsed, theme }
    }
  } catch { /* ignore */ }
  return DEFAULT_PREFS
}

function savePreferences(prefs: UserPreferences) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)) } catch { /* ignore */ }
}

export function usePreferences() {
  const [prefs, setPrefs] = useState<UserPreferences>(loadPreferences)

  useEffect(() => { savePreferences(prefs) }, [prefs])

  const updatePreferences = useCallback((updates: Partial<UserPreferences>) => {
    setPrefs(prev => ({ ...prev, ...updates }))
  }, [])

  const completeOnboarding = useCallback(() => {
    setPrefs(prev => ({ ...prev, hasCompletedOnboarding: true }))
  }, [])

  const resetPreferences = useCallback(() => {
    setPrefs(DEFAULT_PREFS)
    localStorage.removeItem(STORAGE_KEY)
  }, [])

  return { prefs, updatePreferences, completeOnboarding, resetPreferences }
}

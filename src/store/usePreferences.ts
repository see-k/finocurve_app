import { useState, useEffect, useCallback } from 'react'
import type { UserPreferences } from '../types'

const STORAGE_KEY = 'finocurve-preferences'

const DEFAULT_PREFS: UserPreferences = {
  hasCompletedOnboarding: false,
  isGuest: false,
  selectedAssetTypes: [],
  preferredDataEntry: 'manual',
  defaultCurrency: 'USD',
  theme: 'dark',
  hasAgreedToTerms: false,
  notificationsEnabled: true,
  priceAlerts: true,
  portfolioUpdates: true,
  marketNews: false,
}

function loadPreferences(): UserPreferences {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return { ...DEFAULT_PREFS, ...JSON.parse(stored) }
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

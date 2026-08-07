import { useState, useEffect, useCallback, useRef } from 'react'
import type { NetWorthEntry, TrackerGoal } from '../types'
import { usePreferences } from '../store/usePreferences'

export interface TrackerSyncInfo {
  lastPushedAt: string | null
  lastPulledAt: string | null
  lastRemoteUpdatedAt: string | null
  lastLocalMutationAt: string | null
  lastBackupError: string | null
  lastSyncError: string | null
  s3Options: { autoBackup: boolean; autoSync: boolean }
}

export interface TrackerState {
  netWorthEntries: NetWorthEntry[]
  goals: TrackerGoal[]
  latestNetWorth: number | null
  sync: TrackerSyncInfo
}

const emptyState: TrackerState = {
  netWorthEntries: [],
  goals: [],
  latestNetWorth: null,
  sync: {
    lastPushedAt: null,
    lastPulledAt: null,
    lastRemoteUpdatedAt: null,
    lastLocalMutationAt: null,
    lastBackupError: null,
    lastSyncError: null,
    s3Options: { autoBackup: false, autoSync: false },
  },
}

/** Stable id for the signed-in profile; tracker DB is swapped per identity on sign-in/out. */
function currentIdentity(userEmail?: string, isGuest?: boolean): string {
  const email = userEmail?.trim().toLowerCase()
  if (email) return email
  return isGuest ? 'guest' : 'local'
}

export function useTracker() {
  const { prefs } = usePreferences()
  const identity = currentIdentity(prefs.userEmail, prefs.isGuest)
  const [state, setState] = useState<TrackerState>(emptyState)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const lastHandledIdentityRef = useRef<string | null>(null)

  const refresh = useCallback(async () => {
    const api = window.electronAPI
    if (!api?.trackerGetState) {
      setLoading(false)
      setError('Tracker is available in the desktop app.')
      return
    }
    try {
      setError(null)
      const raw = await api.trackerGetState()
      setState({
        netWorthEntries: raw.netWorthEntries.map((e) => ({
          id: e.id,
          amount: e.amount,
          recordedAt: e.recordedAt,
          source: e.source,
          note: e.note,
        })),
        goals: raw.goals.map((g) => ({
          id: g.id,
          title: g.title,
          targetAmount: g.targetAmount,
          baselineAmount: g.baselineAmount,
          createdAt: g.createdAt,
          targetDate: g.targetDate,
          progressSource: g.progressSource ?? 'net_worth',
        })),
        latestNetWorth: raw.latestNetWorth,
        sync: raw.sync,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load tracker')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // When the signed-in profile changes, the active tracker DB has already been
    // swapped by archive/restore. Reload so we never keep showing the previous
    // profile's goals/net-worth in memory.
    if (lastHandledIdentityRef.current !== identity) {
      lastHandledIdentityRef.current = identity
      setState(emptyState)
      setLoading(true)
    }
    void refresh()
  }, [identity, refresh])

  return { ...state, loading, error, refresh }
}

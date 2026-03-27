import { useState, useEffect, useCallback } from 'react'
import type { NetWorthEntry, TrackerGoal } from '../types'

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

export function useTracker() {
  const [state, setState] = useState<TrackerState>(emptyState)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
    void refresh()
  }, [refresh])

  return { ...state, loading, error, refresh }
}

import { ipcMain } from 'electron'
import {
  listNetWorthEntries,
  appendNetWorthEntry,
  deleteNetWorthEntry,
  updateNetWorthEntry,
  listGoals,
  createGoal,
  updateGoal,
  deleteGoal,
  getLatestNetWorthAmount,
} from './tracker/repository'
import {
  loadTrackerS3Options,
  saveTrackerS3Options,
  loadSyncMeta,
  performTrackerBackup,
  performTrackerSyncPull,
  touchLocalMutation,
  ensureLocalMutationFromFileMtime,
  type TrackerS3Options,
} from './trackerS3'

let lastSyncError: string | null = null
let lastBackupError: string | null = null
let backupDebounceTimer: ReturnType<typeof setTimeout> | null = null

function scheduleDebouncedBackup(): void {
  const opts = loadTrackerS3Options()
  if (!opts.autoBackup) return
  if (backupDebounceTimer) clearTimeout(backupDebounceTimer)
  backupDebounceTimer = setTimeout(() => {
    backupDebounceTimer = null
    void performTrackerBackup().then((r) => {
      lastBackupError = r.ok ? null : (r.error ?? 'backup_failed')
    })
  }, 3500)
}

function afterMutation(): void {
  touchLocalMutation()
  scheduleDebouncedBackup()
}

export function registerTrackerHandlers(): void {
  ipcMain.handle('tracker-get-state', async () => {
    ensureLocalMutationFromFileMtime()
    const netWorthEntries = listNetWorthEntries().map((r) => ({
      id: r.id,
      amount: r.amount,
      recordedAt: r.recordedAt,
      source: r.source,
      note: r.note,
    }))
    const goals = listGoals().map((g) => ({
      id: g.id,
      title: g.title,
      targetAmount: g.targetAmount,
      baselineAmount: g.baselineAmount,
      createdAt: g.createdAt,
      targetDate: g.targetDate,
      progressSource: g.progressSource,
    }))
    const meta = loadSyncMeta()
    return {
      netWorthEntries,
      goals,
      latestNetWorth: getLatestNetWorthAmount(),
      sync: {
        lastPushedAt: meta.lastPushedAt,
        lastPulledAt: meta.lastPulledAt,
        lastRemoteUpdatedAt: meta.lastRemoteUpdatedAt,
        lastLocalMutationAt: meta.lastLocalMutationAt,
        lastBackupError,
        lastSyncError,
        s3Options: loadTrackerS3Options(),
      },
    }
  })

  ipcMain.handle(
    'tracker-append-net-worth',
    async (
      _e,
      payload: { amount: number; recordedAt?: string; note?: string | null; source: 'manual' | 'ai' }
    ) => {
      const row = appendNetWorthEntry({
        amount: payload.amount,
        recordedAt: payload.recordedAt,
        note: payload.note,
        source: payload.source,
      })
      afterMutation()
      return { entry: row }
    }
  )

  ipcMain.handle('tracker-delete-net-worth', async (_e, id: string) => {
    const ok = deleteNetWorthEntry(id)
    if (ok) afterMutation()
    return { ok }
  })

  ipcMain.handle(
    'tracker-update-net-worth',
    async (
      _e,
      payload: { id: string; amount: number; note?: string | null; recordedAt: string }
    ) => {
      const row = updateNetWorthEntry(payload.id, {
        amount: payload.amount,
        note: payload.note,
        recordedAt: payload.recordedAt,
      })
      if (row) afterMutation()
      return { entry: row }
    }
  )

  ipcMain.handle(
    'tracker-create-goal',
    async (
      _e,
      payload: {
        title: string
        targetAmount: number
        targetDate?: string | null
        progressSource: 'net_worth' | 'portfolio_balance' | 'debt_loans' | 'risk_score'
        baselineAmount: number
      }
    ) => {
      const g = createGoal(payload)
      afterMutation()
      return { goal: g }
    }
  )

  ipcMain.handle(
    'tracker-update-goal',
    async (
      _e,
      payload: {
        id: string
        title: string
        targetAmount: number
        targetDate: string | null
        progressSource: 'net_worth' | 'portfolio_balance' | 'debt_loans' | 'risk_score'
        baselineAmount: number
      }
    ) => {
      const g = updateGoal(payload.id, {
        title: payload.title,
        targetAmount: payload.targetAmount,
        targetDate: payload.targetDate,
        progressSource: payload.progressSource,
        baselineAmount: payload.baselineAmount,
      })
      if (g) afterMutation()
      return { goal: g }
    }
  )

  ipcMain.handle('tracker-delete-goal', async (_e, id: string) => {
    const ok = deleteGoal(id)
    if (ok) afterMutation()
    return { ok }
  })

  ipcMain.handle('tracker-set-s3-options', async (_e, opts: TrackerS3Options) => {
    saveTrackerS3Options({
      autoBackup: !!opts.autoBackup,
      autoSync: !!opts.autoSync,
    })
    return { ok: true }
  })

  ipcMain.handle('tracker-backup-now', async () => {
    const r = await performTrackerBackup(true)
    lastBackupError = r.ok ? null : (r.error ?? 'backup_failed')
    return r
  })

  ipcMain.handle('tracker-sync-now', async () => {
    lastSyncError = null
    const r = await performTrackerSyncPull(true)
    if (!r.ok && r.reason && r.reason !== 'local_newer_or_equal' && r.reason !== 'sync_disabled') {
      lastSyncError = r.reason
    }
    return r
  })

  ipcMain.handle('tracker-run-startup-sync', async () => {
    ensureLocalMutationFromFileMtime()
    lastSyncError = null
    const opts = loadTrackerS3Options()
    if (!opts.autoSync) return { ok: false, reason: 'sync_disabled' }
    const r = await performTrackerSyncPull()
    if (!r.ok && r.reason && r.reason !== 'local_newer_or_equal') {
      lastSyncError = r.reason ?? null
    }
    return r
  })
}

/** For AI tools — append net worth with source ai */
export async function trackerAppendNetWorthAI(args: {
  amount: number
  note?: string
  recordedAt?: string
}): Promise<string> {
  appendNetWorthEntry({
    amount: args.amount,
    note: args.note ?? null,
    recordedAt: args.recordedAt,
    source: 'ai',
  })
  afterMutation()
  return `Logged net worth entry: $${args.amount.toLocaleString()}${args.note ? ` (${args.note})` : ''}.`
}

export async function trackerGetNetWorthLogSummary(): Promise<string> {
  const rows = listNetWorthEntries()
  if (rows.length === 0) {
    return 'No net worth entries logged yet in Tracker. Portfolio value in the app is separate from logged net worth.'
  }
  const latest = rows[rows.length - 1]
  const lines = rows.slice(-20).map(
    (r) =>
      `- ${r.recordedAt}: $${r.amount.toLocaleString()} (${r.source})${r.note ? ` — ${r.note}` : ''}`
  )
  return `[Source: FinoCurve Tracker — user-logged net worth]\nLatest: $${latest.amount.toLocaleString()} at ${latest.recordedAt}\nRecent entries (up to 20):\n${lines.join('\n')}`
}

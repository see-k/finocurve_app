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
import type { PortfolioContext } from '../src/ai/types'
import {
  currentValueForGoalSourceFromContext,
  goalProgressPercentForSummary,
  naturalBaselineForGoalSource,
  normalizeGoalProgressSource,
  type GoalProgressSource,
} from './tracker/goalBaselineContext'

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

function formatMoney(n: number): string {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}

function sourceLabel(s: GoalProgressSource): string {
  switch (s) {
    case 'portfolio_balance':
      return 'portfolio holdings value'
    case 'debt_loans':
      return 'total loan balances'
    case 'risk_score':
      return 'risk score (0–100)'
    default:
      return 'logged net worth'
  }
}

/** For AI tools — list Tracker goals with approximate progress using cached portfolio + latest NW. */
export async function trackerGetGoalsSummary(portfolio: PortfolioContext | null): Promise<string> {
  const goals = listGoals()
  const latestNw = getLatestNetWorthAmount()
  if (goals.length === 0) {
    return 'No Tracker goals yet. The user can add goals in the Tracker tab or you can create one with create_tracker_goal.'
  }
  const lines = goals.map((g) => {
    const src = normalizeGoalProgressSource(g.progressSource)
    const cur = currentValueForGoalSourceFromContext(src, latestNw, portfolio)
    const pct =
      cur === null
        ? null
        : goalProgressPercentForSummary(
            { baselineAmount: g.baselineAmount, targetAmount: g.targetAmount },
            cur
          )
    const curStr =
      cur === null
        ? 'unavailable (portfolio not synced with risk score — keep the app open or revisit Portfolio so the assistant receives the same risk as the Tracker tab)'
        : src === 'risk_score'
          ? `${cur.toFixed(1)}`
          : src === 'portfolio_balance' || src === 'debt_loans' || src === 'net_worth'
            ? formatMoney(cur)
            : String(cur)
    const pctStr = pct != null ? `${pct.toFixed(1)}%` : 'n/a'
    const tgtStr =
      src === 'risk_score' ? g.targetAmount.toFixed(1) : formatMoney(g.targetAmount)
    const baseStr =
      src === 'risk_score' ? g.baselineAmount.toFixed(1) : formatMoney(g.baselineAmount)
    return `- "${g.title}" (id ${g.id})
  metric: ${sourceLabel(src)} | baseline ${baseStr} → target ${tgtStr}${g.targetDate ? ` by ${g.targetDate}` : ''}
  current (approx.): ${curStr} | progress: ${pctStr}`
  })
  return `[Source: FinoCurve Tracker — goals]\n${lines.join('\n')}`
}

/** For AI tools — create a Tracker goal; baseline follows the same rules as the in-app UI. */
export async function trackerCreateGoalAI(args: {
  title: string
  targetAmount: number
  targetDate?: string | null
  progressSource?: string | null
  portfolio: PortfolioContext | null
}): Promise<string> {
  const title = args.title.trim()
  if (!title || title.length > 200) {
    return 'Title is required and must be at most 200 characters.'
  }
  const targetAmount = args.targetAmount
  if (!Number.isFinite(targetAmount)) {
    return 'target_amount must be a finite number.'
  }
  const source = normalizeGoalProgressSource(args.progressSource)
  const latestNw = getLatestNetWorthAmount()
  const liveMetric = currentValueForGoalSourceFromContext(source, latestNw, args.portfolio)
  const live = liveMetric ?? 0
  const baseline = naturalBaselineForGoalSource(source, live)
  const minSpan = source === 'risk_score' ? 0.05 : 0.01
  if (Math.abs(targetAmount - baseline) < minSpan) {
    return `Target must differ from the starting baseline (${source === 'risk_score' ? baseline.toFixed(1) : formatMoney(baseline)}) for this metric. Choose a distinct target.`
  }
  if (source === 'risk_score') {
    if (targetAmount < 0 || targetAmount > 100) {
      return 'For risk_score goals, target_amount should be between 0 and 100.'
    }
  }
  if (source === 'net_worth' && latestNw == null) {
    return 'No logged net worth yet. Log net worth with add_net_worth_entry first, or use progress_source portfolio_balance, debt_loans, or risk_score.'
  }
  const row = createGoal({
    title,
    targetAmount,
    targetDate: args.targetDate?.trim() ? args.targetDate.trim() : null,
    progressSource: source,
    baselineAmount: baseline,
  })
  afterMutation()
  const tgtDisp = source === 'risk_score' ? row.targetAmount.toFixed(1) : formatMoney(row.targetAmount)
  const baseDisp = source === 'risk_score' ? row.baselineAmount.toFixed(1) : formatMoney(row.baselineAmount)
  return `Created Tracker goal "${row.title}" (${sourceLabel(source)}): baseline ${baseDisp} → target ${tgtDisp}${row.targetDate ? ` by ${row.targetDate}` : ''}. id=${row.id}`
}

function resolveGoalTargetDateUpdate(
  incoming: string | null | undefined,
  existing: string | null
): string | null {
  if (incoming === undefined) return existing
  const t = typeof incoming === 'string' ? incoming.trim() : ''
  if (incoming === null || t === '') return null
  return t
}

/** For AI tools — update a Tracker goal; baseline is recomputed only when progress_source changes (same as UI). */
export async function trackerUpdateGoalAI(args: {
  goalId: string
  title?: string
  targetAmount?: number
  targetDate?: string | null
  progressSource?: string | null
  portfolio: PortfolioContext | null
}): Promise<string> {
  const id = args.goalId.trim()
  if (!id) return 'goal_id is required (use get_tracker_goals to copy the id).'

  const existing = listGoals().find((g) => g.id === id)
  if (!existing) return `No goal found with id ${id}. Use get_tracker_goals to list valid ids.`

  const hasFieldUpdate =
    args.title !== undefined ||
    args.targetAmount !== undefined ||
    args.targetDate !== undefined ||
    args.progressSource !== undefined
  if (!hasFieldUpdate) {
    return 'Provide at least one of: title, target_amount, target_date, or progress_source to change.'
  }

  const prevSource = normalizeGoalProgressSource(existing.progressSource)
  const newTitle = args.title !== undefined ? args.title.trim() : existing.title
  if (!newTitle || newTitle.length > 200) {
    return 'Title must be non-empty and at most 200 characters.'
  }

  const newTarget = args.targetAmount !== undefined ? args.targetAmount : existing.targetAmount
  if (!Number.isFinite(newTarget)) {
    return 'target_amount must be a finite number when provided.'
  }

  const newSource =
    args.progressSource !== undefined && args.progressSource !== null
      ? normalizeGoalProgressSource(args.progressSource)
      : prevSource

  const newTargetDate = resolveGoalTargetDateUpdate(args.targetDate, existing.targetDate)

  const sourceChanged = newSource !== prevSource
  const latestNw = getLatestNetWorthAmount()
  const liveMetric = currentValueForGoalSourceFromContext(newSource, latestNw, args.portfolio)
  const live = liveMetric ?? 0
  const baselineAmount = sourceChanged ? naturalBaselineForGoalSource(newSource, live) : existing.baselineAmount

  if (newSource === 'net_worth' && sourceChanged && latestNw == null) {
    return 'Cannot switch this goal to net_worth: no logged net worth yet. Log net worth first or choose another progress_source.'
  }

  const minSpan = newSource === 'risk_score' ? 0.05 : 0.01
  if (Math.abs(newTarget - baselineAmount) < minSpan) {
    return `Target must differ from the baseline (${newSource === 'risk_score' ? baselineAmount.toFixed(1) : formatMoney(baselineAmount)}) for this metric.`
  }
  if (newSource === 'risk_score') {
    if (newTarget < 0 || newTarget > 100) {
      return 'For risk_score goals, target_amount should be between 0 and 100.'
    }
  }

  const row = updateGoal(id, {
    title: newTitle,
    targetAmount: newTarget,
    targetDate: newTargetDate,
    progressSource: newSource,
    baselineAmount,
  })
  if (!row) return `Could not update goal ${id}.`
  afterMutation()

  const tgtDisp = newSource === 'risk_score' ? row.targetAmount.toFixed(1) : formatMoney(row.targetAmount)
  const baseDisp = newSource === 'risk_score' ? row.baselineAmount.toFixed(1) : formatMoney(row.baselineAmount)
  const dateBit = row.targetDate ? ` by ${row.targetDate}` : ''
  return `Updated Tracker goal "${row.title}" (${sourceLabel(newSource)}): baseline ${baseDisp} → target ${tgtDisp}${dateBit}. id=${row.id}${sourceChanged ? ' (progress metric changed; baseline reset like the Tracker tab.)' : ''}`
}

import { randomUUID } from 'node:crypto'
import { getTrackerDb } from './db'

export interface NetWorthRow {
  id: string
  amount: number
  recordedAt: string
  source: 'manual' | 'ai'
  note: string | null
}

export type TrackerGoalProgressSourceRow =
  | 'net_worth'
  | 'portfolio_balance'
  | 'debt_loans'
  | 'risk_score'

export interface TrackerGoalRow {
  id: string
  title: string
  targetAmount: number
  baselineAmount: number
  createdAt: string
  targetDate: string | null
  progressSource: TrackerGoalProgressSourceRow
}

export function listNetWorthEntries(): NetWorthRow[] {
  const db = getTrackerDb()
  const rows = db
    .prepare(
      `SELECT id, amount, recorded_at as recordedAt, source, note FROM net_worth_entries ORDER BY recorded_at ASC`
    )
    .all() as NetWorthRow[]
  return rows
}

export function appendNetWorthEntry(input: {
  amount: number
  recordedAt?: string
  source: 'manual' | 'ai'
  note?: string | null
}): NetWorthRow {
  const db = getTrackerDb()
  const id = randomUUID()
  const recordedAt = input.recordedAt ?? new Date().toISOString()
  const note = input.note?.trim() ? input.note.trim() : null
  db.prepare(
    `INSERT INTO net_worth_entries (id, amount, recorded_at, source, note) VALUES (?, ?, ?, ?, ?)`
  ).run(id, input.amount, recordedAt, input.source, note)
  return {
    id,
    amount: input.amount,
    recordedAt,
    source: input.source,
    note,
  }
}

export function deleteNetWorthEntry(id: string): boolean {
  const db = getTrackerDb()
  const r = db.prepare(`DELETE FROM net_worth_entries WHERE id = ?`).run(id)
  return r.changes > 0
}

export function updateNetWorthEntry(
  id: string,
  input: { amount: number; note?: string | null; recordedAt: string }
): NetWorthRow | null {
  const db = getTrackerDb()
  const existing = db
    .prepare(`SELECT id, amount, recorded_at as recordedAt, source, note FROM net_worth_entries WHERE id = ?`)
    .get(id) as NetWorthRow | undefined
  if (!existing) return null
  const note = input.note?.trim() ? input.note.trim() : null
  db.prepare(`UPDATE net_worth_entries SET amount = ?, recorded_at = ?, note = ? WHERE id = ?`).run(
    input.amount,
    input.recordedAt,
    note,
    id
  )
  return {
    id,
    amount: input.amount,
    recordedAt: input.recordedAt,
    source: existing.source,
    note,
  }
}

export function listGoals(): TrackerGoalRow[] {
  const db = getTrackerDb()
  return db
    .prepare(
      `SELECT id, title, target_amount as targetAmount, baseline_amount as baselineAmount, created_at as createdAt, target_date as targetDate, progress_source as progressSource FROM tracker_goals ORDER BY created_at DESC`
    )
    .all() as TrackerGoalRow[]
}

export function getLatestNetWorthAmount(): number | null {
  const db = getTrackerDb()
  const row = db
    .prepare(`SELECT amount FROM net_worth_entries ORDER BY recorded_at DESC LIMIT 1`)
    .get() as { amount: number } | undefined
  return row ? row.amount : null
}

export function isTrackerEmpty(): boolean {
  const db = getTrackerDb()
  const nw = db.prepare(`SELECT COUNT(*) as c FROM net_worth_entries`).get() as { c: number }
  const g = db.prepare(`SELECT COUNT(*) as c FROM tracker_goals`).get() as { c: number }
  return nw.c === 0 && g.c === 0
}

function normalizeGoalSource(s: string): TrackerGoalProgressSourceRow {
  if (s === 'portfolio_balance' || s === 'debt_loans' || s === 'risk_score') return s
  return 'net_worth'
}

export function createGoal(input: {
  title: string
  targetAmount: number
  targetDate?: string | null
  progressSource: TrackerGoalProgressSourceRow
  baselineAmount: number
}): TrackerGoalRow {
  const db = getTrackerDb()
  const id = randomUUID()
  const createdAt = new Date().toISOString()
  const targetDate = input.targetDate?.trim() ? input.targetDate.trim() : null
  const progressSource = normalizeGoalSource(input.progressSource)
  db.prepare(
    `INSERT INTO tracker_goals (id, title, target_amount, baseline_amount, created_at, target_date, progress_source) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.title.trim(),
    input.targetAmount,
    input.baselineAmount,
    createdAt,
    targetDate,
    progressSource
  )
  return {
    id,
    title: input.title.trim(),
    targetAmount: input.targetAmount,
    baselineAmount: input.baselineAmount,
    createdAt,
    targetDate,
    progressSource,
  }
}

export function updateGoal(
  id: string,
  input: {
    title: string
    targetAmount: number
    targetDate: string | null
    progressSource: TrackerGoalProgressSourceRow
    baselineAmount: number
  }
): TrackerGoalRow | null {
  const db = getTrackerDb()
  const existing = db.prepare(`SELECT id FROM tracker_goals WHERE id = ?`).get(id) as { id: string } | undefined
  if (!existing) return null
  const progressSource = normalizeGoalSource(input.progressSource)
  const targetDate = input.targetDate?.trim() ? input.targetDate.trim() : null
  db.prepare(
    `UPDATE tracker_goals SET title = ?, target_amount = ?, target_date = ?, progress_source = ?, baseline_amount = ? WHERE id = ?`
  ).run(
    input.title.trim(),
    input.targetAmount,
    targetDate,
    progressSource,
    input.baselineAmount,
    id
  )
  return db
    .prepare(
      `SELECT id, title, target_amount as targetAmount, baseline_amount as baselineAmount, created_at as createdAt, target_date as targetDate, progress_source as progressSource FROM tracker_goals WHERE id = ?`
    )
    .get(id) as TrackerGoalRow
}

export function deleteGoal(id: string): boolean {
  const db = getTrackerDb()
  const r = db.prepare(`DELETE FROM tracker_goals WHERE id = ?`).run(id)
  return r.changes > 0
}

/**
 * Per-email archive/restore for the Tracker SQLite DB (goals + net worth).
 * Closes the live DB handle, then delegates to pure file ops.
 */
import { app } from 'electron'
import { closeTrackerDb } from './db'
import {
  archiveTrackerSessionAt,
  clearActiveTrackerSessionAt,
  hasArchivedTrackerSessionAt,
  removeArchivedTrackerSessionAt,
  restoreTrackerSessionAt,
} from './sessionArchiveFiles'

function userData(): string {
  return app.getPath('userData')
}

/** Copy active tracker DB into a per-email archive, then clear the active files. */
export function archiveTrackerSessionForEmail(email: string): void {
  closeTrackerDb()
  archiveTrackerSessionAt(userData(), email)
}

export function hasArchivedTrackerSessionForEmail(email: string): boolean {
  return hasArchivedTrackerSessionAt(userData(), email)
}

/** Restore a per-email archive into the active path (clears active first). */
export function restoreTrackerSessionForEmail(email: string): void {
  closeTrackerDb()
  restoreTrackerSessionAt(userData(), email)
}

/** Remove a profile's archived tracker DB (e.g. delete account). */
export function removeArchivedTrackerSessionForEmail(email: string): void {
  removeArchivedTrackerSessionAt(userData(), email)
}

/** Clear the active tracker DB without touching per-email archives. */
export function clearActiveTrackerSession(): void {
  closeTrackerDb()
  clearActiveTrackerSessionAt(userData())
}

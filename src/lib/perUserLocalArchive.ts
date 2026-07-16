/**
 * Per-email snapshots of session-scoped localStorage so sign-out can clear the active
 * keys while preserving data for the next sign-in on this device.
 */
import { getCoreDataItem, removeCoreDataItem, setCoreDataItem } from './coreDataStorage'

/** Active-session keys (not per-user archives `*:user:*`). */
export const ACTIVE_SESSION_DATA_KEYS = [
  'finocurve-portfolio',
  'finocurve-watchlist',
  'finocurve-notifications',
  'finocurve-portfolio-value-history',
] as const

const ACTIVE_KEYS = ACTIVE_SESSION_DATA_KEYS

function suffix(email: string): string {
  return email.trim().toLowerCase()
}

function archivedKey(activeKey: string, email: string): string {
  return `${activeKey}:user:${suffix(email)}`
}

/** Copy active session keys into per-user archives, then remove active keys. */
export function archiveActiveSessionForEmail(email: string): void {
  const em = email.trim()
  if (!em) return
  for (const active of ACTIVE_KEYS) {
    const v = getCoreDataItem(active)
    if (v != null && v !== '') {
      try {
        setCoreDataItem(archivedKey(active, em), v)
      } catch { /* ignore quota */ }
    }
    try {
      removeCoreDataItem(active)
    } catch { /* ignore */ }
  }
}

/** True when at least one archived session key exists for the email. */
export function hasArchivedSessionForEmail(email: string): boolean {
  const em = email.trim()
  if (!em) return false
  for (const active of ACTIVE_KEYS) {
    const v = getCoreDataItem(archivedKey(active, em))
    if (v != null && v !== '') return true
  }
  return false
}

/** Restore per-user archives into active keys. If no archive exists, active keys are left unchanged (legacy single-session data). */
export function restoreActiveSessionForEmail(email: string): void {
  const em = email.trim()
  if (!em) return
  for (const active of ACTIVE_KEYS) {
    const arch = getCoreDataItem(archivedKey(active, em))
    if (arch != null && arch !== '') {
      try {
        setCoreDataItem(active, arch)
      } catch { /* ignore */ }
    }
  }
}

/** Remove per-user archives (e.g. delete account). */
export function removeArchivedSessionForEmail(email: string): void {
  const em = email.trim()
  if (!em) return
  for (const active of ACTIVE_KEYS) {
    try {
      removeCoreDataItem(archivedKey(active, em))
    } catch { /* ignore */ }
  }
}

/** Remove active portfolio/session keys only (does not touch `finocurve-saved-local-accounts` or `*:user:*` archives). */
export function clearActiveUserDataStorage(): void {
  for (const active of ACTIVE_KEYS) {
    try {
      removeCoreDataItem(active)
    } catch { /* ignore */ }
  }
}

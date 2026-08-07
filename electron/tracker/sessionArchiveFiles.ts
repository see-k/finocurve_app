/**
 * Pure file-level archive/restore for the Tracker SQLite DB (no Electron app).
 * Production wrappers in sessionArchive.ts close the live DB handle then call these.
 */
import path from 'node:path'
import fs from 'node:fs'

const ACTIVE_DB_FILENAME = 'finocurve-tracker.db'
const SYNC_META_FILE = 'finocurve-tracker-sync-meta.json'

function emailSuffix(email: string): string {
  return email.trim().toLowerCase().replace(/[/\\]/g, '_')
}

export function getArchivedTrackerDbPath(email: string, userDataDir: string): string {
  return path.join(userDataDir, `finocurve-tracker.user.${emailSuffix(email)}.db`)
}

export function getActiveTrackerDbPathForDir(userDataDir: string): string {
  return path.join(userDataDir, ACTIVE_DB_FILENAME)
}

function getActiveSyncMetaPath(userDataDir: string): string {
  return path.join(userDataDir, SYNC_META_FILE)
}

function getArchivedSyncMetaPath(email: string, userDataDir: string): string {
  return path.join(userDataDir, `finocurve-tracker-sync-meta.user.${emailSuffix(email)}.json`)
}

/** Main DB path plus WAL/SHM sidecars that must move/delete with it. */
function dbArtifacts(dbPath: string): string[] {
  return [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]
}

function activeDbArtifacts(userDataDir: string): string[] {
  return dbArtifacts(getActiveTrackerDbPathForDir(userDataDir))
}

function archivedDbArtifacts(email: string, userDataDir: string): string[] {
  return dbArtifacts(getArchivedTrackerDbPath(email, userDataDir))
}

function removeIfExists(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  } catch {
    /* ignore */
  }
}

function copyIfExists(from: string, to: string): void {
  if (!fs.existsSync(from)) return
  try {
    fs.copyFileSync(from, to)
  } catch {
    /* ignore */
  }
}

function clearActiveTrackerFiles(userDataDir: string): void {
  for (const p of activeDbArtifacts(userDataDir)) removeIfExists(p)
  removeIfExists(getActiveSyncMetaPath(userDataDir))
}

export function archiveTrackerSessionAt(userDataDir: string, email: string): void {
  const em = email.trim()
  if (!em) return

  const active = activeDbArtifacts(userDataDir)
  const archived = archivedDbArtifacts(em, userDataDir)
  for (let i = 0; i < active.length; i++) {
    copyIfExists(active[i], archived[i])
  }

  copyIfExists(getActiveSyncMetaPath(userDataDir), getArchivedSyncMetaPath(em, userDataDir))

  clearActiveTrackerFiles(userDataDir)
}

export function hasArchivedTrackerSessionAt(userDataDir: string, email: string): boolean {
  const em = email.trim()
  if (!em) return false
  try {
    return fs.existsSync(getArchivedTrackerDbPath(em, userDataDir))
  } catch {
    return false
  }
}

export function restoreTrackerSessionAt(userDataDir: string, email: string): void {
  const em = email.trim()
  if (!em) return

  clearActiveTrackerFiles(userDataDir)

  const active = activeDbArtifacts(userDataDir)
  const archived = archivedDbArtifacts(em, userDataDir)
  for (let i = 0; i < archived.length; i++) {
    copyIfExists(archived[i], active[i])
  }

  copyIfExists(getArchivedSyncMetaPath(em, userDataDir), getActiveSyncMetaPath(userDataDir))
}

export function removeArchivedTrackerSessionAt(userDataDir: string, email: string): void {
  const em = email.trim()
  if (!em) return
  for (const p of archivedDbArtifacts(em, userDataDir)) removeIfExists(p)
  removeIfExists(getArchivedSyncMetaPath(em, userDataDir))
}

export function clearActiveTrackerSessionAt(userDataDir: string): void {
  clearActiveTrackerFiles(userDataDir)
}

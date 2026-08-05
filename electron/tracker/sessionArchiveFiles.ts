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

/** Active DB path + WAL/SHM sidecars that must move/delete with it. */
function activeDbArtifacts(userDataDir: string): string[] {
  const dbPath = getActiveTrackerDbPathForDir(userDataDir)
  return [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]
}

function removeIfExists(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
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

  const activeDb = getActiveTrackerDbPathForDir(userDataDir)
  if (fs.existsSync(activeDb)) {
    try {
      fs.copyFileSync(activeDb, getArchivedTrackerDbPath(em, userDataDir))
    } catch {
      /* ignore */
    }
  }

  const activeMeta = getActiveSyncMetaPath(userDataDir)
  if (fs.existsSync(activeMeta)) {
    try {
      fs.copyFileSync(activeMeta, getArchivedSyncMetaPath(em, userDataDir))
    } catch {
      /* ignore */
    }
  }

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

  const archivedDb = getArchivedTrackerDbPath(em, userDataDir)
  if (fs.existsSync(archivedDb)) {
    try {
      fs.copyFileSync(archivedDb, getActiveTrackerDbPathForDir(userDataDir))
    } catch {
      /* ignore */
    }
  }

  const archivedMeta = getArchivedSyncMetaPath(em, userDataDir)
  if (fs.existsSync(archivedMeta)) {
    try {
      fs.copyFileSync(archivedMeta, getActiveSyncMetaPath(userDataDir))
    } catch {
      /* ignore */
    }
  }
}

export function removeArchivedTrackerSessionAt(userDataDir: string, email: string): void {
  const em = email.trim()
  if (!em) return
  removeIfExists(getArchivedTrackerDbPath(em, userDataDir))
  removeIfExists(getArchivedSyncMetaPath(em, userDataDir))
}

export function clearActiveTrackerSessionAt(userDataDir: string): void {
  clearActiveTrackerFiles(userDataDir)
}

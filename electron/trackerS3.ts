import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { uploadS3IfConfigured, getS3FileBuffer } from './s3Handlers'
import { serializeTrackerDb, replaceTrackerDatabaseFromBuffer, getTrackerDbPath } from './tracker/db'
import { isTrackerEmpty } from './tracker/repository'

export const TRACKER_S3_DB_KEY = 'finocurve/tracker/tracker.sqlite'
export const TRACKER_S3_MANIFEST_KEY = 'finocurve/tracker/tracker-manifest.json'

const OPTIONS_FILE = 'finocurve-tracker-s3-options.json'
const SYNC_META_FILE = 'finocurve-tracker-sync-meta.json'

export interface TrackerS3Options {
  autoBackup: boolean
  autoSync: boolean
}

export interface TrackerSyncMeta {
  lastLocalMutationAt: string | null
  lastPushedAt: string | null
  lastPulledAt: string | null
  lastRemoteUpdatedAt: string | null
}

function optionsPath(): string {
  return path.join(app.getPath('userData'), OPTIONS_FILE)
}

function metaPath(): string {
  return path.join(app.getPath('userData'), SYNC_META_FILE)
}

export function loadTrackerS3Options(): TrackerS3Options {
  try {
    const p = optionsPath()
    if (!fs.existsSync(p)) return { autoBackup: false, autoSync: false }
    const raw = fs.readFileSync(p, 'utf-8')
    const j = JSON.parse(raw) as Partial<TrackerS3Options>
    return {
      autoBackup: !!j.autoBackup,
      autoSync: !!j.autoSync,
    }
  } catch {
    return { autoBackup: false, autoSync: false }
  }
}

export function saveTrackerS3Options(opts: TrackerS3Options): void {
  try {
    fs.writeFileSync(optionsPath(), JSON.stringify(opts, null, 0), 'utf-8')
  } catch {
    /* ignore */
  }
}

export function loadSyncMeta(): TrackerSyncMeta {
  try {
    const p = metaPath()
    if (!fs.existsSync(p)) {
      return {
        lastLocalMutationAt: null,
        lastPushedAt: null,
        lastPulledAt: null,
        lastRemoteUpdatedAt: null,
      }
    }
    const raw = fs.readFileSync(p, 'utf-8')
    const j = JSON.parse(raw) as Partial<TrackerSyncMeta>
    return {
      lastLocalMutationAt: typeof j.lastLocalMutationAt === 'string' ? j.lastLocalMutationAt : null,
      lastPushedAt: typeof j.lastPushedAt === 'string' ? j.lastPushedAt : null,
      lastPulledAt: typeof j.lastPulledAt === 'string' ? j.lastPulledAt : null,
      lastRemoteUpdatedAt: typeof j.lastRemoteUpdatedAt === 'string' ? j.lastRemoteUpdatedAt : null,
    }
  } catch {
    return {
      lastLocalMutationAt: null,
      lastPushedAt: null,
      lastPulledAt: null,
      lastRemoteUpdatedAt: null,
    }
  }
}

export function saveSyncMeta(meta: TrackerSyncMeta): void {
  try {
    fs.writeFileSync(metaPath(), JSON.stringify(meta, null, 0), 'utf-8')
  } catch {
    /* ignore */
  }
}

export function touchLocalMutation(): void {
  const now = new Date().toISOString()
  const meta = loadSyncMeta()
  meta.lastLocalMutationAt = now
  saveSyncMeta(meta)
}

/** Bootstrap lastLocalMutationAt from DB file mtime if unset (helps LWW compare). */
export function ensureLocalMutationFromFileMtime(): void {
  const meta = loadSyncMeta()
  if (meta.lastLocalMutationAt) return
  try {
    const p = getTrackerDbPath()
    if (!fs.existsSync(p)) return
    const st = fs.statSync(p)
    meta.lastLocalMutationAt = st.mtime.toISOString()
    saveSyncMeta(meta)
  } catch {
    /* ignore */
  }
}

export interface TrackerManifest {
  updatedAt: string
}

export async function performTrackerBackup(force = false): Promise<{ ok: boolean; error?: string }> {
  const opts = loadTrackerS3Options()
  if (!force && !opts.autoBackup) return { ok: false, error: 'backup_disabled' }
  try {
    const buf = serializeTrackerDb()
    const meta = loadSyncMeta()
    const updatedAt = meta.lastLocalMutationAt ?? new Date().toISOString()
    const manifest: TrackerManifest = { updatedAt }
    const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest))
    const dbOk = await uploadS3IfConfigured(TRACKER_S3_DB_KEY, buf, 'application/x-sqlite3')
    const manOk = await uploadS3IfConfigured(
      TRACKER_S3_MANIFEST_KEY,
      manifestBytes,
      'application/json'
    )
    if (!dbOk || !manOk) {
      return { ok: false, error: 's3_not_configured_or_failed' }
    }
    const next = loadSyncMeta()
    next.lastPushedAt = new Date().toISOString()
    next.lastRemoteUpdatedAt = updatedAt
    saveSyncMeta(next)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'backup_failed' }
  }
}

export async function performTrackerSyncPull(force = false): Promise<{ ok: boolean; reason?: string }> {
  const opts = loadTrackerS3Options()
  if (!force && !opts.autoSync) return { ok: false, reason: 'sync_disabled' }
  try {
    const manifestResult = await getS3FileBuffer(TRACKER_S3_MANIFEST_KEY)
    if (!manifestResult) return { ok: false, reason: 'no_remote_manifest' }
    const text = Buffer.from(manifestResult.buffer).toString('utf-8')
    const manifest = JSON.parse(text) as TrackerManifest
    if (!manifest.updatedAt) return { ok: false, reason: 'invalid_manifest' }

    const meta = loadSyncMeta()
    const localTs = meta.lastLocalMutationAt ?? ''
    const empty = isTrackerEmpty()

    if (!empty && manifest.updatedAt <= localTs) {
      return { ok: false, reason: 'local_newer_or_equal' }
    }

    const dbResult = await getS3FileBuffer(TRACKER_S3_DB_KEY)
    if (!dbResult?.buffer?.length) return { ok: false, reason: 'no_remote_db' }

    const buffer = Buffer.from(dbResult.buffer)
    replaceTrackerDatabaseFromBuffer(buffer)

    const next = loadSyncMeta()
    next.lastPulledAt = new Date().toISOString()
    next.lastRemoteUpdatedAt = manifest.updatedAt
    next.lastLocalMutationAt = manifest.updatedAt
    saveSyncMeta(next)
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'sync_failed' }
  }
}

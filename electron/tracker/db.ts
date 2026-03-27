import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import Database from 'better-sqlite3'

const DB_FILENAME = 'finocurve-tracker.db'

let db: Database.Database | null = null

export function getTrackerDbPath(): string {
  return path.join(app.getPath('userData'), DB_FILENAME)
}

export function getTrackerDb(): Database.Database {
  if (!db) {
    const p = getTrackerDbPath()
    db = new Database(p)
    db.pragma('journal_mode = WAL')
    migrate(db)
  }
  return db
}

function migrate(database: Database.Database): void {
  const row = database.prepare('PRAGMA user_version').get() as { user_version: number }
  let v = row.user_version
  if (v < 1) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS net_worth_entries (
        id TEXT PRIMARY KEY,
        amount REAL NOT NULL,
        recorded_at TEXT NOT NULL,
        source TEXT NOT NULL,
        note TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_nw_recorded ON net_worth_entries(recorded_at);
      CREATE TABLE IF NOT EXISTS tracker_goals (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        target_amount REAL NOT NULL,
        baseline_amount REAL NOT NULL,
        created_at TEXT NOT NULL,
        target_date TEXT
      );
    `)
    v = 1
    database.pragma(`user_version = ${v}`)
  }
  if (v < 2) {
    database.exec(
      `ALTER TABLE tracker_goals ADD COLUMN progress_source TEXT NOT NULL DEFAULT 'net_worth'`
    )
    v = 2
    database.pragma(`user_version = ${v}`)
  }
}

export function closeTrackerDb(): void {
  if (db) {
    try {
      db.close()
    } catch {
      /* ignore */
    }
    db = null
  }
}

/** Serialized DB image for S3 upload (consistent snapshot). */
export function serializeTrackerDb(): Buffer {
  const d = getTrackerDb()
  return d.serialize()
}

/** Replace on-disk DB from downloaded buffer and reopen. */
export function replaceTrackerDatabaseFromBuffer(buffer: Buffer): void {
  closeTrackerDb()
  fs.writeFileSync(getTrackerDbPath(), buffer)
  db = new Database(getTrackerDbPath())
  db.pragma('journal_mode = WAL')
  migrate(db)
}

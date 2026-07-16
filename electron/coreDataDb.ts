import { app } from 'electron'
import path from 'node:path'
import Database from 'better-sqlite3'
import { migrateCoreDataSchema } from './coreDataSchema'

const CORE_DATA_DB_FILENAME = 'finocurve-core-data.db'

let db: Database.Database | null = null

export function getCoreDataDbPath(): string {
  return path.join(app.getPath('userData'), CORE_DATA_DB_FILENAME)
}

export function getCoreDataDb(): Database.Database {
  if (!db) {
    db = new Database(getCoreDataDbPath())
    db.pragma('journal_mode = WAL')
    db.pragma('synchronous = FULL')
    db.pragma('foreign_keys = ON')
    migrateCoreDataSchema(db)
  }
  return db
}

export function closeCoreDataDb(): void {
  if (!db) return
  try { db.close() } catch { /* best effort during app shutdown */ }
  db = null
}

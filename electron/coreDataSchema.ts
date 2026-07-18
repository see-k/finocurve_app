import type Database from 'better-sqlite3'

export const CORE_DATA_SCHEMA_VERSION = 1

export function migrateCoreDataSchema(database: Database.Database): void {
  const row = database.prepare('PRAGMA user_version').get() as { user_version: number }
  let version = row.user_version

  if (version < 1) {
    database.transaction(() => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS core_data_records (
          storage_key TEXT PRIMARY KEY,
          data_kind TEXT NOT NULL CHECK (data_kind IN ('portfolio', 'agents', 'conversations', 'assistant_chat')),
          payload_json TEXT,
          payload_sha256 TEXT,
          revision INTEGER NOT NULL CHECK (revision >= 1),
          is_deleted INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0, 1)),
          validation_status TEXT NOT NULL CHECK (validation_status IN ('valid', 'invalid', 'deleted')),
          validation_error TEXT,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS core_data_conflicts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          storage_key TEXT NOT NULL,
          displaced_payload_json TEXT,
          displaced_payload_sha256 TEXT,
          displaced_revision INTEGER NOT NULL,
          displaced_is_deleted INTEGER NOT NULL,
          reason TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_core_conflicts_key ON core_data_conflicts(storage_key, created_at);

        CREATE TABLE IF NOT EXISTS core_data_migrations (
          id TEXT PRIMARY KEY,
          backup_path TEXT,
          source_record_count INTEGER NOT NULL,
          imported_record_count INTEGER NOT NULL,
          verified_record_count INTEGER NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('completed', 'failed')),
          error TEXT,
          started_at TEXT NOT NULL,
          completed_at TEXT NOT NULL
        );
      `)
      database.pragma('user_version = 1')
    })()
    version = 1
  }

  if (version !== CORE_DATA_SCHEMA_VERSION) {
    throw new Error(`Unsupported core data database schema version ${version}.`)
  }
}

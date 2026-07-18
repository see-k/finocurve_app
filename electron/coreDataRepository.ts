import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import {
  checksumCoreData,
  coreDataKindForKey,
  decideCoreDataReconciliation,
  sameCoreDataValue,
  validateCoreDataPayload,
  type CoreDataClientRecord,
  type CoreDataKind,
  type CoreDataRecord,
} from './coreDataModel'

interface CoreDataDbRow {
  storageKey: string
  kind: CoreDataKind
  value: string | null
  checksum: string | null
  revision: number
  deleted: number
  validationStatus: 'valid' | 'invalid' | 'deleted'
  validationError: string | null
  updatedAt: string
}

const SELECT_COLUMNS = `
  storage_key AS storageKey,
  data_kind AS kind,
  payload_json AS value,
  payload_sha256 AS checksum,
  revision,
  is_deleted AS deleted,
  validation_status AS validationStatus,
  validation_error AS validationError,
  updated_at AS updatedAt
`

function fromRow(row: CoreDataDbRow): CoreDataRecord {
  return {
    storageKey: row.storageKey,
    kind: row.kind,
    value: row.value,
    checksum: row.checksum,
    revision: row.revision,
    deleted: row.deleted === 1,
    validationStatus: row.validationStatus,
    ...(row.validationError ? { validationError: row.validationError } : {}),
    updatedAt: row.updatedAt,
  }
}

export interface CoreDataBootstrapResult {
  records: CoreDataRecord[]
  importedCount: number
  verifiedCount: number
  backupPath?: string
}

export class CoreDataRepository {
  constructor(private readonly db: Database.Database) {}

  get(storageKey: string): CoreDataRecord | null {
    const row = this.db.prepare(`SELECT ${SELECT_COLUMNS} FROM core_data_records WHERE storage_key = ?`)
      .get(storageKey) as CoreDataDbRow | undefined
    return row ? fromRow(row) : null
  }

  list(): CoreDataRecord[] {
    const rows = this.db.prepare(`SELECT ${SELECT_COLUMNS} FROM core_data_records ORDER BY storage_key ASC`)
      .all() as CoreDataDbRow[]
    return rows.map(fromRow)
  }

  hasBootstrapDifferences(records: CoreDataClientRecord[]): boolean {
    const clientKeys = new Set(records.map((record) => record.storageKey))
    for (const record of records) {
      const existing = this.get(record.storageKey)
      if (!existing) {
        if (record.value !== null || record.revision > 0) return true
        continue
      }
      if (existing.revision !== record.revision || !sameCoreDataValue(existing, record)) return true
    }
    return this.list().some((record) => !clientKeys.has(record.storageKey))
  }

  private preserveConflict(existing: CoreDataRecord, reason: string, now: string): void {
    this.db.prepare(`
      INSERT INTO core_data_conflicts (
        storage_key, displaced_payload_json, displaced_payload_sha256,
        displaced_revision, displaced_is_deleted, reason, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      existing.storageKey,
      existing.value,
      existing.checksum,
      existing.revision,
      existing.deleted ? 1 : 0,
      reason,
      now,
    )
  }

  private persist(record: CoreDataClientRecord, revision: number, now: string): CoreDataRecord {
    const kind = coreDataKindForKey(record.storageKey)
    if (!kind) throw new Error(`Unsupported core data key: ${record.storageKey}`)
    const validation = validateCoreDataPayload(kind, record.value)
    const checksum = checksumCoreData(record.value)
    const deleted = record.value === null

    this.db.prepare(`
      INSERT INTO core_data_records (
        storage_key, data_kind, payload_json, payload_sha256, revision,
        is_deleted, validation_status, validation_error, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(storage_key) DO UPDATE SET
        data_kind = excluded.data_kind,
        payload_json = excluded.payload_json,
        payload_sha256 = excluded.payload_sha256,
        revision = excluded.revision,
        is_deleted = excluded.is_deleted,
        validation_status = excluded.validation_status,
        validation_error = excluded.validation_error,
        updated_at = excluded.updated_at
    `).run(
      record.storageKey,
      kind,
      record.value,
      checksum,
      revision,
      deleted ? 1 : 0,
      validation.status,
      validation.error ?? null,
      now,
    )

    const saved = this.get(record.storageKey)
    if (!saved || saved.revision !== revision || saved.value !== record.value) {
      throw new Error(`SQLite verification failed for ${record.storageKey}.`)
    }
    return saved
  }

  /**
   * Applies a renderer write only when its revision is current. Equal-revision
   * conflicts preserve the displaced SQLite value and advance the revision.
   */
  write(record: CoreDataClientRecord): CoreDataRecord {
    if (record.revision < 1) throw new Error('Core data writes require revision 1 or newer.')
    const now = new Date().toISOString()
    return this.db.transaction(() => {
      const existing = this.get(record.storageKey)
      const decision = decideCoreDataReconciliation(existing, record)
      if (decision === 'keep_stored' || decision === 'unchanged') return existing!
      if (decision === 'conflict_use_local') {
        this.preserveConflict(existing!, 'equal_revision_renderer_write', now)
        return this.persist(record, existing!.revision + 1, now)
      }
      return this.persist(record, record.revision, now)
    })()
  }

  reconcileBootstrap(records: CoreDataClientRecord[], backupPath?: string): CoreDataBootstrapResult {
    const startedAt = new Date().toISOString()
    const migrationId = randomUUID()
    const changedKeys: string[] = []

    const result = this.db.transaction(() => {
      for (const client of records) {
        const existing = this.get(client.storageKey)
        const decision = decideCoreDataReconciliation(existing, client)
        if (decision === 'skip_empty' || decision === 'keep_stored' || decision === 'unchanged') continue
        if (decision === 'insert_local') {
          this.persist(client, Math.max(1, client.revision), startedAt)
          changedKeys.push(client.storageKey)
          continue
        }
        if (decision === 'conflict_use_local') {
          this.preserveConflict(existing!, 'equal_revision_startup_reconciliation', startedAt)
          this.persist(client, existing!.revision + 1, startedAt)
          changedKeys.push(client.storageKey)
          continue
        }
        this.persist(client, client.revision, startedAt)
        changedKeys.push(client.storageKey)
      }

      let verifiedCount = 0
      for (const storageKey of changedKeys) {
        if (this.get(storageKey)) verifiedCount += 1
      }
      if (verifiedCount !== changedKeys.length) {
        throw new Error('Not all imported core data records passed post-write verification.')
      }

      const completedAt = new Date().toISOString()
      if (changedKeys.length > 0 || backupPath) {
        this.db.prepare(`
          INSERT INTO core_data_migrations (
            id, backup_path, source_record_count, imported_record_count,
            verified_record_count, status, error, started_at, completed_at
          ) VALUES (?, ?, ?, ?, ?, 'completed', NULL, ?, ?)
        `).run(
          migrationId,
          backupPath ?? null,
          records.filter((record) => record.value !== null).length,
          changedKeys.length,
          verifiedCount,
          startedAt,
          completedAt,
        )
      }

      return { verifiedCount }
    })()

    return {
      records: this.list(),
      importedCount: changedKeys.length,
      verifiedCount: result.verifiedCount,
      ...(backupPath ? { backupPath } : {}),
    }
  }
}

import { afterEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { migrateCoreDataSchema, CORE_DATA_SCHEMA_VERSION } from '../electron/coreDataSchema'
import { CoreDataRepository } from '../electron/coreDataRepository'

let databases: Database.Database[] = []

function memoryDatabase(): Database.Database {
  const db = new Database(':memory:')
  databases.push(db)
  migrateCoreDataSchema(db)
  return db
}

afterEach(() => {
  for (const db of databases) db.close()
  databases = []
})

describe('SQLite core data repository', () => {
  it('migrates schema idempotently and rejects unknown future schemas', () => {
    const db = memoryDatabase()
    migrateCoreDataSchema(db)
    const version = db.prepare('PRAGMA user_version').get() as { user_version: number }
    expect(version.user_version).toBe(CORE_DATA_SCHEMA_VERSION)

    const future = new Database(':memory:')
    databases.push(future)
    future.pragma('user_version = 99')
    expect(() => migrateCoreDataSchema(future)).toThrow('Unsupported')
  })

  it('imports and verifies legacy JSON in one transaction', () => {
    const db = memoryDatabase()
    const repository = new CoreDataRepository(db)
    const portfolio = JSON.stringify({ id: 'portfolio-1', assets: [] })
    const agents = JSON.stringify([{ id: 'a1', name: 'Anna', systemPrompt: 'Help' }])

    const result = repository.reconcileBootstrap([
      { storageKey: 'finocurve-portfolio', value: portfolio, revision: 0 },
      { storageKey: 'finocurve-agents', value: agents, revision: 0 },
      { storageKey: 'finocurve-conversations', value: null, revision: 0 },
    ], '/safe/backup.json')

    expect(result.importedCount).toBe(2)
    expect(result.verifiedCount).toBe(2)
    expect(result.backupPath).toBe('/safe/backup.json')
    expect(repository.get('finocurve-portfolio')).toMatchObject({
      value: portfolio,
      revision: 1,
      validationStatus: 'valid',
      deleted: false,
    })
    const migration = db.prepare(`SELECT * FROM core_data_migrations`).get() as {
      status: string
      imported_record_count: number
      verified_record_count: number
    }
    expect(migration.status).toBe('completed')
    expect(migration.imported_record_count).toBe(2)
    expect(migration.verified_record_count).toBe(2)
  })

  it('preserves conflicts, ignores stale writes, and persists deletion tombstones', () => {
    const db = memoryDatabase()
    const repository = new CoreDataRepository(db)
    const original = JSON.stringify({ id: 'p1', assets: [] })
    const changed = JSON.stringify({ id: 'p1', assets: [{ id: 'asset-1' }] })
    repository.reconcileBootstrap([
      { storageKey: 'finocurve-portfolio', value: original, revision: 0 },
    ])

    const conflicted = repository.write({
      storageKey: 'finocurve-portfolio', value: changed, revision: 1,
    })
    expect(conflicted.revision).toBe(2)
    expect(conflicted.value).toBe(changed)
    const conflict = db.prepare(`SELECT displaced_payload_json AS value FROM core_data_conflicts`).get() as { value: string }
    expect(conflict.value).toBe(original)

    const stale = repository.write({
      storageKey: 'finocurve-portfolio', value: original, revision: 1,
    })
    expect(stale.revision).toBe(2)
    expect(stale.value).toBe(changed)

    const deleted = repository.write({
      storageKey: 'finocurve-portfolio', value: null, revision: 3,
    })
    expect(deleted).toMatchObject({ revision: 3, value: null, deleted: true, validationStatus: 'deleted' })
  })

  it('retains malformed legacy payloads with a validation warning', () => {
    const repository = new CoreDataRepository(memoryDatabase())
    const result = repository.reconcileBootstrap([
      { storageKey: 'finocurve-conversations', value: '{broken', revision: 0 },
    ])
    expect(result.records[0]).toMatchObject({
      value: '{broken',
      validationStatus: 'invalid',
    })
    expect(result.records[0].validationError).toContain('valid JSON')
  })

  it('detects backup-worthy differences and reconciles newer startup records', () => {
    const db = memoryDatabase()
    const repository = new CoreDataRepository(db)
    const first = JSON.stringify({ id: 'p1', assets: [] })
    const second = JSON.stringify({ id: 'p1', assets: [{ id: 'a1' }] })
    const third = JSON.stringify({ id: 'p1', assets: [{ id: 'a2' }] })
    const empty = { storageKey: 'finocurve-portfolio', value: null, revision: 0 }
    const legacy = { storageKey: 'finocurve-portfolio', value: first, revision: 0 }

    expect(repository.hasBootstrapDifferences([empty])).toBe(false)
    expect(repository.hasBootstrapDifferences([legacy])).toBe(true)
    repository.reconcileBootstrap([legacy])
    expect(repository.hasBootstrapDifferences([
      { storageKey: 'finocurve-portfolio', value: first, revision: 1 },
    ])).toBe(false)
    expect(repository.hasBootstrapDifferences([])).toBe(true)

    const unknownRevision = repository.reconcileBootstrap([
      { storageKey: 'finocurve-portfolio', value: second, revision: 0 },
    ])
    expect(unknownRevision.records[0]).toMatchObject({ value: second, revision: 2 })

    const newer = repository.reconcileBootstrap([
      { storageKey: 'finocurve-portfolio', value: second, revision: 3 },
    ])
    expect(newer.records[0]).toMatchObject({ value: second, revision: 3 })
    const conflict = repository.reconcileBootstrap([
      { storageKey: 'finocurve-portfolio', value: third, revision: 3 },
    ])
    expect(conflict.records[0]).toMatchObject({ value: third, revision: 4 })
  })

  it('validates direct write revisions and handles insert and unchanged writes', () => {
    const repository = new CoreDataRepository(memoryDatabase())
    expect(() => repository.write({
      storageKey: 'finocurve-agents', value: '[]', revision: 0,
    })).toThrow('revision 1')
    expect(() => repository.write({
      storageKey: 'unsupported', value: '[]', revision: 1,
    })).toThrow('Unsupported')

    const inserted = repository.write({
      storageKey: 'finocurve-agents', value: '[]', revision: 1,
    })
    const unchanged = repository.write({
      storageKey: 'finocurve-agents', value: '[]', revision: 1,
    })
    expect(inserted).toMatchObject({ kind: 'agents', revision: 1, value: '[]' })
    expect(unchanged).toEqual(inserted)
  })
})

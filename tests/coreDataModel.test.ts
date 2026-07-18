import { describe, expect, it } from 'vitest'
import {
  checksumCoreData,
  coreDataKindForKey,
  decideCoreDataReconciliation,
  isCoreDataStorageKey,
  normalizeCoreDataClientRecord,
  normalizeCoreDataClientRecords,
  validateCoreDataPayload,
  type CoreDataRecord,
} from '../electron/coreDataModel'

function stored(value: string | null, revision: number): CoreDataRecord {
  return {
    storageKey: 'finocurve-portfolio',
    kind: 'portfolio',
    value,
    revision,
    checksum: checksumCoreData(value),
    deleted: value === null,
    validationStatus: value === null ? 'deleted' : 'valid',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('core data migration model', () => {
  it('only accepts supported core and per-user storage keys', () => {
    expect(coreDataKindForKey('finocurve-portfolio')).toBe('portfolio')
    expect(coreDataKindForKey('finocurve-agents')).toBe('agents')
    expect(coreDataKindForKey('finocurve-conversations')).toBe('conversations')
    expect(coreDataKindForKey('finocurve-portfolio:user:person@example.com')).toBe('portfolio')
    expect(coreDataKindForKey('finocurve-ai-chat-messages-person@example.com')).toBe('assistant_chat')
    expect(coreDataKindForKey('finocurve-preferences')).toBeNull()
    expect(isCoreDataStorageKey('finocurve-preferences')).toBe(false)
  })

  it('validates every domain shape without discarding malformed legacy JSON', () => {
    expect(validateCoreDataPayload('portfolio', JSON.stringify({ id: 'p', assets: [] }))).toEqual({ status: 'valid' })
    expect(validateCoreDataPayload('portfolio', '{}').status).toBe('invalid')
    expect(validateCoreDataPayload('portfolio', 'not-json').status).toBe('invalid')
    expect(validateCoreDataPayload('agents', JSON.stringify([{ id: 'a', name: 'Anna', systemPrompt: 'Help' }]))).toEqual({ status: 'valid' })
    expect(validateCoreDataPayload('agents', JSON.stringify([{ id: 'a' }])).status).toBe('invalid')
    expect(validateCoreDataPayload('conversations', JSON.stringify([{ id: 'c', participantAgentIds: [], messages: [] }]))).toEqual({ status: 'valid' })
    expect(validateCoreDataPayload('conversations', '{}').status).toBe('invalid')
    expect(validateCoreDataPayload('assistant_chat', JSON.stringify([{ role: 'user', content: 'hello' }]))).toEqual({ status: 'valid' })
    expect(validateCoreDataPayload('assistant_chat', JSON.stringify([{ role: 'tool' }])).status).toBe('invalid')
    expect(validateCoreDataPayload('portfolio', null)).toEqual({ status: 'deleted' })
  })

  it('normalizes, validates, and de-duplicates renderer records by newest revision', () => {
    const records = normalizeCoreDataClientRecords([
      { storageKey: 'finocurve-agents', value: '[]', revision: 1 },
      { storageKey: 'finocurve-agents', value: '[{"id":"new"}]', revision: 2 },
      { storageKey: 'finocurve-portfolio', value: null, revision: 0 },
    ])

    expect(records).toHaveLength(2)
    expect(records.find((record) => record.storageKey === 'finocurve-agents')?.revision).toBe(2)
    expect(() => normalizeCoreDataClientRecord({ storageKey: 'unknown', value: '[]', revision: 1 })).toThrow('Unsupported')
    expect(() => normalizeCoreDataClientRecord({ storageKey: 'finocurve-agents', value: 4, revision: 1 })).toThrow('string or null')
    expect(() => normalizeCoreDataClientRecord({ storageKey: 'finocurve-agents', value: '[]', revision: -1 })).toThrow('non-negative')
    expect(() => normalizeCoreDataClientRecords({})).toThrow('array')
  })

  it('uses stable SHA-256 checksums for migration verification', () => {
    expect(checksumCoreData('same')).toBe(checksumCoreData('same'))
    expect(checksumCoreData('same')).not.toBe(checksumCoreData('different'))
    expect(checksumCoreData(null)).toBeNull()
  })

  it('never lets an older cache overwrite SQLite and flags equal-revision conflicts', () => {
    const local = (value: string | null, revision: number) => ({
      storageKey: 'finocurve-portfolio', value, revision,
    })

    expect(decideCoreDataReconciliation(null, local(null, 0))).toBe('skip_empty')
    expect(decideCoreDataReconciliation(null, local('{"assets":[]}', 0))).toBe('insert_local')
    expect(decideCoreDataReconciliation(stored('{"assets":[]}', 3), local(null, 0))).toBe('keep_stored')
    expect(decideCoreDataReconciliation(stored('{"assets":[]}', 3), local('{"assets":[1]}', 0))).toBe('conflict_use_local')
    expect(decideCoreDataReconciliation(stored('{"assets":[]}', 3), local('{"assets":[1]}', 2))).toBe('keep_stored')
    expect(decideCoreDataReconciliation(stored('{"assets":[]}', 3), local('{"assets":[]}', 3))).toBe('unchanged')
    expect(decideCoreDataReconciliation(stored('{"assets":[]}', 3), local('{"assets":[1]}', 3))).toBe('conflict_use_local')
    expect(decideCoreDataReconciliation(stored('{"assets":[]}', 3), local(null, 4))).toBe('replace_with_local')
  })
})

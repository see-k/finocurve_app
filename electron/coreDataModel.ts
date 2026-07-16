import { createHash } from 'node:crypto'

export type CoreDataKind = 'portfolio' | 'agents' | 'conversations' | 'assistant_chat'

export interface CoreDataClientRecord {
  storageKey: string
  value: string | null
  revision: number
}

export interface CoreDataRecord extends CoreDataClientRecord {
  kind: CoreDataKind
  checksum: string | null
  deleted: boolean
  validationStatus: 'valid' | 'invalid' | 'deleted'
  validationError?: string
  updatedAt: string
}

export interface CoreDataValidation {
  status: 'valid' | 'invalid' | 'deleted'
  error?: string
}

export type CoreDataReconciliationDecision =
  | 'insert_local'
  | 'keep_stored'
  | 'unchanged'
  | 'replace_with_local'
  | 'conflict_use_local'
  | 'skip_empty'

const STATIC_KEYS = new Map<string, CoreDataKind>([
  ['finocurve-portfolio', 'portfolio'],
  ['finocurve-agents', 'agents'],
  ['finocurve-conversations', 'conversations'],
])

export function coreDataKindForKey(storageKey: string): CoreDataKind | null {
  const exact = STATIC_KEYS.get(storageKey)
  if (exact) return exact
  if (storageKey.startsWith('finocurve-portfolio:user:')) return 'portfolio'
  if (storageKey.startsWith('finocurve-ai-chat-messages-')) return 'assistant_chat'
  return null
}

export function isCoreDataStorageKey(storageKey: string): boolean {
  return coreDataKindForKey(storageKey) !== null
}

export function checksumCoreData(value: string | null): string | null {
  if (value === null) return null
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

export function sameCoreDataValue(
  stored: Pick<CoreDataRecord, 'value' | 'deleted'>,
  client: Pick<CoreDataClientRecord, 'value'>,
): boolean {
  return stored.deleted === (client.value === null) && stored.value === client.value
}

export function decideCoreDataReconciliation(
  stored: Pick<CoreDataRecord, 'value' | 'deleted' | 'revision'> | null,
  client: CoreDataClientRecord,
): CoreDataReconciliationDecision {
  if (!stored) return client.value === null && client.revision === 0 ? 'skip_empty' : 'insert_local'
  // Revision zero means legacy/unknown, not necessarily old. If an actual local
  // payload differs, keep it visible and preserve the displaced DB row as a
  // conflict. A missing local payload still restores safely from SQLite.
  if (client.revision === 0) {
    if (client.value === null) return 'keep_stored'
    return sameCoreDataValue(stored, client) ? 'keep_stored' : 'conflict_use_local'
  }
  if (client.revision < stored.revision) return 'keep_stored'
  if (client.revision > stored.revision) return 'replace_with_local'
  return sameCoreDataValue(stored, client) ? 'unchanged' : 'conflict_use_local'
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function invalid(error: string): CoreDataValidation {
  return { status: 'invalid', error }
}

/** Validation is advisory: invalid legacy payloads are still retained for recovery. */
export function validateCoreDataPayload(kind: CoreDataKind, value: string | null): CoreDataValidation {
  if (value === null) return { status: 'deleted' }

  let parsed: unknown
  try {
    parsed = JSON.parse(value) as unknown
  } catch {
    return invalid('Payload is not valid JSON.')
  }

  if (kind === 'portfolio') {
    if (!isObject(parsed)) return invalid('Portfolio payload must be an object.')
    if (!Array.isArray(parsed.assets)) return invalid('Portfolio payload must include an assets array.')
    return { status: 'valid' }
  }

  if (!Array.isArray(parsed)) return invalid(`${kind} payload must be an array.`)

  if (kind === 'agents') {
    const valid = parsed.every((item) =>
      isObject(item) && typeof item.id === 'string' && typeof item.name === 'string' &&
      typeof item.systemPrompt === 'string')
    return valid ? { status: 'valid' } : invalid('One or more agent records are malformed.')
  }

  if (kind === 'conversations') {
    const valid = parsed.every((item) =>
      isObject(item) && typeof item.id === 'string' && Array.isArray(item.participantAgentIds) &&
      Array.isArray(item.messages))
    return valid ? { status: 'valid' } : invalid('One or more conversation records are malformed.')
  }

  const valid = parsed.every((item) =>
    isObject(item) && (item.role === 'user' || item.role === 'assistant') &&
    typeof item.content === 'string')
  return valid ? { status: 'valid' } : invalid('One or more assistant chat messages are malformed.')
}

export function normalizeCoreDataClientRecord(input: unknown): CoreDataClientRecord {
  if (!isObject(input)) throw new Error('Core data record must be an object.')
  const storageKey = input.storageKey
  const value = input.value
  const revision = input.revision
  if (typeof storageKey !== 'string' || !isCoreDataStorageKey(storageKey)) {
    throw new Error('Unsupported core data storage key.')
  }
  if (value !== null && typeof value !== 'string') throw new Error('Core data value must be a string or null.')
  if (!Number.isSafeInteger(revision) || (revision as number) < 0) {
    throw new Error('Core data revision must be a non-negative integer.')
  }
  return { storageKey, value: value as string | null, revision: revision as number }
}

export function normalizeCoreDataClientRecords(input: unknown): CoreDataClientRecord[] {
  if (!Array.isArray(input)) throw new Error('Core data records must be an array.')
  const deduplicated = new Map<string, CoreDataClientRecord>()
  for (const raw of input) {
    const record = normalizeCoreDataClientRecord(raw)
    const prior = deduplicated.get(record.storageKey)
    if (!prior || record.revision >= prior.revision) deduplicated.set(record.storageKey, record)
  }
  return [...deduplicated.values()]
}

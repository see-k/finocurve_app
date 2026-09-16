/**
 * One-time recovery for experts that lived in the shared `finocurve-agents` key
 * before chats/agents were scoped per profile. Sign-in started clearing the
 * active key; older per-user archives did not include experts, so existing
 * profiles were left with only the seeded default assistant. The original
 * records often survive under another profile's archive (the session that
 * still held them at sign-out). Copy that list onto every existing profile
 * that does not already have custom experts.
 */
import type { Agent } from '../types/Agent'
import { isDefaultAgent } from '../types/Agent'
import { AGENTS_STORAGE_KEY, LEGACY_SHARED_AGENTS_KEY, getCoreDataItem, setCoreDataItem } from './coreDataStorage'
import { loadSavedLocalAccounts } from './savedLocalAccounts'

export { LEGACY_SHARED_AGENTS_KEY }
export const LEGACY_EXPERTS_SEED_FLAG = 'finocurve-agents-legacy-profile-seed-v1'
/**
 * Timestamp of the first launch that found nothing to recover. Experts created
 * after it are new work, not legacy data, so a later launch must not mistake a
 * freshly authored profile for the pre-migration snapshot and fan it out.
 */
export const LEGACY_EXPERTS_BASELINE_KEY = 'finocurve-agents-legacy-baseline-v1'

/**
 * Per-agent secrets never leave the profile that configured them. The recovery
 * copies expert definitions across profiles, so every profile must reconnect
 * its own provider credentials.
 */
const CREDENTIAL_FIELDS = [
  'bedrockAccessKeyId',
  'bedrockSecretKey',
  'azureApiKey',
  'slackUserToken',
] as const satisfies readonly (keyof Agent)[]

const USER_ARCHIVE_PREFIXES = [
  `${AGENTS_STORAGE_KEY}:user:`,
  'finocurve-conversations:user:',
  'finocurve-portfolio:user:',
] as const

function agentsArchiveKey(email: string): string {
  return `${AGENTS_STORAGE_KEY}:user:${email.trim().toLowerCase()}`
}

function isLikelyEmail(value: string): boolean {
  return value.includes('@') && !value.includes('/')
}

function forEachStorageKey(callback: (key: string) => void): void {
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index)
    if (key) callback(key)
  }
}

export function parseAgentList(raw: string | null): Agent[] | null {
  if (raw == null || raw === '') return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return null
    const agents = parsed.filter((item): item is Agent => (
      !!item &&
      typeof item === 'object' &&
      typeof (item as Agent).id === 'string' &&
      typeof (item as Agent).name === 'string' &&
      typeof (item as Agent).systemPrompt === 'string'
    ))
    return agents
  } catch {
    return null
  }
}

export function hasCustomExperts(agents: Agent[] | null | undefined): boolean {
  return !!agents?.some((agent) => !isDefaultAgent(agent))
}

/** Copy of an expert with every provider credential removed. */
export function stripAgentCredentials(agent: Agent): Agent {
  const copy = { ...agent }
  for (const field of CREDENTIAL_FIELDS) delete copy[field]
  return copy
}

function readBaseline(): string | null {
  try {
    const raw = localStorage.getItem(LEGACY_EXPERTS_BASELINE_KEY)
    return raw && raw.trim() ? raw.trim() : null
  } catch {
    return null
  }
}

/**
 * Recoverable legacy expert: a non-default expert that already existed when the
 * migration first ran. Without a baseline every custom expert predates it.
 */
function isLegacyExpert(agent: Agent, baseline: string | null): boolean {
  if (isDefaultAgent(agent)) return false
  if (!baseline) return true
  return typeof agent.createdAt === 'string' && agent.createdAt !== '' && agent.createdAt < baseline
}

function expertRichness(agents: Agent[]): number {
  const custom = agents.filter((agent) => !isDefaultAgent(agent))
  const withImage = custom.filter((agent) => !!agent.image).length
  const withDescription = custom.filter((agent) => !!agent.description?.trim()).length
  return custom.length * 1000 + withImage * 10 + withDescription
}

function signedInEmail(): string | null {
  try {
    const raw = localStorage.getItem('finocurve-preferences')
    if (!raw) return null
    const parsed = JSON.parse(raw) as { userEmail?: unknown }
    const email = typeof parsed.userEmail === 'string' ? parsed.userEmail.trim().toLowerCase() : ''
    return isLikelyEmail(email) ? email : null
  } catch {
    return null
  }
}

function existingProfileEmails(): string[] {
  const emails = new Set<string>()
  for (const account of loadSavedLocalAccounts()) {
    const email = account.email.trim().toLowerCase()
    if (isLikelyEmail(email)) emails.add(email)
  }
  const current = signedInEmail()
  if (current) emails.add(current)
  forEachStorageKey((key) => {
    for (const prefix of USER_ARCHIVE_PREFIXES) {
      if (key.startsWith(prefix)) {
        const email = key.slice(prefix.length).trim().toLowerCase()
        if (isLikelyEmail(email)) emails.add(email)
      }
    }
    if (key.startsWith('finocurve-ai-chat-messages-')) {
      const email = key.slice('finocurve-ai-chat-messages-'.length).trim().toLowerCase()
      if (isLikelyEmail(email)) emails.add(email)
    }
  })
  return [...emails]
}

function collectCandidateLists(baseline: string | null): Agent[][] {
  const lists: Agent[][] = []
  const seen = new Set<string>()
  const consider = (raw: string | null) => {
    if (raw == null || seen.has(raw)) return
    seen.add(raw)
    const agents = parseAgentList(raw)
    // Only the recoverable experts travel; the donor's default record stays put.
    const legacy = agents?.filter((agent) => isLegacyExpert(agent, baseline)) ?? []
    if (legacy.length === 0) return
    lists.push(legacy)
  }

  consider(getCoreDataItem(LEGACY_SHARED_AGENTS_KEY))
  consider(getCoreDataItem(AGENTS_STORAGE_KEY))
  forEachStorageKey((key) => {
    if (key.startsWith(`${AGENTS_STORAGE_KEY}:user:`)) consider(getCoreDataItem(key))
  })
  return lists
}

function pickRichestExperts(baseline: string | null): Agent[] | null {
  const lists = collectCandidateLists(baseline)
  if (lists.length === 0) return null
  return lists.reduce((best, current) => (
    expertRichness(current) > expertRichness(best) ? current : best
  ))
}

function persistAgents(storageKey: string, agents: Agent[]): void {
  setCoreDataItem(storageKey, JSON.stringify(agents))
}

/**
 * Load the experts for the current session. Prefer the active key; if it was
 * tombstoned (sign-in isolation) fall back to the signed-in profile's archive.
 * Do not replace a default-only active list — that may be an intentional edit.
 */
export function loadPersistedAgents(): Agent[] {
  const active = parseAgentList(getCoreDataItem(AGENTS_STORAGE_KEY))
  if (active && active.length > 0) return active
  const email = signedInEmail()
  if (email) {
    const archived = parseAgentList(getCoreDataItem(agentsArchiveKey(email)))
    if (archived && archived.length > 0) return archived
  }
  return active ?? []
}

/**
 * Merge recovered experts into a profile archive without disturbing what the
 * profile already has — notably its own (editable) default assistant record.
 */
function mergeRecoveredExperts(existing: Agent[] | null, recovered: Agent[]): Agent[] {
  const merged = existing ? [...existing] : []
  const known = new Set(merged.map((agent) => agent.id))
  for (const agent of recovered) {
    if (known.has(agent.id)) continue
    known.add(agent.id)
    merged.push(agent)
  }
  return merged
}

/**
 * Copy recovered experts onto existing profiles that only have the default
 * assistant. Credentials are stripped on the way out so a token configured by
 * one profile never reaches another. Idempotent after the first successful seed.
 */
export function restoreLegacyExpertsToExistingProfiles(): void {
  try {
    if (localStorage.getItem(LEGACY_EXPERTS_SEED_FLAG) === '1') return

    const baseline = readBaseline()
    const richest = pickRichestExperts(baseline)
    if (!richest) {
      // Nothing to recover. Record the attempt so experts created from here on
      // are recognised as new work rather than as a legacy snapshot to fan out.
      if (!baseline) localStorage.setItem(LEGACY_EXPERTS_BASELINE_KEY, new Date().toISOString())
      return
    }

    const stored = parseAgentList(getCoreDataItem(LEGACY_SHARED_AGENTS_KEY))
    // An empty or default-only snapshot recovers nothing; prefer the richest list.
    const source = (hasCustomExperts(stored) ? stored! : richest).map(stripAgentCredentials)
    persistAgents(LEGACY_SHARED_AGENTS_KEY, source)

    for (const email of existingProfileEmails()) {
      const archiveKey = agentsArchiveKey(email)
      const existing = parseAgentList(getCoreDataItem(archiveKey))
      if (hasCustomExperts(existing)) continue
      persistAgents(archiveKey, mergeRecoveredExperts(existing, source))
    }

    syncActiveSessionFromSignedInArchive()
    localStorage.setItem(LEGACY_EXPERTS_SEED_FLAG, '1')
  } catch {
    // Storage failures must never block startup.
  }
}

function syncActiveSessionFromSignedInArchive(): void {
  const email = signedInEmail()
  if (!email) return
  const archived = parseAgentList(getCoreDataItem(agentsArchiveKey(email)))
  if (!hasCustomExperts(archived)) return
  const active = parseAgentList(getCoreDataItem(AGENTS_STORAGE_KEY))
  // Match loadPersistedAgents: any nonempty active list may be an intentional edit.
  if (active && active.length > 0) return
  persistAgents(AGENTS_STORAGE_KEY, archived!)
}

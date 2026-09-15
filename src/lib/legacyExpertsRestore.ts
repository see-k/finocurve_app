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

function collectCandidateLists(): Agent[][] {
  const lists: Agent[][] = []
  const seen = new Set<string>()
  const consider = (raw: string | null) => {
    if (raw == null || seen.has(raw)) return
    const agents = parseAgentList(raw)
    if (!hasCustomExperts(agents)) return
    seen.add(raw)
    lists.push(agents!)
  }

  consider(getCoreDataItem(LEGACY_SHARED_AGENTS_KEY))
  consider(getCoreDataItem(AGENTS_STORAGE_KEY))
  forEachStorageKey((key) => {
    if (key.startsWith(`${AGENTS_STORAGE_KEY}:user:`)) consider(getCoreDataItem(key))
  })
  return lists
}

function pickRichestExperts(): Agent[] | null {
  const lists = collectCandidateLists()
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
 * Copy recovered experts onto existing profiles that only have the default
 * assistant. Idempotent after the first successful seed.
 */
export function restoreLegacyExpertsToExistingProfiles(): void {
  try {
    if (localStorage.getItem(LEGACY_EXPERTS_SEED_FLAG) === '1') return

    const richest = pickRichestExperts()
    if (!richest) {
      // Nothing to recover yet; try again on a later launch if archives appear.
      return
    }

    if (!parseAgentList(getCoreDataItem(LEGACY_SHARED_AGENTS_KEY))) {
      persistAgents(LEGACY_SHARED_AGENTS_KEY, richest)
    }
    const source = parseAgentList(getCoreDataItem(LEGACY_SHARED_AGENTS_KEY)) ?? richest

    for (const email of existingProfileEmails()) {
      const archiveKey = agentsArchiveKey(email)
      const existing = parseAgentList(getCoreDataItem(archiveKey))
      if (hasCustomExperts(existing)) continue
      persistAgents(archiveKey, source)
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
  if (hasCustomExperts(active)) return
  persistAgents(AGENTS_STORAGE_KEY, archived!)
}

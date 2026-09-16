import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AGENTS_STORAGE_KEY } from '../src/lib/coreDataStorage'
import {
  LEGACY_EXPERTS_BASELINE_KEY,
  LEGACY_EXPERTS_SEED_FLAG,
  LEGACY_SHARED_AGENTS_KEY,
  hasCustomExperts,
  loadPersistedAgents,
  restoreLegacyExpertsToExistingProfiles,
} from '../src/lib/legacyExpertsRestore'
import type { Agent } from '../src/types/Agent'
import { createDefaultAgent, DEFAULT_AGENT_ID } from '../src/types/Agent'

class MemoryStorage implements Storage {
  private values = new Map<string, string>()

  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, String(value)) }
}

function makeExpert(id: string, name: string, extra: Partial<Agent> = {}): Agent {
  const now = '2026-07-19T17:16:08.481Z'
  return {
    id,
    name,
    description: `${name} description`,
    specialties: ['Finance'],
    isActive: true,
    systemPrompt: `You are ${name}.`,
    image: `data:image/png;base64,${id}`,
    createdAt: now,
    updatedAt: now,
    ...extra,
  }
}

const SHARED_EXPERTS: Agent[] = [
  makeExpert('agent-harry', 'Dr. Harry Kane'),
  makeExpert('agent-maeva', 'Maeva'),
  { ...createDefaultAgent(), createdAt: '2026-07-16T21:20:03.571Z', updatedAt: '2026-07-21T23:31:15.195Z' },
]

beforeEach(() => {
  const storage = new MemoryStorage()
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true })
  Object.defineProperty(globalThis, 'window', { value: { electronAPI: {} }, configurable: true })
})

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'window')
  Reflect.deleteProperty(globalThis, 'localStorage')
})

describe('legacy experts restore', () => {
  it('copies recovered experts onto existing profiles that only have the default assistant', () => {
    localStorage.setItem(
      'finocurve-saved-local-accounts',
      JSON.stringify([
        { email: 'cfred.okonta@gmail.com', hasCompletedOnboarding: true, updatedAt: '2026-09-14T00:00:00.000Z' },
        { email: 'info@neqtex.com', hasCompletedOnboarding: true, updatedAt: '2026-09-15T00:00:00.000Z' },
        { email: 'johndoe@gmail.com', hasCompletedOnboarding: true, updatedAt: '2026-07-19T00:00:00.000Z' },
      ]),
    )
    localStorage.setItem(`${AGENTS_STORAGE_KEY}:user:johndoe@gmail.com`, JSON.stringify(SHARED_EXPERTS))
    localStorage.setItem(`${AGENTS_STORAGE_KEY}:user:cfred.okonta@gmail.com`, JSON.stringify([createDefaultAgent()]))
    localStorage.setItem(`${AGENTS_STORAGE_KEY}:user:info@neqtex.com`, JSON.stringify([createDefaultAgent()]))
    localStorage.setItem('finocurve-preferences', JSON.stringify({ userEmail: 'cfred.okonta@gmail.com' }))

    restoreLegacyExpertsToExistingProfiles()

    const restoredCfred = JSON.parse(localStorage.getItem(`${AGENTS_STORAGE_KEY}:user:cfred.okonta@gmail.com`)!) as Agent[]
    const restoredInfo = JSON.parse(localStorage.getItem(`${AGENTS_STORAGE_KEY}:user:info@neqtex.com`)!) as Agent[]
    const johndoe = JSON.parse(localStorage.getItem(`${AGENTS_STORAGE_KEY}:user:johndoe@gmail.com`)!) as Agent[]
    const active = JSON.parse(localStorage.getItem(AGENTS_STORAGE_KEY)!) as Agent[]
    const snapshot = JSON.parse(localStorage.getItem(LEGACY_SHARED_AGENTS_KEY)!) as Agent[]

    expect(hasCustomExperts(restoredCfred)).toBe(true)
    expect(restoredCfred.map((agent) => agent.id).sort()).toEqual(SHARED_EXPERTS.map((agent) => agent.id).sort())
    expect(restoredInfo.map((agent) => agent.name)).toContain('Dr. Harry Kane')
    expect(johndoe).toHaveLength(SHARED_EXPERTS.length)
    expect(active.map((agent) => agent.name)).toContain('Maeva')
    expect(snapshot.map((agent) => agent.id)).toContain('agent-harry')
    expect(localStorage.getItem(LEGACY_EXPERTS_SEED_FLAG)).toBe('1')
  })

  it('does not overwrite a profile that already has custom experts', () => {
    const own = [createDefaultAgent(), makeExpert('agent-own', 'Only On This Profile')]
    localStorage.setItem('finocurve-saved-local-accounts', JSON.stringify([
      { email: 'own@example.com', hasCompletedOnboarding: true, updatedAt: '2026-09-01T00:00:00.000Z' },
      { email: 'donor@example.com', hasCompletedOnboarding: true, updatedAt: '2026-07-01T00:00:00.000Z' },
    ]))
    localStorage.setItem(`${AGENTS_STORAGE_KEY}:user:donor@example.com`, JSON.stringify(SHARED_EXPERTS))
    localStorage.setItem(`${AGENTS_STORAGE_KEY}:user:own@example.com`, JSON.stringify(own))

    restoreLegacyExpertsToExistingProfiles()

    const kept = JSON.parse(localStorage.getItem(`${AGENTS_STORAGE_KEY}:user:own@example.com`)!) as Agent[]
    expect(kept.map((agent) => agent.id)).toEqual([DEFAULT_AGENT_ID, 'agent-own'])
  })

  it('is idempotent after the first successful seed', () => {
    localStorage.setItem(
      'finocurve-saved-local-accounts',
      JSON.stringify([{ email: 'a@example.com', hasCompletedOnboarding: true, updatedAt: '2026-09-01T00:00:00.000Z' }]),
    )
    localStorage.setItem(`${AGENTS_STORAGE_KEY}:user:donor@example.com`, JSON.stringify(SHARED_EXPERTS))
    restoreLegacyExpertsToExistingProfiles()
    localStorage.setItem(`${AGENTS_STORAGE_KEY}:user:a@example.com`, JSON.stringify([createDefaultAgent()]))

    restoreLegacyExpertsToExistingProfiles()

    const after = JSON.parse(localStorage.getItem(`${AGENTS_STORAGE_KEY}:user:a@example.com`)!) as Agent[]
    expect(after).toHaveLength(1)
    expect(hasCustomExperts(after)).toBe(false)
  })

  it('loads the signed-in profile archive when the active key was cleared', () => {
    localStorage.setItem('finocurve-preferences', JSON.stringify({ userEmail: 'johndoe@gmail.com' }))
    localStorage.setItem(`${AGENTS_STORAGE_KEY}:user:johndoe@gmail.com`, JSON.stringify(SHARED_EXPERTS))

    expect(loadPersistedAgents().map((agent) => agent.name)).toContain('Dr. Harry Kane')
  })

  it('does not replace an active default-only list with an archived copy', () => {
    localStorage.setItem('finocurve-preferences', JSON.stringify({ userEmail: 'cfred.okonta@gmail.com' }))
    localStorage.setItem(AGENTS_STORAGE_KEY, JSON.stringify([createDefaultAgent()]))
    localStorage.setItem(`${AGENTS_STORAGE_KEY}:user:cfred.okonta@gmail.com`, JSON.stringify(SHARED_EXPERTS))

    expect(loadPersistedAgents()).toHaveLength(1)
    expect(hasCustomExperts(loadPersistedAgents())).toBe(false)
  })

  it('does nothing when no custom experts remain to recover', () => {
    localStorage.setItem(
      'finocurve-saved-local-accounts',
      JSON.stringify([{ email: 'a@example.com', hasCompletedOnboarding: true, updatedAt: '2026-09-01T00:00:00.000Z' }]),
    )
    localStorage.setItem(`${AGENTS_STORAGE_KEY}:user:a@example.com`, JSON.stringify([createDefaultAgent()]))

    restoreLegacyExpertsToExistingProfiles()

    expect(localStorage.getItem(LEGACY_EXPERTS_SEED_FLAG)).toBeNull()
    expect(localStorage.getItem(LEGACY_SHARED_AGENTS_KEY)).toBeNull()
  })

  it('strips provider credentials before copying experts to another profile', () => {
    const donor = [
      createDefaultAgent(),
      makeExpert('agent-bedrock', 'Bedrock Expert', {
        provider: 'bedrock',
        bedrockAccessKeyId: 'AKIAEXAMPLE',
        bedrockSecretKey: 'super-secret',
      }),
      makeExpert('agent-slack', 'Slack Expert', {
        provider: 'slack',
        slackUserToken: 'xoxp-secret',
        slackBotUserId: 'U0C1KK1S53L',
      }),
    ]
    localStorage.setItem('finocurve-saved-local-accounts', JSON.stringify([
      { email: 'donor@example.com', hasCompletedOnboarding: true, updatedAt: '2026-07-01T00:00:00.000Z' },
      { email: 'other@example.com', hasCompletedOnboarding: true, updatedAt: '2026-09-01T00:00:00.000Z' },
    ]))
    localStorage.setItem(`${AGENTS_STORAGE_KEY}:user:donor@example.com`, JSON.stringify(donor))
    localStorage.setItem(`${AGENTS_STORAGE_KEY}:user:other@example.com`, JSON.stringify([createDefaultAgent()]))

    restoreLegacyExpertsToExistingProfiles()

    const seeded = JSON.parse(localStorage.getItem(`${AGENTS_STORAGE_KEY}:user:other@example.com`)!) as Agent[]
    const bedrock = seeded.find((agent) => agent.id === 'agent-bedrock')!
    const slack = seeded.find((agent) => agent.id === 'agent-slack')!
    expect(bedrock.bedrockAccessKeyId).toBeUndefined()
    expect(bedrock.bedrockSecretKey).toBeUndefined()
    expect(slack.slackUserToken).toBeUndefined()
    // Non-secret configuration still travels so the expert only needs reconnecting.
    expect(slack.slackBotUserId).toBe('U0C1KK1S53L')
    expect(JSON.stringify(seeded)).not.toContain('super-secret')
    expect(JSON.stringify(localStorage.getItem(LEGACY_SHARED_AGENTS_KEY))).not.toContain('xoxp-secret')

    // The donor keeps its own credentials.
    const kept = JSON.parse(localStorage.getItem(`${AGENTS_STORAGE_KEY}:user:donor@example.com`)!) as Agent[]
    expect(kept.find((agent) => agent.id === 'agent-slack')!.slackUserToken).toBe('xoxp-secret')
  })

  it('keeps a profile\u2019s customized default assistant while merging recovered experts', () => {
    const customizedDefault: Agent = {
      ...createDefaultAgent(),
      name: 'My Renamed Copilot',
      systemPrompt: 'Answer only in bullet points.',
    }
    localStorage.setItem('finocurve-saved-local-accounts', JSON.stringify([
      { email: 'donor@example.com', hasCompletedOnboarding: true, updatedAt: '2026-07-01T00:00:00.000Z' },
      { email: 'tweaked@example.com', hasCompletedOnboarding: true, updatedAt: '2026-09-01T00:00:00.000Z' },
    ]))
    localStorage.setItem(`${AGENTS_STORAGE_KEY}:user:donor@example.com`, JSON.stringify(SHARED_EXPERTS))
    localStorage.setItem(`${AGENTS_STORAGE_KEY}:user:tweaked@example.com`, JSON.stringify([customizedDefault]))

    restoreLegacyExpertsToExistingProfiles()

    const merged = JSON.parse(localStorage.getItem(`${AGENTS_STORAGE_KEY}:user:tweaked@example.com`)!) as Agent[]
    const seededDefault = merged.find((agent) => agent.id === DEFAULT_AGENT_ID)!
    expect(seededDefault.name).toBe('My Renamed Copilot')
    expect(seededDefault.systemPrompt).toBe('Answer only in bullet points.')
    expect(merged.map((agent) => agent.name)).toContain('Dr. Harry Kane')
  })

  it('ignores an empty legacy snapshot in favour of the richest archive', () => {
    localStorage.setItem(LEGACY_SHARED_AGENTS_KEY, JSON.stringify([]))
    localStorage.setItem('finocurve-saved-local-accounts', JSON.stringify([
      { email: 'donor@example.com', hasCompletedOnboarding: true, updatedAt: '2026-07-01T00:00:00.000Z' },
      { email: 'empty@example.com', hasCompletedOnboarding: true, updatedAt: '2026-09-01T00:00:00.000Z' },
    ]))
    localStorage.setItem(`${AGENTS_STORAGE_KEY}:user:donor@example.com`, JSON.stringify(SHARED_EXPERTS))
    localStorage.setItem(`${AGENTS_STORAGE_KEY}:user:empty@example.com`, JSON.stringify([createDefaultAgent()]))

    restoreLegacyExpertsToExistingProfiles()

    const seeded = JSON.parse(localStorage.getItem(`${AGENTS_STORAGE_KEY}:user:empty@example.com`)!) as Agent[]
    expect(seeded.map((agent) => agent.name)).toContain('Dr. Harry Kane')
    const snapshot = JSON.parse(localStorage.getItem(LEGACY_SHARED_AGENTS_KEY)!) as Agent[]
    expect(snapshot.map((agent) => agent.id)).toContain('agent-harry')
  })

  it('does not treat experts created after the first empty run as legacy data', () => {
    localStorage.setItem('finocurve-saved-local-accounts', JSON.stringify([
      { email: 'a@example.com', hasCompletedOnboarding: true, updatedAt: '2026-09-01T00:00:00.000Z' },
      { email: 'b@example.com', hasCompletedOnboarding: true, updatedAt: '2026-09-01T00:00:00.000Z' },
    ]))
    localStorage.setItem(`${AGENTS_STORAGE_KEY}:user:a@example.com`, JSON.stringify([createDefaultAgent()]))
    localStorage.setItem(`${AGENTS_STORAGE_KEY}:user:b@example.com`, JSON.stringify([createDefaultAgent()]))

    restoreLegacyExpertsToExistingProfiles()
    expect(localStorage.getItem(LEGACY_EXPERTS_BASELINE_KEY)).toBeTruthy()

    // Profile A authors a brand new expert after the migration baseline.
    const brandNew = makeExpert('agent-new', 'Brand New', {
      createdAt: new Date(Date.now() + 60_000).toISOString(),
    })
    localStorage.setItem(`${AGENTS_STORAGE_KEY}:user:a@example.com`, JSON.stringify([createDefaultAgent(), brandNew]))

    restoreLegacyExpertsToExistingProfiles()

    const untouched = JSON.parse(localStorage.getItem(`${AGENTS_STORAGE_KEY}:user:b@example.com`)!) as Agent[]
    expect(untouched).toHaveLength(1)
    expect(hasCustomExperts(untouched)).toBe(false)
    expect(localStorage.getItem(LEGACY_SHARED_AGENTS_KEY)).toBeNull()
  })

  it('does not replace a nonempty active list during startup recovery', () => {
    const activeOnlyDefault = [createDefaultAgent()]
    localStorage.setItem('finocurve-preferences', JSON.stringify({ userEmail: 'cfred.okonta@gmail.com' }))
    localStorage.setItem('finocurve-saved-local-accounts', JSON.stringify([
      { email: 'cfred.okonta@gmail.com', hasCompletedOnboarding: true, updatedAt: '2026-09-01T00:00:00.000Z' },
      { email: 'donor@example.com', hasCompletedOnboarding: true, updatedAt: '2026-07-01T00:00:00.000Z' },
    ]))
    localStorage.setItem(AGENTS_STORAGE_KEY, JSON.stringify(activeOnlyDefault))
    localStorage.setItem(`${AGENTS_STORAGE_KEY}:user:donor@example.com`, JSON.stringify(SHARED_EXPERTS))
    localStorage.setItem(`${AGENTS_STORAGE_KEY}:user:cfred.okonta@gmail.com`, JSON.stringify([createDefaultAgent()]))

    restoreLegacyExpertsToExistingProfiles()

    const active = JSON.parse(localStorage.getItem(AGENTS_STORAGE_KEY)!) as Agent[]
    expect(active).toHaveLength(1)
    expect(hasCustomExperts(active)).toBe(false)
  })
})

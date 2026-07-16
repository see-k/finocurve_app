import { describe, expect, it } from 'vitest'
import type { Agent } from '../src/types/Agent'
import { createDefaultAgent, isDefaultAgent, DEFAULT_AGENT_ID, isAgentActive } from '../src/types/Agent'

/** Mirror of the store's seeding rule so the guarantee is unit-testable without React. */
function ensureDefaultAgent(agents: Agent[]): Agent[] {
  if (agents.some(isDefaultAgent)) return agents
  return [createDefaultAgent(), ...agents]
}

/** Mirror of the store's delete guard: default agents are never removed. */
function deleteAgent(agents: Agent[], id: string): Agent[] {
  return agents.filter((a) => a.id !== id || isDefaultAgent(a))
}

function makeAgent(id: string): Agent {
  const now = new Date().toISOString()
  return { id, name: id, systemPrompt: 'x', createdAt: now, updatedAt: now }
}

describe('default assistant agent', () => {
  it('creates a recognizable, active, full-access default', () => {
    const def = createDefaultAgent()
    expect(def.id).toBe(DEFAULT_AGENT_ID)
    expect(isDefaultAgent(def)).toBe(true)
    expect(isAgentActive(def)).toBe(true)
    expect(def.toolAccess).toBe('all')
  })

  it('seeds a default into a fresh (empty) list', () => {
    const seeded = ensureDefaultAgent([])
    expect(seeded).toHaveLength(1)
    expect(isDefaultAgent(seeded[0])).toBe(true)
  })

  it('migrates existing experts by prepending exactly one default', () => {
    const seeded = ensureDefaultAgent([makeAgent('a'), makeAgent('b')])
    expect(seeded).toHaveLength(3)
    expect(seeded.filter(isDefaultAgent)).toHaveLength(1)
    expect(isDefaultAgent(seeded[0])).toBe(true)
  })

  it('does not add a second default when one already exists', () => {
    const start = [createDefaultAgent(), makeAgent('a')]
    expect(ensureDefaultAgent(start)).toBe(start)
  })

  it('refuses to delete the default but removes other agents', () => {
    const list = [createDefaultAgent(), makeAgent('a')]
    expect(deleteAgent(list, DEFAULT_AGENT_ID)).toHaveLength(2)
    expect(deleteAgent(list, 'a').map((a) => a.id)).toEqual([DEFAULT_AGENT_ID])
  })
})

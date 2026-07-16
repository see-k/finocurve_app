import { useState, useEffect, useCallback } from 'react'
import type { Agent, AgentInput } from '../types/Agent'
import { AGENTS_STORAGE_KEY, getCoreDataItem, setCoreDataItem } from '../lib/coreDataStorage'

function load(): Agent[] {
  try {
    const stored = getCoreDataItem(AGENTS_STORAGE_KEY)
    if (stored) return JSON.parse(stored)
  } catch { /* ignore */ }
  return []
}

function save(agents: Agent[]) {
  try { setCoreDataItem(AGENTS_STORAGE_KEY, JSON.stringify(agents)) } catch { /* ignore */ }
}

function makeId(): string {
  return `agent-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/** SQLite-backed CRUD store with a synchronous local compatibility cache. */
export function useAgents() {
  const [agents, setAgents] = useState<Agent[]>(load)

  useEffect(() => { save(agents) }, [agents])

  const getAgent = useCallback(
    (id: string) => agents.find((a) => a.id === id),
    [agents],
  )

  const createAgent = useCallback((input: AgentInput): Agent => {
    const now = new Date().toISOString()
    const agent: Agent = {
      id: makeId(),
      name: input.name,
      description: input.description,
      specialties: input.specialties,
      isActive: input.isActive ?? true,
      systemPrompt: input.systemPrompt,
      image: input.image,
      provider: input.provider,
      model: input.model,
      toolAccess: input.toolAccess ?? 'all',
      enabledToolNames: input.enabledToolNames,
      createdAt: now,
      updatedAt: now,
    }
    setAgents((prev) => [agent, ...prev])
    return agent
  }, [])

  const updateAgent = useCallback((id: string, input: AgentInput) => {
    setAgents((prev) => prev.map((a) => (
      a.id === id
        ? { ...a, ...input, updatedAt: new Date().toISOString() }
        : a
    )))
  }, [])

  const deleteAgent = useCallback((id: string) => {
    setAgents((prev) => prev.filter((a) => a.id !== id))
  }, [])

  return { agents, getAgent, createAgent, updateAgent, deleteAgent }
}

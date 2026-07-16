import { useState, useEffect, useCallback } from 'react'
import type { Agent, AgentInput } from '../types/Agent'

const STORAGE_KEY = 'finocurve-agents'

function load(): Agent[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return JSON.parse(stored)
  } catch { /* ignore */ }
  return []
}

function save(agents: Agent[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(agents)) } catch { /* ignore */ }
}

function makeId(): string {
  return `agent-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/** localStorage-backed CRUD store for user-defined AI agents. */
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
      systemPrompt: input.systemPrompt,
      image: input.image,
      provider: input.provider,
      model: input.model,
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

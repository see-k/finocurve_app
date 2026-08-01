import { useState, useEffect, useCallback, useRef } from 'react'
import type { Agent, AgentInput } from '../types/Agent'
import { createDefaultAgent, isDefaultAgent } from '../types/Agent'
import { AGENTS_STORAGE_KEY, getCoreDataItem, setCoreDataItem } from '../lib/coreDataStorage'
import { usePreferences } from './usePreferences'

/** Stable id for the signed-in profile; agents are archived/restored per identity on sign-in/out. */
function currentIdentity(userEmail?: string, isGuest?: boolean): string {
  const email = userEmail?.trim().toLowerCase()
  if (email) return email
  return isGuest ? 'guest' : 'local'
}

/**
 * Guarantee the built-in default assistant always exists (fresh installs and migration for existing
 * users who have experts but no default). Keeps the app to at least one agent at all times.
 */
function ensureDefaultAgent(agents: Agent[]): Agent[] {
  if (agents.some(isDefaultAgent)) return agents
  return [createDefaultAgent(), ...agents]
}

function load(): Agent[] {
  try {
    const stored = getCoreDataItem(AGENTS_STORAGE_KEY)
    if (stored) return ensureDefaultAgent(JSON.parse(stored) as Agent[])
  } catch { /* ignore */ }
  return ensureDefaultAgent([])
}

function save(agents: Agent[]) {
  try { setCoreDataItem(AGENTS_STORAGE_KEY, JSON.stringify(agents)) } catch { /* ignore */ }
}

function makeId(): string {
  return `agent-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/** SQLite-backed CRUD store with a synchronous local compatibility cache. */
export function useAgents() {
  const { prefs } = usePreferences()
  const identity = currentIdentity(prefs.userEmail, prefs.isGuest)
  const [agents, setAgents] = useState<Agent[]>(load)
  // When the signed-in profile changes, the active storage key has already been
  // swapped by archive/restore. Reload from it instead of persisting the
  // previous profile's in-memory experts back over the freshly scoped data.
  const lastHandledIdentityRef = useRef<string | null>(null)

  useEffect(() => {
    if (lastHandledIdentityRef.current !== identity) {
      lastHandledIdentityRef.current = identity
      setAgents(load())
      return
    }
    save(agents)
  }, [identity, agents])

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
      ollamaBaseUrl: input.ollamaBaseUrl,
      bedrockRegion: input.bedrockRegion,
      bedrockAccessKeyId: input.bedrockAccessKeyId,
      bedrockSecretKey: input.bedrockSecretKey,
      azureEndpoint: input.azureEndpoint,
      azureApiKey: input.azureApiKey,
      toolAccess: input.toolAccess ?? 'all',
      enabledToolNames: input.enabledToolNames,
      toolLimits: input.toolLimits,
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
    setAgents((prev) => prev.filter((a) => a.id !== id || isDefaultAgent(a)))
  }, [])

  return { agents, getAgent, createAgent, updateAgent, deleteAgent }
}

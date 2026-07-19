import { describe, expect, it } from 'vitest'
import {
  agentsRequiringProviderDataShare,
  requiresProviderDataShareRetention,
} from '../src/ai/bedrockRetention'
import type { Agent } from '../src/types/Agent'

const baseAgent = (overrides: Partial<Agent> & Pick<Agent, 'id' | 'name'>): Agent => ({
  systemPrompt: 'test',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
})

describe('requiresProviderDataShareRetention', () => {
  it('matches Fable 5 and Mythos 5 Bedrock / inference IDs', () => {
    expect(requiresProviderDataShareRetention('us.anthropic.claude-fable-5')).toBe(true)
    expect(requiresProviderDataShareRetention('anthropic.claude-fable-5')).toBe(true)
    expect(requiresProviderDataShareRetention('anthropic.claude-mythos-5')).toBe(true)
    expect(requiresProviderDataShareRetention('Claude Fable 5')).toBe(true)
  })

  it('does not match ordinary Claude or empty models', () => {
    expect(requiresProviderDataShareRetention('anthropic.claude-3-5-sonnet-20240620-v1:0')).toBe(false)
    expect(requiresProviderDataShareRetention('us.anthropic.claude-sonnet-4-20250514-v1:0')).toBe(false)
    expect(requiresProviderDataShareRetention('llama3.2')).toBe(false)
    expect(requiresProviderDataShareRetention('')).toBe(false)
    expect(requiresProviderDataShareRetention(undefined)).toBe(false)
  })
})

describe('agentsRequiringProviderDataShare', () => {
  it('flags agents that inherit a Fable primary model on Bedrock', () => {
    const agent = baseAgent({ id: 'a', name: 'Kevin' })
    expect(
      agentsRequiringProviderDataShare([agent], 'bedrock', 'us.anthropic.claude-fable-5').map((a) => a.id),
    ).toEqual(['a'])
  })

  it('ignores Ollama even when the model string looks like Fable', () => {
    const agent = baseAgent({ id: 'a', name: 'Local', provider: 'ollama', model: 'claude-fable-5' })
    expect(agentsRequiringProviderDataShare([agent], 'bedrock', 'us.anthropic.claude-fable-5')).toEqual([])
  })

  it('uses per-agent overrides over the primary model', () => {
    const safe = baseAgent({
      id: 'safe',
      name: 'Safe',
      provider: 'bedrock',
      model: 'anthropic.claude-3-haiku-20240307-v1:0',
    })
    const risky = baseAgent({
      id: 'risky',
      name: 'Risky',
      provider: 'bedrock',
      model: 'anthropic.claude-mythos-5',
    })
    expect(
      agentsRequiringProviderDataShare(
        [safe, risky],
        'bedrock',
        'us.anthropic.claude-fable-5',
      ).map((a) => a.id),
    ).toEqual(['risky'])
  })
})

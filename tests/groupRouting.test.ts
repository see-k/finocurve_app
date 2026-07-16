import { describe, expect, it } from 'vitest'
import {
  parseSmartRoutingDecision,
  planGroupResponders,
  rankAgentsByRelevance,
} from '../src/ai/GroupChatOrchestrator'
import type { Agent } from '../src/types/Agent'
import type { Conversation } from '../src/types/Conversation'

const agents: Agent[] = [
  {
    id: 'risk',
    name: 'Anna Brown',
    description: 'Portfolio risk and volatility analyst',
    systemPrompt: 'Analyze concentration, drawdown, correlations, and risk metrics.',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'loans',
    name: 'Josh Miller',
    description: 'Debt and loan payoff advisor',
    systemPrompt: 'Analyze interest rates, amortization, refinancing, and loan payments.',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'filings',
    name: 'Priya Shah',
    description: 'SEC filing research specialist',
    systemPrompt: 'Review SEC filings, annual reports, and company disclosures.',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
]

const conversation: Conversation = {
  id: 'room',
  title: 'Advisory room',
  participantAgentIds: agents.map((agent) => agent.id),
  messages: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('group responder planning', () => {
  it('routes direct mentions in the order they appear', () => {
    const plan = planGroupResponders(conversation, agents, '@Josh check the loan, then @Anna review the risk')

    expect(plan).toEqual({
      agentIds: ['loans', 'risk'],
      directlyAddressed: true,
      source: 'mention',
    })
  })

  it('lets @everyone override individual mentions and reshuffles the full room', () => {
    const plan = planGroupResponders(conversation, agents, '@Anna and @everyone weigh in', () => 0)

    expect(plan.source).toBe('everyone')
    expect(plan.directlyAddressed).toBe(false)
    expect(new Set(plan.agentIds)).toEqual(new Set(['risk', 'loans', 'filings']))
  })

  it('does not route an ambiguous first-name mention', () => {
    const duplicateAnna: Agent = { ...agents[2], id: 'risk-two', name: 'Anna Smith' }
    const room = { ...conversation, participantAgentIds: ['risk', 'risk-two'] }
    const plan = planGroupResponders(room, [agents[0], duplicateAnna], '@Anna can you review this?', () => 0)

    expect(plan.source).toBe('random')
    expect(plan.directlyAddressed).toBe(false)
  })
})

describe('smart routing output', () => {
  it('validates IDs, accepts names, removes duplicates, and sorts priorities', () => {
    const result = parseSmartRoutingDecision(
      `Model output:\n{"summary":"Use risk first, then filings.","routes":[` +
        `{"agentId":"Priya Shah","priority":2},` +
        `{"agentId":"RISK","priority":1},` +
        `{"agentId":"risk","priority":3},` +
        `{"agentId":"not-in-room","priority":4}]}`,
      agents,
    )

    expect(result).toEqual({
      agentIds: ['risk', 'filings'],
      rationale: 'Use risk first, then filings.',
    })
  })

  it('rejects malformed or untrusted selections', () => {
    expect(parseSmartRoutingDecision('not json', agents)).toEqual({ agentIds: [] })
    expect(parseSmartRoutingDecision('{"routes":[{"agentId":"outsider"}]}', agents)).toEqual({ agentIds: [] })
  })

  it('uses deterministic expertise matching as a malformed-provider fallback', () => {
    expect(rankAgentsByRelevance('Can you review loan refinancing and interest payments?', agents)).toEqual(['loans'])
    expect(rankAgentsByRelevance('Please help me with this', agents)).toEqual([])
  })
})

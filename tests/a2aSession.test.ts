import { describe, expect, it } from 'vitest'
import { a2aSessionRef, isA2ASessionRef, resumeA2ASession } from '../src/ai/a2aSession'

const atlas = { id: 'agent-atlas', provider: 'a2a' as const, a2aUrl: 'http://127.0.0.1:47821', a2aAgentId: 'profile:atlas' }
const session = { contextId: 'hg_1', url: 'http://127.0.0.1:47821', agentId: 'profile:atlas' }

describe('a2aSessionRef', () => {
  it('pins the session to the expert configuration', () => {
    expect(a2aSessionRef(atlas, 'hg_1')).toEqual(session)
    expect(a2aSessionRef({ ...atlas, provider: 'slack' }, 'hg_1')).toBeUndefined()
    expect(a2aSessionRef(atlas, undefined)).toBeUndefined()
  })

  it('validates persisted refs', () => {
    expect(isA2ASessionRef(session)).toBe(true)
    expect(isA2ASessionRef({ contextId: '', url: 'x' })).toBe(false)
    expect(isA2ASessionRef('hg_1')).toBe(false)
  })
})

describe('resumeA2ASession', () => {
  it('starts fresh when the expert has not replied yet', () => {
    expect(resumeA2ASession(atlas, [{}], 1)).toBeUndefined()
  })

  it('continues from the last reply and counts only what came after it', () => {
    const history = [
      {},
      { senderAgentId: 'agent-atlas', a2aSession: session },
      {},
      { senderAgentId: 'agent-athena' },
      {},
    ]
    // One request-only prompt appended after the visible transcript.
    expect(resumeA2ASession(atlas, history, 6)).toEqual({ contextId: 'hg_1', newMessageCount: 4 })
  })

  it('skips replies that did not carry a session, such as errors', () => {
    const history = [
      { senderAgentId: 'agent-atlas', a2aSession: session },
      {},
      { senderAgentId: 'agent-atlas' },
      {},
    ]
    expect(resumeA2ASession(atlas, history, 4)).toEqual({ contextId: 'hg_1', newMessageCount: 3 })
  })

  it('starts a new session after the expert is pointed at another agent', () => {
    const history = [{ senderAgentId: 'agent-atlas', a2aSession: session }, {}]
    expect(resumeA2ASession({ ...atlas, a2aAgentId: 'profile:athena' }, history, 2)).toBeUndefined()
    expect(resumeA2ASession({ ...atlas, a2aUrl: 'http://127.0.0.1:9999' }, history, 2)).toBeUndefined()
  })

  it('ignores non-A2A experts', () => {
    expect(resumeA2ASession({ ...atlas, provider: 'ollama' }, [{ senderAgentId: 'agent-atlas', a2aSession: session }, {}], 2))
      .toBeUndefined()
  })
})

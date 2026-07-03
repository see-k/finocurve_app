import { describe, expect, it } from 'vitest'
import { buildAgentCard, extractTextFromA2AParts } from './a2aProtocolHelpers'

describe('extractTextFromA2AParts', () => {
  it('collects text from parts using type or kind', () => {
    const out = extractTextFromA2AParts([
      { type: 'text', text: 'hello' },
      { kind: 'text', text: 'world' },
      { type: 'image', text: 'ignored' },
      { kind: 'text', text: '' },
    ])
    expect(out).toBe('hello\nworld')
  })

  it('returns empty string when no text parts are present', () => {
    expect(extractTextFromA2AParts([])).toBe('')
    expect(extractTextFromA2AParts([{ type: 'data', data: { x: 1 } }])).toBe('')
  })
})

describe('buildAgentCard', () => {
  it('includes semver version and localhost URL for the supplied port', () => {
    const card = buildAgentCard(3847)
    expect(card.url).toBe('http://127.0.0.1:3847/')
    expect(card.version).toMatch(/^\d+\.\d+\.\d+/)
    expect(card.protocolVersion).toBe('0.3.0')
    expect(card.skills[0]?.id).toBe('financial-analysis')
  })
})

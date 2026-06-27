import { AIMessage, AIMessageChunk } from '@langchain/core/messages'
import { describe, expect, it } from 'vitest'
import {
  extractStreamingContent,
  fileExtLower,
  hasAppBuiltinBrowserTools,
  isProbablyUtf8TextFile,
  isVisionImageMime,
  normalizeChatFollowUps,
  parseAdvancedAnalysisResponse,
  parseContentToChunks,
  parseInsightResponse,
  ThinkTagParser,
} from './localAIChatParsing'

describe('extractStreamingContent', () => {
  it('returns answer text from string chunks', () => {
    const chunk = new AIMessageChunk({ content: 'Hello' })
    expect(extractStreamingContent(chunk)).toEqual({ type: 'answer', content: 'Hello' })
  })

  it('ignores empty string chunks', () => {
    const chunk = new AIMessageChunk({ content: '' })
    expect(extractStreamingContent(chunk)).toBeNull()
  })

  it('prefers reasoning blocks in structured content', () => {
    const chunk = new AIMessageChunk({
      content: [{ type: 'reasoning', reasoning: 'plan step' }],
    })
    expect(extractStreamingContent(chunk)).toEqual({ type: 'reasoning', content: 'plan step' })
  })

  it('reads thinking blocks as reasoning', () => {
    const chunk = new AIMessageChunk({
      content: [{ type: 'thinking', reasoning: 'internal note' }],
    })
    expect(extractStreamingContent(chunk)).toEqual({ type: 'reasoning', content: 'internal note' })
  })

  it('reads text blocks as answer', () => {
    const chunk = new AIMessageChunk({
      content: [{ type: 'text', text: 'visible reply' }],
    })
    expect(extractStreamingContent(chunk)).toEqual({ type: 'answer', content: 'visible reply' })
  })
})

describe('ThinkTagParser', () => {
  it('splits reasoning and answer in one chunk', () => {
    const parser = new ThinkTagParser()
    expect(parser.parse('Answer before<think>secret</think>after')).toEqual([
      { type: 'answer', content: 'Answer before' },
      { type: 'reasoning', content: 'secret' },
      { type: 'answer', content: 'after' },
    ])
  })

  it('carries open think tags across chunks', () => {
    const parser = new ThinkTagParser()
    expect(parser.parse('start<think>part ')).toEqual([
      { type: 'answer', content: 'start' },
      { type: 'reasoning', content: 'part ' },
    ])
    expect(parser.parse('two</think>done')).toEqual([
      { type: 'reasoning', content: 'two' },
      { type: 'answer', content: 'done' },
    ])
  })
})

describe('normalizeChatFollowUps', () => {
  it('filters empty items, caps count, and trims lengths', () => {
    const items = Array.from({ length: 7 }, (_, i) => ({
      label: ` label-${i} `.repeat(20),
      prompt: ` prompt-${i} `.repeat(500),
    }))
    items.push({ label: '   ', prompt: 'skip me' })

    const normalized = normalizeChatFollowUps(items)
    expect(normalized).toHaveLength(5)
    expect(normalized[0].label.length).toBeLessThanOrEqual(100)
    expect(normalized[0].prompt.length).toBeLessThanOrEqual(4000)
  })
})

describe('hasAppBuiltinBrowserTools', () => {
  it('detects built-in browser tools by prefix', () => {
    expect(hasAppBuiltinBrowserTools([{ name: 'app_browser_navigate' } as never])).toBe(true)
    expect(hasAppBuiltinBrowserTools([{ name: 'filesystem_read' } as never])).toBe(false)
  })
})

describe('attachment classification helpers', () => {
  it('accepts common vision mime types', () => {
    expect(isVisionImageMime('image/png')).toBe(true)
    expect(isVisionImageMime('IMAGE/JPEG; charset=utf-8')).toBe(true)
    expect(isVisionImageMime('application/pdf')).toBe(false)
  })

  it('treats csv/tsx files and text mime types as text-like', () => {
    expect(isProbablyUtf8TextFile('report.csv', 'application/octet-stream')).toBe(true)
    expect(isProbablyUtf8TextFile('Component.tsx', 'application/octet-stream')).toBe(true)
    expect(fileExtLower('notes.TXT')).toBe('.txt')
    expect(isProbablyUtf8TextFile('photo.bin', 'application/octet-stream')).toBe(false)
  })
})

describe('parseContentToChunks', () => {
  const legacyThinkTaggedAnswer =
    '<think>reason<' + '/think>Visible answer'

  it('extracts think tags when contentBlocks are unavailable', () => {
    const message = new AIMessage(legacyThinkTaggedAnswer)
    Object.defineProperty(message, 'contentBlocks', { value: [] })

    expect(parseContentToChunks(message)).toEqual([
      { type: 'reasoning', content: 'reason' },
      { type: 'answer', content: 'Visible answer' },
    ])
  })

  it('returns text blocks verbatim when contentBlocks are present', () => {
    const chunks = parseContentToChunks(new AIMessage(legacyThinkTaggedAnswer))
    expect(chunks).toEqual([
      {
        type: 'answer',
        content: legacyThinkTaggedAnswer,
      },
    ])
  })
})

describe('parseInsightResponse', () => {
  it('parses JSON embedded in prose', () => {
    const parsed = parseInsightResponse(
      'Here is the analysis {"summary":"Risky loan","riskRelevantPoints":["high LTV"],"recommendations":["review"]}',
      'doc-1',
      'Loan.pdf'
    )
    expect(parsed.summary).toBe('Risky loan')
    expect(parsed.riskRelevantPoints).toEqual(['high LTV'])
  })

  it('falls back safely on invalid JSON', () => {
    const parsed = parseInsightResponse('not json at all', 'doc-2', 'Bad.pdf')
    expect(parsed.summary).toBe('not json at all')
    expect(parsed.riskRelevantPoints).toEqual([])
  })
})

describe('parseAdvancedAnalysisResponse', () => {
  it('builds report sections from JSON keys', () => {
    const { sections } = parseAdvancedAnalysisResponse(
      JSON.stringify({
        executiveSummary: 'Overview',
        keyFindings: ['Finding one'],
        recommendations: ['Do this'],
      })
    )
    expect(sections.map((s) => s.title)).toEqual(['Executive Summary', 'Key Findings', 'Recommendations'])
  })

  it('returns a fallback section when JSON is missing', () => {
    const { sections } = parseAdvancedAnalysisResponse('')
    expect(sections).toEqual([{ title: 'Analysis', content: 'No analysis content was produced.' }])
  })
})

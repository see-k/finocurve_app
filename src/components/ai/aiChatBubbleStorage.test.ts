// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  chatStorageKeyForUser,
  loadChatMessages,
  MAX_PERSISTED_CHAT_MESSAGES,
  persistChatMessages,
  stripChatAttachmentPayloads,
} from './aiChatBubbleStorage'

describe('chatStorageKeyForUser', () => {
  it('uses trimmed email, guest, or local fallback', () => {
    expect(chatStorageKeyForUser('  user@example.com  ')).toBe('finocurve-ai-chat-messages-user@example.com')
    expect(chatStorageKeyForUser(undefined, true)).toBe('finocurve-ai-chat-messages-guest')
    expect(chatStorageKeyForUser()).toBe('finocurve-ai-chat-messages-local')
  })
})

describe('loadChatMessages', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns empty array for missing or invalid storage', () => {
    expect(loadChatMessages('missing-key')).toEqual([])
    localStorage.setItem('bad-key', '{not json')
    expect(loadChatMessages('bad-key')).toEqual([])
    localStorage.setItem('bad-key', JSON.stringify({ not: 'array' }))
    expect(loadChatMessages('bad-key')).toEqual([])
  })

  it('keeps attachment-only user messages and filters malformed roles', () => {
    localStorage.setItem(
      'chat-key',
      JSON.stringify([
        { role: 'system', content: 'ignored' },
        { role: 'user', content: '', attachments: [{ name: 'chart.png', mimeType: 'image/png' }] },
        { role: 'assistant', content: 'Here is the analysis.' },
        { role: 'user', content: '  ', attachments: [{ name: 123 }] },
      ])
    )
    const loaded = loadChatMessages('chat-key')
    expect(loaded).toHaveLength(2)
    expect(loaded[0].attachments?.[0].name).toBe('chart.png')
    expect(loaded[0].attachments?.[0].dataBase64).toBe('')
    expect(loaded[1].content).toContain('analysis')
  })

  it('sanitizes follow-up chips requiring non-empty label and prompt', () => {
    localStorage.setItem(
      'chat-key',
      JSON.stringify([
        {
          role: 'assistant',
          content: 'Done.',
          followUps: [
            { label: '  Compare  ', prompt: ' Compare holdings ' },
            { label: '', prompt: 'bad' },
            { label: 'Ok', prompt: '   ' },
          ],
        },
      ])
    )
    expect(loadChatMessages('chat-key')[0].followUps).toEqual([
      { label: '  Compare  ', prompt: ' Compare holdings ' },
    ])
  })
})

describe('persistChatMessages', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('trims history to MAX_PERSISTED_CHAT_MESSAGES', () => {
    const key = 'chat-key'
    const messages = Array.from({ length: MAX_PERSISTED_CHAT_MESSAGES + 5 }, (_, i) => ({
      role: 'user' as const,
      content: `msg-${i}`,
    }))
    persistChatMessages(key, messages)
    const saved = JSON.parse(localStorage.getItem(key)!) as { content: string }[]
    expect(saved).toHaveLength(MAX_PERSISTED_CHAT_MESSAGES)
    expect(saved[0].content).toBe('msg-5')
  })

  it('stripChatAttachmentPayloads clears base64 before quota fallback saves', () => {
    const big = 'A'.repeat(100)
    const stripped = stripChatAttachmentPayloads([
      {
        role: 'user',
        content: 'with attachment',
        attachments: [{ name: 'doc.pdf', mimeType: 'application/pdf', dataBase64: big }],
      },
    ])
    expect(stripped[0].attachments?.[0].dataBase64).toBe('')
    expect(stripped[0].attachments?.[0].name).toBe('doc.pdf')
  })
})

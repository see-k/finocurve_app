import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetText, mockDestroy } = vi.hoisted(() => ({
  mockGetText: vi.fn(),
  mockDestroy: vi.fn(),
}))

vi.mock('pdf-parse/worker', () => ({
  getPath: vi.fn(() => '/fake/pdf-worker'),
  getData: vi.fn(() => new Uint8Array([1, 2, 3])),
}))

vi.mock('pdf-parse', () => ({
  PDFParse: Object.assign(
    vi.fn().mockImplementation(() => ({
      getText: mockGetText,
      destroy: mockDestroy,
    })),
    { setWorker: vi.fn() }
  ),
}))

import { HumanMessage } from '@langchain/core/messages'
import {
  chatUserToHumanMessage,
  MAX_ATTACHMENT_TEXT_CHARS,
  MAX_VISION_IMAGE_BYTES,
} from './chatUserToHumanMessage'

describe('chatUserToHumanMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetText.mockResolvedValue({ text: 'Parsed PDF body' })
    mockDestroy.mockResolvedValue(undefined)
  })

  it('returns plain HumanMessage when there are no attachments', async () => {
    const msg = await chatUserToHumanMessage({ role: 'user', content: 'Hello' })
    expect(msg).toBeInstanceOf(HumanMessage)
    expect(msg.content).toBe('Hello')
  })

  it('reports empty attachments in supplemental text', async () => {
    const invalid = await chatUserToHumanMessage({
      role: 'user',
      content: 'See files',
      attachments: [{ name: 'empty.txt', mimeType: 'text/plain', dataBase64: '' }],
    })
    const text = String(invalid.content)
    expect(text).toContain('empty file')
  })

  it('embeds vision images as image_url blocks under the size limit', async () => {
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
    const b64 = Buffer.from(pngBytes).toString('base64')
    const msg = await chatUserToHumanMessage({
      role: 'user',
      content: 'What is this chart?',
      attachments: [{ name: 'chart.png', mimeType: 'image/png', dataBase64: b64 }],
    })
    expect(Array.isArray(msg.content)).toBe(true)
    const blocks = msg.content as Array<{ type: string; image_url?: { url: string }; text?: string }>
    expect(blocks.some((b) => b.type === 'image_url' && b.image_url?.url.startsWith('data:image/png;base64,'))).toBe(
      true
    )
  })

  it('skips oversized vision images with an explanatory note', async () => {
    const huge = Buffer.alloc(MAX_VISION_IMAGE_BYTES + 1, 1).toString('base64')
    const msg = await chatUserToHumanMessage({
      role: 'user',
      content: 'Big image',
      attachments: [{ name: 'huge.png', mimeType: 'image/png', dataBase64: huge }],
    })
    const text = String(msg.content)
    expect(text).toContain('skipped')
    expect(text).toContain(`${MAX_VISION_IMAGE_BYTES / 1024 / 1024}MB`)
  })

  it('inlines extracted document text and truncates very long bodies', async () => {
    const long = 'z'.repeat(MAX_ATTACHMENT_TEXT_CHARS + 100)
    const msg = await chatUserToHumanMessage({
      role: 'user',
      content: 'Summarize',
      attachments: [{ name: 'notes.txt', mimeType: 'text/plain', dataBase64: Buffer.from(long).toString('base64') }],
    })
    const text = String(msg.content)
    expect(text).toContain('--- notes.txt ---')
    expect(text).toContain('[truncated]')
    expect(text.length).toBeLessThan(long.length)
  })

  it('inlines attachment text when user message body is whitespace-only', async () => {
    const msg = await chatUserToHumanMessage({
      role: 'user',
      content: '   ',
      attachments: [{ name: 'notes.txt', mimeType: 'text/plain', dataBase64: Buffer.from('hello').toString('base64') }],
    })
    expect(String(msg.content)).toContain('--- notes.txt ---')
    expect(String(msg.content)).toContain('hello')
  })

  it('surfaces pdf extraction failures without throwing', async () => {
    mockGetText.mockRejectedValueOnce(new Error('corrupt stream'))
    const msg = await chatUserToHumanMessage({
      role: 'user',
      content: 'Review',
      attachments: [
        {
          name: 'broken.pdf',
          mimeType: 'application/pdf',
          dataBase64: Buffer.from('%PDF-1.4').toString('base64'),
        },
      ],
    })
    expect(String(msg.content)).toContain('text extraction failed')
    expect(String(msg.content)).toContain('corrupt stream')
  })
})

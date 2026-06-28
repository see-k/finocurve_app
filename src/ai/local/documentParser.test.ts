import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetText, mockDestroy, mockSetWorker } = vi.hoisted(() => ({
  mockGetText: vi.fn(),
  mockDestroy: vi.fn(),
  mockSetWorker: vi.fn(),
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
    { setWorker: mockSetWorker }
  ),
}))

import { extractTextFromDocument } from './documentParser'

describe('extractTextFromDocument', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetText.mockResolvedValue({ text: 'Parsed PDF body' })
    mockDestroy.mockResolvedValue(undefined)
  })

  it('decodes plain text files by extension', async () => {
    const buffer = new TextEncoder().encode('hello notes')
    await expect(extractTextFromDocument(buffer, undefined, 'notes.txt')).resolves.toBe('hello notes')
  })

  it('decodes plain text files by mime type', async () => {
    const buffer = new TextEncoder().encode('mime body')
    await expect(extractTextFromDocument(buffer, 'text/plain;charset=utf-8')).resolves.toBe('mime body')
  })

  it('decodes csv files', async () => {
    const buffer = new TextEncoder().encode('a,b\n1,2')
    await expect(extractTextFromDocument(buffer, 'text/csv', 'export.csv')).resolves.toBe('a,b\n1,2')
  })

  it('routes pdf files by extension to pdf-parse', async () => {
    const buffer = new Uint8Array([0x00, 0x01, 0x02])
    await expect(extractTextFromDocument(buffer, undefined, 'report.pdf')).resolves.toBe('Parsed PDF body')
    expect(mockGetText).toHaveBeenCalledOnce()
    expect(mockDestroy).toHaveBeenCalledOnce()
  })

  it('routes pdf files by mime type', async () => {
    const buffer = new Uint8Array([0x00, 0x01, 0x02])
    await expect(extractTextFromDocument(buffer, 'application/pdf', 'upload')).resolves.toBe('Parsed PDF body')
  })

  it('detects pdf by magic bytes when extension is missing', async () => {
    const buffer = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])
    await expect(extractTextFromDocument(buffer)).resolves.toBe('Parsed PDF body')
  })

  it('returns empty string for unknown formats', async () => {
    const buffer = new Uint8Array([0x00, 0x01, 0x02, 0x03])
    await expect(extractTextFromDocument(buffer, 'application/octet-stream', 'archive.bin')).resolves.toBe('')
    expect(mockGetText).not.toHaveBeenCalled()
  })

  it('wraps pdf parse failures with a clear error', async () => {
    mockGetText.mockRejectedValueOnce(new Error('corrupt stream'))
    const buffer = new Uint8Array([0x25, 0x50, 0x44, 0x46])

    await expect(extractTextFromDocument(buffer, 'application/pdf', 'broken.pdf')).rejects.toThrow(
      'PDF extraction failed: corrupt stream'
    )
  })
})

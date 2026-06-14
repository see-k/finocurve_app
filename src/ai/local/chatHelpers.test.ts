import { describe, expect, it } from 'vitest'
import {
  isAbortError,
  MAX_TOOL_MESSAGE_CHARS,
  raceWithAbort,
  sanitizeToolResultForModel,
} from './chatHelpers'

describe('isAbortError', () => {
  it('detects AbortError by name, message, and code', () => {
    expect(isAbortError(Object.assign(new Error('Aborted'), { name: 'AbortError' }))).toBe(true)
    expect(isAbortError(new Error('Request was cancelled'))).toBe(true)
    expect(isAbortError({ code: 'ABORT_ERR' })).toBe(true)
    expect(isAbortError(new Error('network failure'))).toBe(false)
  })
})

describe('raceWithAbort', () => {
  it('resolves when the underlying promise completes first', async () => {
    await expect(raceWithAbort(Promise.resolve('done'))).resolves.toBe('done')
  })

  it('rejects immediately when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(raceWithAbort(Promise.resolve('late'), controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    })
  })

  it('rejects when abort fires before the promise settles', async () => {
    const controller = new AbortController()
    const pending = new Promise<string>((resolve) => {
      setTimeout(() => resolve('too late'), 50)
    })
    const raced = raceWithAbort(pending, controller.signal)
    controller.abort()
    await expect(raced).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('sanitizeToolResultForModel', () => {
  it('redacts large screenshot payloads from JSON tool results', () => {
    const hugeBase64 = 'a'.repeat(1000)
    const raw = JSON.stringify({
      ok: true,
      mimeType: 'image/png',
      base64: hugeBase64,
      width: 1280,
      height: 720,
    })
    const sanitized = sanitizeToolResultForModel(raw)
    const parsed = JSON.parse(sanitized) as { base64?: string; note?: string; width?: number }
    expect(parsed.base64).toBeUndefined()
    expect(parsed.note).toContain('base64 image omitted')
    expect(parsed.width).toBe(1280)
  })

  it('truncates oversized non-JSON tool output', () => {
    const raw = 'x'.repeat(MAX_TOOL_MESSAGE_CHARS + 500)
    const sanitized = sanitizeToolResultForModel(raw)
    expect(sanitized.length).toBeLessThan(raw.length)
    expect(sanitized).toContain('[truncated')
  })
})

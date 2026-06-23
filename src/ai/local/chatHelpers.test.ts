import { describe, expect, it } from 'vitest'
import {
  isAbortError,
  MAX_TOOL_MESSAGE_CHARS,
  raceWithAbort,
  sanitizeToolResultForModel,
} from './chatHelpers'

describe('raceWithAbort', () => {
  it('resolves when the underlying promise completes first', async () => {
    await expect(raceWithAbort(Promise.resolve('ok'))).resolves.toBe('ok')
  })

  it('rejects immediately when signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(raceWithAbort(Promise.resolve('late'), controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    })
  })

  it('rejects when abort fires before the promise settles', async () => {
    const controller = new AbortController()
    const pending = new Promise<string>((resolve) => setTimeout(() => resolve('late'), 50))
    const raced = raceWithAbort(pending, controller.signal)
    controller.abort()
    await expect(raced).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('sanitizeToolResultForModel', () => {
  it('strips large base64 image payloads from JSON tool results', () => {
    const payload = JSON.stringify({
      ok: true,
      mimeType: 'image/png',
      base64: 'A'.repeat(600),
      width: 800,
      height: 600,
    })
    const out = sanitizeToolResultForModel(payload)
    const parsed = JSON.parse(out) as { note?: string; base64?: string }
    expect(parsed.base64).toBeUndefined()
    expect(parsed.note).toContain('base64 image omitted')
  })

  it('truncates oversized non-JSON text', () => {
    const long = 'x'.repeat(MAX_TOOL_MESSAGE_CHARS + 50)
    const out = sanitizeToolResultForModel(long)
    expect(out.length).toBeLessThan(long.length)
    expect(out).toContain('[truncated')
  })

  it('redacts large images nested inside JSON arrays and objects', () => {
    const payload = JSON.stringify({
      results: [
        { ok: true, mimeType: 'image/png', base64: 'B'.repeat(800) },
        { ok: true, text: 'visible' },
      ],
    })
    const parsed = JSON.parse(sanitizeToolResultForModel(payload)) as {
      results: Array<{ base64?: string; note?: string; text?: string }>
    }
    expect(parsed.results[0].base64).toBeUndefined()
    expect(parsed.results[0].note).toContain('base64 image omitted')
    expect(parsed.results[1].text).toBe('visible')
  })
})

describe('isAbortError', () => {
  it('detects AbortError by name, message, and code', () => {
    expect(isAbortError(Object.assign(new Error('Aborted'), { name: 'AbortError' }))).toBe(true)
    expect(isAbortError(new Error('Request was cancelled'))).toBe(true)
    expect(isAbortError({ code: 'ABORT_ERR' })).toBe(true)
    expect(isAbortError(new Error('network fail'))).toBe(false)
  })
})

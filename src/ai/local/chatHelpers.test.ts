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

  it('recursively redacts nested image payloads inside tool result objects', () => {
    const payload = JSON.stringify({
      ok: true,
      panels: [
        { label: 'chart', screenshot: { mimeType: 'image/jpeg', base64: 'B'.repeat(800) } },
        { label: 'table', rows: [{ mimeType: 'image/png', base64: 'C'.repeat(700) }] },
      ],
    })
    const out = sanitizeToolResultForModel(payload)
    const parsed = JSON.parse(out) as {
      panels: Array<{ screenshot?: { base64?: string }; rows?: Array<{ base64?: string }> }>
    }
    expect(parsed.panels[0].screenshot?.base64).toBeUndefined()
    expect(parsed.panels[1].rows?.[0]?.base64).toBeUndefined()
  })

  it('truncates oversized non-JSON text', () => {
    const long = 'x'.repeat(MAX_TOOL_MESSAGE_CHARS + 50)
    const out = sanitizeToolResultForModel(long)
    expect(out.length).toBeLessThan(long.length)
    expect(out).toContain('[truncated')
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

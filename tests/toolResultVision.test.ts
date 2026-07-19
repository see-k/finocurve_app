import { describe, expect, it } from 'vitest'
import { prepareToolResultForModel } from '../src/ai/local/LocalAIService'

describe('prepareToolResultForModel', () => {
  it('extracts screenshot images for vision and strips base64 from tool text', () => {
    const base64 = Buffer.from('fake-png-bytes-for-vision-test').toString('base64').repeat(20)
    const raw = JSON.stringify({
      ok: true,
      mimeType: 'image/png',
      base64,
      width: 1280,
      height: 800,
    })

    const prepared = prepareToolResultForModel(raw)

    expect(prepared.images).toHaveLength(1)
    expect(prepared.images[0]).toMatchObject({
      mimeType: 'image/png',
      base64,
      width: 1280,
      height: 800,
    })
    expect(prepared.content).not.toContain(base64)
    expect(prepared.content).toContain('attached for vision')
    expect(prepared.content).toContain('1280')
    expect(prepared.content).toContain('800')
  })

  it('leaves non-image tool JSON unchanged aside from stringify', () => {
    const raw = JSON.stringify({ ok: true, text: 'Portfolio overview' })
    const prepared = prepareToolResultForModel(raw)
    expect(prepared.images).toHaveLength(0)
    expect(JSON.parse(prepared.content)).toEqual({ ok: true, text: 'Portfolio overview' })
  })
})

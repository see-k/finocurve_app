import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { mergePathValues } from './mcpPathEnv'

describe('mergePathValues', () => {
  it('returns undefined when all inputs are empty', () => {
    expect(mergePathValues(undefined, '', '   ')).toBeUndefined()
  })

  it('merges segments in order and deduplicates', () => {
    const d = path.delimiter
    expect(mergePathValues(`/usr/bin${d}/usr/local/bin`, `/usr/local/bin${d}/opt/bin`)).toBe(
      `/usr/bin${d}/usr/local/bin${d}/opt/bin`,
    )
  })

  it('skips blank segments and trims whitespace', () => {
    const d = path.delimiter
    expect(mergePathValues(` /bin ${d}  ${d}/sbin `)).toBe(`/bin${d}/sbin`)
  })

  it('preserves later unique segments after earlier ones', () => {
    const d = path.delimiter
    expect(mergePathValues(`/a${d}/b`, `/c${d}/d`)).toBe(`/a${d}/b${d}/c${d}/d`)
  })
})

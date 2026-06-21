import { describe, expect, it } from 'vitest'
import { resolveCikSync } from './secCik'

const FALLBACK: Record<string, string> = {
  AAPL: '0000320193',
  MSFT: '0000789019',
}

describe('resolveCikSync', () => {
  it('returns null for empty input', () => {
    expect(resolveCikSync('', FALLBACK)).toBeNull()
    expect(resolveCikSync('   ', FALLBACK)).toBeNull()
  })

  it('zero-pads numeric CIK strings to 10 digits', () => {
    expect(resolveCikSync('320193', FALLBACK)).toBe('0000320193')
    expect(resolveCikSync('0000320193', FALLBACK)).toBe('0000320193')
  })

  it('resolves known tickers from the fallback map', () => {
    expect(resolveCikSync('aapl', FALLBACK)).toBe('0000320193')
    expect(resolveCikSync('MSFT', FALLBACK)).toBe('0000789019')
  })

  it('checks the in-memory cache before returning null', () => {
    const cache = new Map([['TSLA', '0001318605']])
    expect(resolveCikSync('TSLA', FALLBACK, cache)).toBe('0001318605')
    expect(resolveCikSync('UNKNOWN', FALLBACK, cache)).toBeNull()
  })
})

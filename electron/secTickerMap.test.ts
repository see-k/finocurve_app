import { describe, expect, it } from 'vitest'
import { buildTickerToCikMap } from './secTickerMap'

describe('buildTickerToCikMap', () => {
  it('maps tickers to zero-padded CIKs using cik_str', () => {
    const map = buildTickerToCikMap({
      '0': { cik_str: 320193, ticker: 'AAPL', title: 'Apple Inc.' },
      '1': { cik_str: 789019, ticker: 'MSFT', title: 'Microsoft Corp' },
    })
    expect(map.get('AAPL')).toBe('0000320193')
    expect(map.get('MSFT')).toBe('0000789019')
  })

  it('falls back to cik when cik_str is absent', () => {
    const map = buildTickerToCikMap({
      '0': { cik: 1318605, ticker: 'TSLA', title: 'Tesla, Inc.' },
    })
    expect(map.get('TSLA')).toBe('0001318605')
  })

  it('ignores entries missing ticker or CIK', () => {
    const map = buildTickerToCikMap({
      '0': { cik_str: 320193, title: 'No ticker' },
      '1': { ticker: 'GHOST', title: 'No CIK' },
      '2': { cik_str: 1045810, ticker: 'NVDA' },
    })
    expect(map.size).toBe(1)
    expect(map.get('NVDA')).toBe('0001045810')
  })

  it('normalizes tickers to uppercase keys', () => {
    const map = buildTickerToCikMap({
      '0': { cik_str: 320193, ticker: 'aapl' },
    })
    expect(map.get('AAPL')).toBe('0000320193')
  })
})

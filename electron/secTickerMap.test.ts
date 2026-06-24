import { describe, expect, it } from 'vitest'
import { buildTickerToCikMap } from './secTickerMap'

describe('buildTickerToCikMap', () => {
  it('maps tickers to zero-padded CIKs using cik_str', () => {
    const map = buildTickerToCikMap({
      '0': { cik_str: 320193, ticker: 'AAPL', title: 'Apple Inc.' },
      '1': { cik_str: 789019, ticker: 'msft', title: 'Microsoft Corp' },
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

  it('skips entries missing ticker or CIK number', () => {
    const map = buildTickerToCikMap({
      '0': { cik_str: 1, title: 'No ticker' },
      '1': { ticker: 'GHOST' },
      '2': { cik_str: 999, ticker: 'VALID' },
    })
    expect(map.size).toBe(1)
    expect(map.get('VALID')).toBe('0000000999')
  })

  it('uppercases ticker keys for case-insensitive lookup', () => {
    const map = buildTickerToCikMap({
      '0': { cik_str: 1045810, ticker: 'NvDa' },
    })
    expect(map.get('NVDA')).toBe('0001045810')
    expect(map.has('NvDa')).toBe(false)
  })
})

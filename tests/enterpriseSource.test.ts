import { describe, expect, it } from 'vitest'
import { getEnterpriseSource, safeHttpHref } from '../src/services/enterprise'

describe('safeHttpHref', () => {
  it('keeps absolute http and https URLs', () => {
    expect(safeHttpHref('http://127.0.0.1:8002')).toBe('http://127.0.0.1:8002')
    expect(safeHttpHref('https://service.example/v1/')).toBe('https://service.example/v1')
  })

  it('rejects javascript, data, and relative values', () => {
    expect(safeHttpHref('javascript:alert(1)')).toBe('')
    expect(safeHttpHref('data:text/html,oops')).toBe('')
    expect(safeHttpHref('/api/reports/balances')).toBe('')
    expect(safeHttpHref('')).toBe('')
  })
})

describe('getEnterpriseSource', () => {
  it('returns no href when a service URL has not been configured', () => {
    expect(getEnterpriseSource('/api/reports/balances.pdf', 'Balances report').href).toBe('')
  })
})

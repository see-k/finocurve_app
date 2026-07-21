import { describe, expect, it } from 'vitest'
import { resolveToolResultLimit } from '../src/ai/toolCatalog'

describe('resolveToolResultLimit', () => {
  it('returns catalog defaults for enterprise tools when unset', () => {
    expect(resolveToolResultLimit('get_enterprise_transactions', undefined)).toBe(25)
    expect(resolveToolResultLimit('get_enterprise_balance_history', undefined)).toBe(30)
  })

  it('clamps configured values to catalog bounds', () => {
    expect(resolveToolResultLimit('get_enterprise_transactions', 5)).toBe(5)
    expect(resolveToolResultLimit('get_enterprise_transactions', 0)).toBe(1)
    expect(resolveToolResultLimit('get_enterprise_transactions', 999)).toBe(200)
    expect(resolveToolResultLimit('get_enterprise_balance_history', 400)).toBe(365)
  })

  it('ignores tools without a resultLimit', () => {
    expect(resolveToolResultLimit('get_portfolio_summary', 10)).toBeUndefined()
  })
})

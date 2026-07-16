import { describe, expect, it } from 'vitest'
import { filterExpertTools, isExpertToolAllowed } from '../src/ai/toolPermissions'

const tools = [
  { name: 'get_holdings' },
  { name: 'save_custom_csv_document' },
  { name: 'connected_search' },
]

describe('expert tool permissions', () => {
  it('keeps full access for legacy and all-tools profiles', () => {
    expect(filterExpertTools(tools, undefined)).toEqual(tools)
    expect(filterExpertTools(tools, { toolAccess: 'all' })).toEqual(tools)
  })

  it('removes every tool for conversation-only experts', () => {
    expect(filterExpertTools(tools, { toolAccess: 'none' })).toEqual([])
    expect(isExpertToolAllowed({ toolAccess: 'none' }, 'get_holdings')).toBe(false)
  })

  it('binds only the explicitly selected built-in and connected tools', () => {
    const policy = {
      toolAccess: 'selected' as const,
      enabledToolNames: ['get_holdings', 'connected_search'],
    }

    expect(filterExpertTools(tools, policy)).toEqual([tools[0], tools[2]])
    expect(isExpertToolAllowed(policy, 'save_custom_csv_document')).toBe(false)
  })
})

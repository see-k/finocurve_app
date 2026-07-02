import { describe, expect, it } from 'vitest'
import { isAppThemeId, normalizeStoredTheme } from './themes'

describe('normalizeStoredTheme', () => {
  it('maps legacy dark/light keys to current theme ids', () => {
    expect(normalizeStoredTheme('dark')).toBe('dark-graphite')
    expect(normalizeStoredTheme('light')).toBe('light')
  })

  it('returns dark-graphite for unknown or empty values', () => {
    expect(normalizeStoredTheme(null)).toBe('dark-graphite')
    expect(normalizeStoredTheme('not-a-theme')).toBe('dark-graphite')
  })

  it('preserves valid theme ids', () => {
    expect(normalizeStoredTheme('dark-oled')).toBe('dark-oled')
    expect(isAppThemeId('dark-oled')).toBe(true)
  })
})

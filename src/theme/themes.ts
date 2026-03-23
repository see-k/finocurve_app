/**
 * App color themes (maps to document.documentElement[data-theme]).
 * Legacy localStorage values "dark" / "light" are normalized on read.
 */
export type AppThemeId =
  | 'dark-graphite'
  | 'dark-oled'
  | 'dark-navy'
  | 'light'
  | 'light-warm'

export const THEME_IDS: AppThemeId[] = [
  'dark-graphite',
  'dark-oled',
  'dark-navy',
  'light',
  'light-warm',
]

export function isAppThemeId(value: string): value is AppThemeId {
  return (THEME_IDS as string[]).includes(value)
}

/** Map stored keys (including legacy) to a valid theme id */
export function normalizeStoredTheme(raw: string | null | undefined): AppThemeId {
  if (!raw) return 'dark-graphite'
  if (raw === 'dark') return 'dark-graphite'
  if (isAppThemeId(raw)) return raw
  if (raw === 'light') return 'light'
  return 'dark-graphite'
}

export function isDarkTheme(id: AppThemeId): boolean {
  return id.startsWith('dark-')
}

/** TradingView / chart chrome backgrounds per theme */
export function tradingViewBackgroundColor(id: AppThemeId): string {
  switch (id) {
    case 'dark-graphite':
      return '#0a0a0c'
    case 'dark-oled':
      return '#000000'
    case 'dark-navy':
      return '#0a0e14'
    case 'light':
      return '#f4f4f8'
    case 'light-warm':
      return '#f5f1eb'
    default:
      return '#0a0a0c'
  }
}

export const THEME_OPTIONS: { id: AppThemeId; label: string; subtitle: string }[] = [
  { id: 'dark-graphite', label: 'Graphite', subtitle: 'Neutral dark (default)' },
  { id: 'dark-oled', label: 'OLED', subtitle: 'True black' },
  { id: 'dark-navy', label: 'Midnight', subtitle: 'Cool blue-gray' },
  { id: 'light', label: 'Light', subtitle: 'Clean & bright' },
  { id: 'light-warm', label: 'Parchment', subtitle: 'Warm paper' },
]

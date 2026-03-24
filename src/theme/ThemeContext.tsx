import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { type AppThemeId, normalizeStoredTheme, isDarkTheme } from './themes'

export type { AppThemeId } from './themes'

interface ThemeContextType {
  theme: AppThemeId
  setTheme: (theme: AppThemeId) => void
  /** Flips between default dark (graphite) and light for quick access */
  toggleTheme: () => void
  isDark: boolean
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

const STORAGE_KEY = 'finocurve-theme'

function readStoredTheme(): AppThemeId {
  try {
    return normalizeStoredTheme(localStorage.getItem(STORAGE_KEY))
  } catch {
    return 'dark-graphite'
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<AppThemeId>(readStoredTheme)

  const setTheme = (t: AppThemeId) => {
    setThemeState(t)
    try {
      localStorage.setItem(STORAGE_KEY, t)
    } catch {
      // ignore
    }
  }

  const toggleTheme = () => {
    setTheme(isDarkTheme(theme) ? 'light' : 'dark-graphite')
  }

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const isDark = isDarkTheme(theme)

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, isDark }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextType {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider')
  return ctx
}

/** For TradingView and other libs that only support "light" | "dark" */
export function themeToTradingViewColorTheme(theme: AppThemeId): 'light' | 'dark' {
  return isDarkTheme(theme) ? 'dark' : 'light'
}

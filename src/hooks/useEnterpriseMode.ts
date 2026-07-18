import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { enterpriseFetch, enterpriseServiceUrl } from '../services/enterprise'

type EnterpriseMode = 'checking' | 'active' | 'inactive'
type EnterpriseModeContextValue = {
  mode: EnterpriseMode
  isEnterprise: boolean
  recheck: () => Promise<void>
}

const EnterpriseModeContext = createContext<EnterpriseModeContextValue>({
  mode: 'inactive',
  isEnterprise: false,
  recheck: async () => {},
})

export function EnterpriseModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<EnterpriseMode>(enterpriseServiceUrl ? 'checking' : 'inactive')

  const check = useCallback(async () => {
    if (!enterpriseServiceUrl) {
      setMode('inactive')
      return
    }
    setMode('checking')
    try {
      if (window.electronAPI?.enterpriseCheck) {
        const result = await window.electronAPI.enterpriseCheck({ url: enterpriseServiceUrl })
        if (!result.available) throw new Error(result.error || 'Service unavailable')
      } else {
        const controller = new AbortController()
        const timeout = window.setTimeout(() => controller.abort(), 5000)
        try {
          await enterpriseFetch<{ products: unknown[] }>('/api/health/connections', { signal: controller.signal })
        } finally {
          window.clearTimeout(timeout)
        }
      }
      setMode('active')
    } catch {
      setMode('inactive')
    }
  }, [])

  useEffect(() => { void check() }, [check])

  const value = useMemo(() => ({ mode, isEnterprise: mode === 'active', recheck: check }), [check, mode])
  return createElement(EnterpriseModeContext.Provider, { value }, children)
}

export function useEnterpriseMode() {
  return useContext(EnterpriseModeContext)
}

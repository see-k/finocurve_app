/**
 * Portfolio value history for performance charts.
 * Records total portfolio value each time Dashboard or Portfolio is viewed.
 * Used for real performance-over-time charts (finance app best practice).
 */
import { useState, useCallback, useEffect } from 'react'

export interface PortfolioValuePoint {
  timestamp: string
  value: number
}

const STORAGE_KEY = 'finocurve-portfolio-value-history'
const MAX_POINTS = 400
const MIN_INTERVAL_MS = 60 * 60 * 1000 // Don't record more than once per hour

function loadHistory(): PortfolioValuePoint[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as PortfolioValuePoint[]
      return Array.isArray(parsed) ? parsed : []
    }
  } catch { /* ignore */ }
  return []
}

function saveHistory(history: PortfolioValuePoint[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history))
  } catch { /* ignore */ }
}

export function usePortfolioValueHistory(totalValue: number, hasAssets: boolean) {
  const [history, setHistory] = useState<PortfolioValuePoint[]>(() => loadHistory())

  const recordValue = useCallback((value: number) => {
    const now = new Date().toISOString()
    setHistory((prev) => {
      const last = prev[0]
      if (last && new Date(now).getTime() - new Date(last.timestamp).getTime() < MIN_INTERVAL_MS) {
        return prev
      }
      const next = [{ timestamp: now, value }, ...prev].slice(0, MAX_POINTS)
      saveHistory(next)
      return next
    })
  }, [])

  // Record on mount when we have assets (called from Dashboard/Portfolio)
  useEffect(() => {
    if (hasAssets && totalValue > 0) {
      recordValue(totalValue)
    }
  }, [hasAssets, totalValue, recordValue])

  const clearHistory = useCallback(() => {
    setHistory([])
    saveHistory([])
  }, [])

  return { history, recordValue, clearHistory }
}

/**
 * Portfolio value history for performance charts.
 * Records total portfolio value each time Dashboard or Portfolio is viewed.
 * Used for real performance-over-time charts (finance app best practice).
 */
import { useState, useCallback, useEffect } from 'react'

export interface PortfolioValuePoint {
  timestamp: string
  /** Total portfolio economic value (all assets, same as Dashboard total). */
  value: number
  /** Non-loan holdings only — matches Tracker "Portfolio holdings" goals and API chart basis. */
  holdingsValue?: number
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

export function usePortfolioValueHistory(
  totalValue: number,
  holdingsValue: number,
  hasAssets: boolean
) {
  const [history, setHistory] = useState<PortfolioValuePoint[]>(() => loadHistory())

  const recordValue = useCallback((value: number, holdings: number) => {
    if (!Number.isFinite(value) || !Number.isFinite(holdings)) return
    const now = new Date().toISOString()
    setHistory((prev) => {
      const last = prev[0]
      if (last && new Date(now).getTime() - new Date(last.timestamp).getTime() < MIN_INTERVAL_MS) {
        return prev
      }
      const next = [{ timestamp: now, value, holdingsValue: holdings }, ...prev].slice(0, MAX_POINTS)
      saveHistory(next)
      return next
    })
  }, [])

  // Record on mount when we have assets (called from Dashboard/Portfolio/Tracker)
  useEffect(() => {
    if (!hasAssets) return
    if (totalValue <= 0 && holdingsValue <= 0) return
    recordValue(totalValue, holdingsValue)
  }, [hasAssets, totalValue, holdingsValue, recordValue])

  const clearHistory = useCallback(() => {
    setHistory([])
    saveHistory([])
  }, [])

  return { history, recordValue, clearHistory }
}

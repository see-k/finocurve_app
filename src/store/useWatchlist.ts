import { useState, useEffect, useCallback } from 'react'
import type { WatchlistItem } from '../types'

const STORAGE_KEY = 'finocurve-watchlist'

function load(): WatchlistItem[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return JSON.parse(stored)
  } catch { /* ignore */ }
  return []
}

function save(items: WatchlistItem[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)) } catch { /* ignore */ }
}

export function useWatchlist() {
  const [items, setItems] = useState<WatchlistItem[]>(load)

  useEffect(() => { save(items) }, [items])

  const addItem = useCallback((item: WatchlistItem) => {
    setItems(prev => {
      if (prev.some(i => i.symbol === item.symbol)) return prev
      return [item, ...prev]
    })
  }, [])

  const removeItem = useCallback((symbol: string) => {
    setItems(prev => prev.filter(i => i.symbol !== symbol))
  }, [])

  const isInWatchlist = useCallback((symbol: string) => {
    return items.some(i => i.symbol === symbol)
  }, [items])

  const clearWatchlist = useCallback(() => {
    setItems([])
    localStorage.removeItem(STORAGE_KEY)
  }, [])

  return { items, addItem, removeItem, isInWatchlist, clearWatchlist }
}

import { useState, useEffect, useCallback, useMemo } from 'react'
import type { AppNotification } from '../types'

const STORAGE_KEY = 'finocure-notifications'

function load(): AppNotification[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return JSON.parse(stored)
  } catch { /* ignore */ }
  return []
}

function save(items: AppNotification[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)) } catch { /* ignore */ }
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<AppNotification[]>(load)

  useEffect(() => { save(notifications) }, [notifications])

  const addNotification = useCallback((n: AppNotification) => {
    setNotifications(prev => [n, ...prev])
  }, [])

  const markAsRead = useCallback((id: string) => {
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, isRead: true } : n)
    )
  }, [])

  const markAllAsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })))
  }, [])

  const clearAll = useCallback(() => {
    setNotifications([])
    localStorage.removeItem(STORAGE_KEY)
  }, [])

  const unreadCount = useMemo(() => notifications.filter(n => !n.isRead).length, [notifications])

  return { notifications, unreadCount, addNotification, markAsRead, markAllAsRead, clearAll }
}

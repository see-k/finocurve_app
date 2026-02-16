import { useEffect } from 'react'
import { Bell, Check, CheckCheck, Trash2, Info, AlertTriangle, Star } from 'lucide-react'
import GlassContainer from '../../components/glass/GlassContainer'
import GlassButton from '../../components/glass/GlassButton'
import GlassIconButton from '../../components/glass/GlassIconButton'
import { useNotifications } from '../../store/useNotifications'
import type { AppNotification } from '../../types'
import './NotificationsScreen.css'

const NOTIFICATION_ICONS: Record<string, typeof Bell> = {
  welcome: Star,
  pro_welcome: Star,
  pro_failed: AlertTriangle,
  info: Info,
  alert: AlertTriangle,
}

function ensureWelcome(notifications: AppNotification[], add: (n: AppNotification) => void) {
  if (notifications.length === 0) {
    add({
      id: 'welcome-1',
      title: 'Welcome to FinoCurve!',
      message: 'Thanks for joining. Start by adding your first asset to track your portfolio.',
      type: 'welcome',
      createdAt: new Date().toISOString(),
      isRead: false,
    })
  }
}

export default function NotificationsScreen() {
  const { notifications, unreadCount, markAsRead, markAllAsRead, clearAll, addNotification } = useNotifications()

  useEffect(() => {
    ensureWelcome(notifications, addNotification)
  }, [])

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    const diffDays = Math.floor(diffHours / 24)
    if (diffDays < 7) return `${diffDays}d ago`
    return d.toLocaleDateString()
  }

  return (
    <div className="notif-screen">
      <div className="notif-header">
        <div>
          <h1 className="notif-title">Notifications</h1>
          {unreadCount > 0 && (
            <p className="notif-subtitle">{unreadCount} unread notification{unreadCount > 1 ? 's' : ''}</p>
          )}
        </div>
        <div className="notif-header-actions">
          {unreadCount > 0 && (
            <GlassButton text="Mark All Read" onClick={markAllAsRead} icon={<CheckCheck size={16} />} width="auto" />
          )}
          {notifications.length > 0 && (
            <GlassIconButton icon={<Trash2 size={18} />} onClick={clearAll} size={40} title="Clear all" />
          )}
        </div>
      </div>

      {notifications.length === 0 ? (
        <GlassContainer className="notif-empty">
          <Bell size={48} style={{ color: 'var(--text-tertiary)', marginBottom: 16 }} />
          <p style={{ color: 'var(--text-secondary)', fontSize: 16 }}>No notifications yet</p>
          <p style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>You'll receive updates about your portfolio here</p>
        </GlassContainer>
      ) : (
        <div className="notif-list">
          {notifications.map(n => {
            const Icon = NOTIFICATION_ICONS[n.type] || Info
            return (
              <GlassContainer
                key={n.id}
                className={`notif-item ${n.isRead ? 'notif-item--read' : ''}`}
                padding="16px"
                borderRadius={16}
                onClick={() => !n.isRead && markAsRead(n.id)}
              >
                <div className="notif-item__content">
                  <div className={`notif-item__icon notif-item__icon--${n.type}`}>
                    <Icon size={18} />
                  </div>
                  <div className="notif-item__text">
                    <div className="notif-item__title">
                      {n.title}
                      {!n.isRead && <span className="notif-item__unread-dot" />}
                    </div>
                    <div className="notif-item__message">{n.message}</div>
                    <div className="notif-item__time">{formatDate(n.createdAt)}</div>
                  </div>
                  {!n.isRead && (
                    <GlassIconButton
                      icon={<Check size={14} />}
                      onClick={() => markAsRead(n.id)}
                      size={32}
                      title="Mark as read"
                    />
                  )}
                </div>
              </GlassContainer>
            )
          })}
        </div>
      )}
    </div>
  )
}

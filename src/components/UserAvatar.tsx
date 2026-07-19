import './UserAvatar.css'
import { Building2 } from 'lucide-react'
import { useEnterpriseMode } from '../hooks/useEnterpriseMode'

export interface UserAvatarProps {
  /** Profile picture URL (data URL or remote URL) */
  src?: string | null
  /** Fallback initials when no image */
  initials: string
  /** Size in pixels (default 48) */
  size?: number
  /** Additional class name */
  className?: string
  /** Show enterprise status on this current-user avatar (not expert avatars). */
  showEnterpriseIndicator?: boolean
}

function getInitials(name?: string): string {
  if (!name) return 'U'
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

export default function UserAvatar({ src, initials, size = 48, className = '', showEnterpriseIndicator = false }: UserAvatarProps) {
  const { isEnterprise } = useEnterpriseMode()
  const displayInitials = initials || getInitials()
  const hasImage = !!(src && (src.startsWith('data:') || src.startsWith('http') || src.startsWith('blob:')))

  return (
    <div
      className={`user-avatar ${className}`.trim()}
      style={{ width: size, height: size, fontSize: size * 0.35 }}
    >
      {hasImage ? (
        <img src={src} alt="Profile" className="user-avatar__img" />
      ) : (
        <span className="user-avatar__initials">{displayInitials}</span>
      )}
      {showEnterpriseIndicator && isEnterprise && (
        <span
          className="user-avatar__enterprise-badge"
          aria-label="Enterprise mode active"
          title="Enterprise mode active"
          style={{ width: Math.max(15, size * 0.34), height: Math.max(15, size * 0.34) }}
        >
          <Building2 aria-hidden="true" />
        </span>
      )}
    </div>
  )
}

export { getInitials }

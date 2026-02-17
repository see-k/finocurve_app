import './UserAvatar.css'

export interface UserAvatarProps {
  /** Profile picture URL (data URL or remote URL) */
  src?: string | null
  /** Fallback initials when no image */
  initials: string
  /** Size in pixels (default 48) */
  size?: number
  /** Additional class name */
  className?: string
}

function getInitials(name?: string): string {
  if (!name) return 'U'
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

export default function UserAvatar({ src, initials, size = 48, className = '' }: UserAvatarProps) {
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
    </div>
  )
}

export { getInitials }

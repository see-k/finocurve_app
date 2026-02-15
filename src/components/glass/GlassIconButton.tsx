import type { ReactNode } from 'react'
import './GlassIconButton.css'

interface GlassIconButtonProps {
  icon: ReactNode
  onClick: () => void
  size?: number
  className?: string
  title?: string
}

export default function GlassIconButton({
  icon,
  onClick,
  size = 48,
  className = '',
  title,
}: GlassIconButtonProps) {
  return (
    <button
      className={`glass-icon-button ${className}`}
      onClick={onClick}
      title={title}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: `${size / 2}px`,
      }}
    >
      {icon}
    </button>
  )
}

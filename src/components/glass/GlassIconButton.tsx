import type { ReactNode } from 'react'
import './GlassIconButton.css'

interface GlassIconButtonProps {
  icon: ReactNode
  onClick: () => void
  size?: number
  className?: string
  title?: string
  disabled?: boolean
}

export default function GlassIconButton({
  icon,
  onClick,
  size = 48,
  className = '',
  title,
  disabled = false,
}: GlassIconButtonProps) {
  return (
    <button
      className={`glass-icon-button ${className}`}
      onClick={onClick}
      title={title}
      disabled={disabled}
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

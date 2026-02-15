import type { ReactNode } from 'react'
import './GlassButton.css'

interface GlassButtonProps {
  text: string
  onClick: () => void
  isPrimary?: boolean
  isLoading?: boolean
  icon?: ReactNode
  width?: string
  disabled?: boolean
}

export default function GlassButton({
  text,
  onClick,
  isPrimary = false,
  isLoading = false,
  icon,
  width = '100%',
  disabled = false,
}: GlassButtonProps) {
  return (
    <button
      className={`glass-button ${isPrimary ? 'glass-button--primary' : 'glass-button--secondary'}`}
      onClick={onClick}
      disabled={disabled || isLoading}
      style={{ width }}
    >
      {isLoading ? (
        <span className="glass-button__spinner" />
      ) : (
        <>
          {icon && <span className="glass-button__icon">{icon}</span>}
          <span className="glass-button__text">{text}</span>
        </>
      )}
    </button>
  )
}

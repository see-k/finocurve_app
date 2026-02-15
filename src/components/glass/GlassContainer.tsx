import type { CSSProperties, ReactNode } from 'react'
import './GlassContainer.css'

interface GlassContainerProps {
  children: ReactNode
  padding?: string
  borderRadius?: number
  blur?: number
  className?: string
  style?: CSSProperties
  onClick?: () => void
}

export default function GlassContainer({
  children,
  padding = '24px',
  borderRadius = 24,
  blur = 20,
  className = '',
  style,
  onClick,
}: GlassContainerProps) {
  return (
    <div
      className={`glass-container ${className}`}
      style={{
        padding,
        borderRadius: `${borderRadius}px`,
        backdropFilter: `blur(${blur}px)`,
        WebkitBackdropFilter: `blur(${blur}px)`,
        ...style,
      }}
      onClick={onClick}
    >
      {children}
    </div>
  )
}

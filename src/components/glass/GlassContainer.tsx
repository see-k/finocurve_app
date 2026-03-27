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
  const blurStyle: CSSProperties =
    blur > 0
      ? { backdropFilter: `blur(${blur}px)`, WebkitBackdropFilter: `blur(${blur}px)` }
      : {}

  return (
    <div
      className={`glass-container ${className}`}
      style={{
        padding,
        borderRadius: `${borderRadius}px`,
        ...blurStyle,
        ...style,
      }}
      onClick={onClick}
    >
      {children}
    </div>
  )
}

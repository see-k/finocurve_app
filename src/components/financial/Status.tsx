import { AlertTriangle, CheckCircle2, CircleSlash, Info, MinusCircle } from 'lucide-react'
import type { ReactNode } from 'react'

export type StatusTone = 'ok' | 'warn' | 'bad' | 'neutral'

const STATUS_ICONS = {
  ok: CheckCircle2,
  warn: AlertTriangle,
  bad: CircleSlash,
  neutral: MinusCircle,
} as const

/**
 * State as an icon plus a label, so the meaning never rests on colour alone.
 */
export function StatusChip({
  tone,
  label,
  className = '',
}: {
  tone: StatusTone
  label: string
  className?: string
}) {
  const Icon = STATUS_ICONS[tone]
  return (
    <span className={`fin-status fin-status--${tone} ${className}`.trim()}>
      <Icon size={12} aria-hidden />
      {label}
    </span>
  )
}

const NOTICE_ICONS = {
  ok: CheckCircle2,
  warn: AlertTriangle,
  bad: CircleSlash,
  neutral: Info,
} as const

/** An inline message about the state of the thing above it. */
export function Notice({
  tone = 'neutral',
  children,
}: {
  tone?: StatusTone
  children: ReactNode
}) {
  const Icon = NOTICE_ICONS[tone]
  return (
    <div className={`fin-notice fin-notice--${tone}`} role="status">
      <Icon size={14} aria-hidden />
      <span>{children}</span>
    </div>
  )
}

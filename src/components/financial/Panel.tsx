import type { KeyboardEvent, ReactNode } from 'react'

interface PanelProps {
  title: string
  /** Secondary line under the title — scope, method, or caveat. */
  note?: ReactNode
  /** Small figure shown next to the title, e.g. a row count. */
  count?: ReactNode
  icon?: ReactNode
  /** Controls rendered on the right of the header. */
  actions?: ReactNode
  /** Strip pinned to the bottom of the panel — provenance, legends, footnotes. */
  footer?: ReactNode
  /** Removes body padding, for panels whose body is a full-bleed table. */
  flushBody?: boolean
  onClick?: () => void
  className?: string
  children: ReactNode
}

/**
 * The one container used on the account screens: a flat surface bounded by
 * hairlines, with a header rule and an optional footer strip for provenance.
 */
export default function Panel({
  title,
  note,
  count,
  icon,
  actions,
  footer,
  flushBody = false,
  onClick,
  className = '',
  children,
}: PanelProps) {
  const interactive = typeof onClick === 'function'

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!interactive) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClick!()
    }
  }

  return (
    <section
      className={`fin-panel ${interactive ? 'fin-panel--link' : ''} ${className}`.trim()}
      onClick={onClick}
      onKeyDown={interactive ? handleKeyDown : undefined}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
    >
      <header className="fin-panel__head">
        <div className="fin-panel__heading">
          <h2 className="fin-panel__title">
            {icon}
            {title}
            {count != null && <span className="fin-panel__count">{count}</span>}
          </h2>
          {note && <div className="fin-panel__note">{note}</div>}
        </div>
        {actions && (
          // Header controls must not trigger a navigating panel.
          <div className="fin-panel__actions" onClick={(e) => e.stopPropagation()}>
            {actions}
          </div>
        )}
      </header>
      <div className={`fin-panel__body ${flushBody ? 'fin-panel__body--flush' : ''}`.trim()}>
        {children}
      </div>
      {footer && <footer className="fin-panel__foot">{footer}</footer>}
    </section>
  )
}

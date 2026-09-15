import type { ReactNode } from 'react'

export interface KeyFigure {
  label: string
  value: ReactNode
  /** Second line — basis, count, or an explanatory clause. */
  meta?: ReactNode
  /** Applies the gain/loss colour to the value. Omit for neutral figures. */
  tone?: 'positive' | 'negative' | 'neutral'
}

interface KeyFiguresProps {
  figures: KeyFigure[]
  className?: string
}

/** The figures strip under the masthead: the numbers a reader checks first. */
export default function KeyFigures({ figures, className = '' }: KeyFiguresProps) {
  return (
    <div className={`fin-figures ${className}`.trim()}>
      {figures.map((figure) => (
        <div className="fin-figure" key={figure.label}>
          <span className="fin-label">{figure.label}</span>
          <span
            className={`fin-figure__value ${
              figure.tone === 'positive' ? 'fin-pos' : figure.tone === 'negative' ? 'fin-neg' : ''
            }`.trim()}
          >
            {figure.value}
          </span>
          {figure.meta && <span className="fin-figure__meta">{figure.meta}</span>}
        </div>
      ))}
    </div>
  )
}

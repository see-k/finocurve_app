import { useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronDown, Database, Info } from 'lucide-react'
import type {
  PerformanceDataSourceId,
  PerformanceSourceOption,
  PerformanceSourcePreference,
} from '../../utils/performanceChartData'
import './DataSourceSelect.css'

interface DataSourceSelectProps {
  /** Every selectable source, in menu order, with availability metadata. */
  sources: PerformanceSourceOption[]
  /** The client's pinned preference (`auto` follows the built-in priority). */
  value: PerformanceSourcePreference
  onChange: (value: PerformanceSourcePreference) => void
  /** The source actually plotted, or null when none is available. */
  resolved: PerformanceDataSourceId | null
  /** True when the pinned source could not be honoured. */
  fellBack?: boolean
  /** Shown while the market series is still being fetched. */
  loading?: boolean
}

const AUTO_DESCRIPTION = 'Use the most precise observed series available: market data, then account snapshots.'

export default function DataSourceSelect({
  sources,
  value,
  onChange,
  resolved,
  fellBack = false,
  loading = false,
}: DataSourceSelectProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  // Close on outside click or Escape while the menu is open.
  useEffect(() => {
    if (!open) return
    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
        rootRef.current?.querySelector<HTMLButtonElement>('.fin-source__trigger')?.focus()
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const resolvedOption = resolved ? sources.find((s) => s.id === resolved) : undefined
  const triggerLabel = value === 'auto'
    ? (resolvedOption ? `Auto · ${resolvedOption.shortLabel}` : 'Auto · none')
    : (sources.find((s) => s.id === value)?.shortLabel ?? '—')

  function select(next: PerformanceSourcePreference) {
    onChange(next)
    setOpen(false)
  }

  return (
    <div className="fin-source" ref={rootRef}>
      <button
        type="button"
        className={`fin-source__trigger ${fellBack ? 'fin-source__trigger--warn' : ''}`.trim()}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        title="Choose which series backs this chart"
      >
        <Database size={13} aria-hidden />
        <span className="fin-source__trigger-label">
          <span className="fin-label">Source</span>
          <span className="fin-source__trigger-value">{triggerLabel}</span>
        </span>
        <ChevronDown size={13} aria-hidden className="fin-source__caret" />
      </button>

      {loading && <span className="fin-source__status">Loading…</span>}

      {open && (
        <div className="fin-source__menu" role="listbox" id={menuId} aria-label="Chart data source">
          <button
            type="button"
            role="option"
            aria-selected={value === 'auto'}
            className={`fin-source__option ${value === 'auto' ? 'fin-source__option--selected' : ''}`.trim()}
            onClick={() => select('auto')}
          >
            <span className="fin-source__check">{value === 'auto' && <Check size={13} aria-hidden />}</span>
            <span className="fin-source__option-body">
              <span className="fin-source__option-head">
                <span className="fin-source__option-label">Automatic</span>
                {value === 'auto' && (
                  <span className="fin-tag">
                    {resolvedOption ? `Using ${resolvedOption.shortLabel}` : 'None available'}
                  </span>
                )}
              </span>
              <span className="fin-source__option-desc">{AUTO_DESCRIPTION}</span>
            </span>
          </button>

          <div className="fin-source__divider" role="presentation" />

          {sources.map((source) => {
            const selected = value === source.id
            return (
              <button
                key={source.id}
                type="button"
                role="option"
                aria-selected={selected}
                aria-disabled={!source.available}
                disabled={!source.available}
                className={`fin-source__option ${selected ? 'fin-source__option--selected' : ''} ${!source.available ? 'fin-source__option--disabled' : ''}`.trim()}
                onClick={() => select(source.id)}
              >
                <span className="fin-source__check">{selected && <Check size={13} aria-hidden />}</span>
                <span className="fin-source__option-body">
                  <span className="fin-source__option-head">
                    <span className="fin-source__option-label">{source.label}</span>
                    {source.available && source.pointCount > 0 && (
                      <span className="fin-source__points fin-num">{source.pointCount} obs</span>
                    )}
                    {!source.available && <span className="fin-tag">Unavailable</span>}
                  </span>
                  <span className="fin-source__option-desc">
                    {source.available ? source.description : source.unavailableReason}
                  </span>
                </span>
              </button>
            )
          })}

          <p className="fin-source__foot">
            <Info size={12} aria-hidden />
            Only series this app has actually observed are offered. Switching the source changes
            what is plotted, never the holdings or totals above.
          </p>
        </div>
      )}
    </div>
  )
}

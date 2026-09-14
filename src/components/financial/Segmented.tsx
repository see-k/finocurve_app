interface SegmentedProps<T extends string> {
  options: readonly T[]
  value: T
  onChange: (value: T) => void
  /** Maps an option to its visible text. Defaults to the option itself. */
  labelFor?: (option: T) => string
  /** Accessible name for the group, e.g. "Performance period". */
  ariaLabel: string
}

/** Mutually exclusive view switcher — periods, allocation breakdowns, ranges. */
export default function Segmented<T extends string>({
  options,
  value,
  onChange,
  labelFor,
  ariaLabel,
}: SegmentedProps<T>) {
  return (
    <div className="fin-segmented" role="group" aria-label={ariaLabel}>
      {options.map((option) => {
        const active = option === value
        return (
          <button
            key={option}
            type="button"
            className={`fin-segmented__btn ${active ? 'fin-segmented__btn--active' : ''}`.trim()}
            aria-pressed={active}
            onClick={() => onChange(option)}
          >
            {labelFor ? labelFor(option) : option}
          </button>
        )
      })}
    </div>
  )
}

import { getData } from 'country-list'

const COUNTRY_OPTIONS = getData()

interface CountrySelectProps {
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
  disabled?: boolean
}

export default function CountrySelect({
  value,
  onChange,
  placeholder = 'Select country...',
  disabled = false,
}: CountrySelectProps) {
  // Normalize value: accept either code (US) or name (United States), always use code for the select
  const displayValue = (() => {
    if (!value) return ''
    const match = COUNTRY_OPTIONS.find((c) => c.code === value || c.name === value)
    return match ? match.code : value
  })()

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newValue = e.target.value
    onChange?.(newValue)
  }

  return (
    <select
      className="add-asset-select"
      value={displayValue}
      onChange={handleChange}
      disabled={disabled}
    >
      <option value="">{placeholder}</option>
      {COUNTRY_OPTIONS.map((c) => (
        <option key={c.code} value={c.code}>
          {c.name}
        </option>
      ))}
    </select>
  )
}

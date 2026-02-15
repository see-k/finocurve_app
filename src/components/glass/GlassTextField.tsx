import type { ReactNode, ChangeEvent } from 'react'
import './GlassTextField.css'

interface GlassTextFieldProps {
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
  prefixIcon?: ReactNode
  suffixIcon?: ReactNode
  type?: string
  disabled?: boolean
  error?: string
  maxLines?: number
}

export default function GlassTextField({
  value,
  onChange,
  placeholder = '',
  prefixIcon,
  suffixIcon,
  type = 'text',
  disabled = false,
  error,
  maxLines,
}: GlassTextFieldProps) {
  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    onChange?.(e.target.value)
  }

  const isTextarea = maxLines && maxLines > 1

  return (
    <div className={`glass-text-field ${error ? 'glass-text-field--error' : ''} ${disabled ? 'glass-text-field--disabled' : ''}`}>
      <div className="glass-text-field__wrapper">
        {prefixIcon && <span className="glass-text-field__prefix">{prefixIcon}</span>}
        {isTextarea ? (
          <textarea
            className="glass-text-field__input"
            value={value}
            onChange={handleChange}
            placeholder={placeholder}
            disabled={disabled}
            rows={maxLines}
          />
        ) : (
          <input
            className="glass-text-field__input"
            type={type}
            value={value}
            onChange={handleChange}
            placeholder={placeholder}
            disabled={disabled}
          />
        )}
        {suffixIcon && <span className="glass-text-field__suffix">{suffixIcon}</span>}
      </div>
      {error && <span className="glass-text-field__error">{error}</span>}
    </div>
  )
}

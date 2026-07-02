import { isPasswordLongEnough } from './localPasswordAuth'

/** Lightweight email format check for local sign-up (not full RFC validation). */
const LOCAL_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidLocalEmail(email: string): boolean {
  return LOCAL_EMAIL_RE.test(email.trim())
}

export interface SignupFormFields {
  name: string
  email: string
  password: string
  confirmPassword: string
}

export function canSubmitSignupForm(fields: SignupFormFields): boolean {
  const trimmedName = fields.name.trim()
  const trimmedEmail = fields.email.trim()
  return !!(
    trimmedName &&
    trimmedEmail &&
    isValidLocalEmail(trimmedEmail) &&
    fields.password &&
    fields.confirmPassword &&
    fields.password === fields.confirmPassword &&
    isPasswordLongEnough(fields.password)
  )
}

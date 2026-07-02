import { describe, expect, it } from 'vitest'
import { canSubmitSignupForm, isValidLocalEmail } from './authFormValidation'

describe('isValidLocalEmail', () => {
  it('accepts trimmed emails with a domain and TLD', () => {
    expect(isValidLocalEmail(' user@example.com ')).toBe(true)
    expect(isValidLocalEmail('a.b+c@sub.example.co.uk')).toBe(true)
  })

  it('rejects whitespace-only, missing @, or missing domain parts', () => {
    expect(isValidLocalEmail('   ')).toBe(false)
    expect(isValidLocalEmail('not-an-email')).toBe(false)
    expect(isValidLocalEmail('missing@domain')).toBe(false)
    expect(isValidLocalEmail('@nodomain.com')).toBe(false)
  })
})

describe('canSubmitSignupForm', () => {
  const valid = {
    name: 'Jane Doe',
    email: 'jane@example.com',
    password: 'long-enough',
    confirmPassword: 'long-enough',
  }

  it('requires trimmed name, valid email, matching long passwords', () => {
    expect(canSubmitSignupForm(valid)).toBe(true)
  })

  it('rejects empty name after trim', () => {
    expect(canSubmitSignupForm({ ...valid, name: '   ' })).toBe(false)
  })

  it('rejects invalid email even when other fields are filled', () => {
    expect(canSubmitSignupForm({ ...valid, email: 'bad-email' })).toBe(false)
  })

  it('rejects mismatched or short passwords', () => {
    expect(canSubmitSignupForm({ ...valid, confirmPassword: 'other-one' })).toBe(false)
    expect(canSubmitSignupForm({ ...valid, password: 'short', confirmPassword: 'short' })).toBe(false)
  })
})

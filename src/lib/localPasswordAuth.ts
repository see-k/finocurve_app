/**
 * Device-local password hashing (no server). Used with `finocurve-saved-local-accounts`.
 * PBKDF2-SHA-256 with random salt; never store plaintext passwords.
 */

export const PASSWORD_MIN_LENGTH = 8
export const PBKDF2_ITERATIONS = 210_000
const SALT_BYTES = 16
const DERIVED_BITS = 256

function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

export async function hashPassword(password: string): Promise<{ saltB64: string; hashB64: string }> {
  const enc = new TextEncoder()
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    DERIVED_BITS,
  )
  const hash = new Uint8Array(bits)
  return { saltB64: bytesToBase64(salt), hashB64: bytesToBase64(hash) }
}

export async function verifyPassword(password: string, saltB64: string, hashB64: string): Promise<boolean> {
  try {
    const enc = new TextEncoder()
    const salt = base64ToBytes(saltB64)
    const expected = base64ToBytes(hashB64)
    const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
    const bits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt as BufferSource,
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256',
      },
      keyMaterial,
      DERIVED_BITS,
    )
    const actual = new Uint8Array(bits)
    return timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

export function isPasswordLongEnough(password: string): boolean {
  return password.length >= PASSWORD_MIN_LENGTH
}

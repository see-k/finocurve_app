import {
  hashPassword,
  isPasswordLongEnough,
  PASSWORD_MIN_LENGTH,
  verifyPassword,
} from './localPasswordAuth'
import type { SavedLocalAccount } from './savedLocalAccounts'

export type LoginAuthResult =
  | { ok: false; error: 'no_profile' }
  | { ok: false; error: 'incorrect_password' }
  | { ok: false; error: 'password_too_short'; minLength: number }
  | { ok: true; newLocalAuth?: { saltB64: string; digestB64: string } }

/**
 * Resolves sign-in auth for a saved local profile: verify stored PBKDF2 digest,
 * or accept a first-time password when none is stored yet.
 */
export async function resolveLoginAuth(
  saved: SavedLocalAccount | undefined,
  password: string,
): Promise<LoginAuthResult> {
  if (!saved) {
    return { ok: false, error: 'no_profile' }
  }

  const salt = saved.localAuthSaltB64
  const digest = saved.localAuthDigestB64

  if (salt && digest) {
    const ok = await verifyPassword(password, salt, digest)
    if (!ok) return { ok: false, error: 'incorrect_password' }
    return { ok: true }
  }

  if (isPasswordLongEnough(password)) {
    const h = await hashPassword(password)
    return { ok: true, newLocalAuth: { saltB64: h.saltB64, digestB64: h.hashB64 } }
  }

  return { ok: false, error: 'password_too_short', minLength: PASSWORD_MIN_LENGTH }
}

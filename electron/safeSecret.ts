import { safeStorage } from 'electron'

export async function isSecretEncryptionAvailable(): Promise<boolean> {
  return safeStorage.isAsyncEncryptionAvailable()
}

export async function encryptSecret(plain: string): Promise<string> {
  const encrypted = await safeStorage.encryptStringAsync(plain)
  return Buffer.from(encrypted).toString('base64')
}

/**
 * Decrypts a base64 safeStorage payload.
 * When the OS has rotated its key, the returned ciphertext is a fresh
 * encryption of the same plaintext and should replace the stored value.
 */
export async function decryptSecret(
  ciphertext: string,
): Promise<{ plaintext: string; ciphertext: string }> {
  const encrypted = Buffer.from(ciphertext, 'base64')
  const decrypted = await safeStorage.decryptStringAsync(encrypted)
  if (!decrypted.shouldReEncrypt) return { plaintext: decrypted.result, ciphertext }
  return { plaintext: decrypted.result, ciphertext: await encryptSecret(decrypted.result) }
}

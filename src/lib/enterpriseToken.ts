/** A recognisable hint that discloses no usable secret. */
export function maskEnterpriseApiToken(token: string): string {
  const trimmed = (token ?? '').trim()
  if (!trimmed) return ''
  if (trimmed.length <= 4) return '••••'
  return `••••${trimmed.slice(-4)}`
}

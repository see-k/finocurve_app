/**
 * Pure CIK resolution helpers for SEC EDGAR lookups.
 * Async ticker fetch lives in secHandlers; these cover sync normalization paths.
 */

export function resolveCikSync(
  tickerOrCik: string,
  fallbackMap: Record<string, string>,
  cache?: Map<string, string> | null
): string | null {
  const trimmed = String(tickerOrCik).trim().toUpperCase()
  if (!trimmed) return null

  if (/^\d+$/.test(trimmed)) {
    return trimmed.padStart(10, '0')
  }

  const fallback = fallbackMap[trimmed]
  if (fallback) return fallback

  return cache?.get(trimmed) ?? null
}

import path from 'node:path'

/** Merge PATH segments from multiple sources, preserving order and dropping duplicates. */
export function mergePathValues(...values: Array<string | undefined>): string | undefined {
  const seen = new Set<string>()
  const merged: string[] = []

  for (const value of values) {
    if (!value) continue

    for (const segment of value.split(path.delimiter)) {
      const trimmed = segment.trim()
      if (!trimmed || seen.has(trimmed)) continue
      seen.add(trimmed)
      merged.push(trimmed)
    }
  }

  return merged.length > 0 ? merged.join(path.delimiter) : undefined
}

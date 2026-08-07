/**
 * Shared chart payload used in chat markdown (` ```chart `) and branded PDF section charts.
 * Keep shapes aligned so agents can reuse the same JSON in either surface.
 */
export type ChartSpec =
  | { type: 'bar'; title?: string; labels: string[]; values: number[] }
  | { type: 'line'; title?: string; labels: string[]; values: number[] }
  | { type: 'pie'; title?: string; labels: string[]; values: number[] }

const MAX_LABEL = 80
const MAX_TITLE = 120
const LIMITS: Record<ChartSpec['type'], number> = {
  bar: 20,
  line: 24,
  pie: 16,
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return null
}

function asStringArray(value: unknown, maxLen: number, maxItems: number): string[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > maxItems) return null
  const out: string[] = []
  for (const item of value) {
    if (typeof item !== 'string' && typeof item !== 'number') return null
    out.push(String(item).slice(0, maxLen))
  }
  return out
}

function asNumberArray(value: unknown, maxItems: number): number[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > maxItems) return null
  const out: number[] = []
  for (const item of value) {
    const n = asFiniteNumber(item)
    if (n == null) return null
    out.push(n)
  }
  return out
}

/** Validate a parsed object into a ChartSpec, or null if invalid. */
export function normalizeChartSpec(input: unknown): ChartSpec | null {
  if (!input || typeof input !== 'object') return null
  const obj = input as Record<string, unknown>
  const type = obj.type
  if (type !== 'bar' && type !== 'line' && type !== 'pie') return null
  const maxItems = LIMITS[type]
  const labels = asStringArray(obj.labels, MAX_LABEL, maxItems)
  const values = asNumberArray(obj.values, maxItems)
  if (!labels || !values || labels.length !== values.length) return null
  const title =
    typeof obj.title === 'string' && obj.title.trim()
      ? obj.title.trim().slice(0, MAX_TITLE)
      : undefined
  return { type, title, labels, values }
}

/** Parse a fenced ```chart JSON body into a ChartSpec. */
export function parseChartSpecJson(raw: string): ChartSpec | null {
  const text = raw.trim()
  if (!text) return null
  try {
    return normalizeChartSpec(JSON.parse(text))
  } catch {
    // Models sometimes wrap JSON with trailing commentary; try the outermost object.
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return normalizeChartSpec(JSON.parse(text.slice(start, end + 1)))
      } catch {
        return null
      }
    }
    return null
  }
}

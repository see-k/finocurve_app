/** Cap tool outputs so Bedrock/LangChain history stays under model limits (MCP screenshots, etc.). */
export const MAX_TOOL_MESSAGE_CHARS = 100_000

/** Detect AbortError-like errors regardless of provider/runtime. */
export function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { name?: unknown; message?: unknown; code?: unknown }
  if (e.name === 'AbortError') return true
  if (typeof e.message === 'string' && /aborted|cancell?ed/i.test(e.message)) return true
  if (e.code === 'ABORT_ERR' || e.code === 20) return true
  return false
}

/**
 * Race a promise against an abort signal so callers don't have to wait for
 * uncancellable work to finish before the chat loop can exit. The losing
 * promise keeps running but its result is discarded.
 */
export function raceWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise
  if (signal.aborted) {
    return Promise.reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }))
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort)
      reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }))
    }
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (err) => {
        signal.removeEventListener('abort', onAbort)
        reject(err)
      }
    )
  })
}

function redactLargeImagePayloadsInJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactLargeImagePayloadsInJson)
  }
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const mimeStr = typeof obj.mimeType === 'string' ? obj.mimeType : ''
    const base64Str = typeof obj.base64 === 'string' ? obj.base64 : ''
    if (mimeStr.toLowerCase().includes('image') && base64Str.length > 500) {
      const summary: Record<string, unknown> = {
        note: `base64 image omitted (${base64Str.length} chars) — use smaller screenshot or describe UI verbally`,
      }
      if ('ok' in obj) summary.ok = obj.ok
      if (mimeStr) summary.mimeType = mimeStr
      if (typeof obj.width === 'number') summary.width = obj.width
      if (typeof obj.height === 'number') summary.height = obj.height
      return summary
    }
    const out: Record<string, unknown> = {}
    for (const [key, nested] of Object.entries(obj)) {
      out[key] = redactLargeImagePayloadsInJson(nested)
    }
    return out
  }
  return value
}

/**
 * Shrinks oversized tool outputs before they become ToolMessage content:
 * recursively strips large base64 image payloads from JSON tool results, then truncates the final string.
 */
export function sanitizeToolResultForModel(text: string): string {
  let out = text
  try {
    const parsed: unknown = JSON.parse(text)
    const redacted = redactLargeImagePayloadsInJson(parsed)
    out = typeof redacted === 'string' ? redacted : JSON.stringify(redacted)
  } catch {
    /* not JSON — truncate below */
  }

  if (out.length > MAX_TOOL_MESSAGE_CHARS) {
    return `${out.slice(0, MAX_TOOL_MESSAGE_CHARS)}\n… [truncated, ${out.length} chars total]`
  }
  return out
}

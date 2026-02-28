/**
 * Tavily Search API - web search for AI.
 * Requires TAVILY_API_KEY in .env
 */
import { ipcMain } from 'electron'

const TAVILY_URL = 'https://api.tavily.com/search'

export interface TavilySearchResult {
  title?: string
  url?: string
  content?: string
  score?: number
}

export interface TavilySearchResponse {
  query?: string
  results?: TavilySearchResult[]
  answer?: string
  response_time?: number
}

export interface TavilySearchPayload {
  query: string
  maxResults?: number
  topic?: 'general' | 'news' | 'finance'
}

export interface TavilySearchHandlerResult {
  data: { results: string; answer?: string } | null
  error: string | null
}

function getApiKey(): string | null {
  const key = process.env.TAVILY_API_KEY
  return key && key.trim().length > 0 ? key.trim() : null
}

/** Exported for AI tools. */
export async function tavilySearch(
  query: string,
  options?: { maxResults?: number; topic?: 'general' | 'news' | 'finance' }
): Promise<TavilySearchHandlerResult> {
  const apiKey = getApiKey()
  if (!apiKey) {
    return { data: null, error: 'TAVILY_API_KEY not set. Add it to .env to enable web search.' }
  }

  const q = String(query).trim()
  if (!q) {
    return { data: null, error: 'Search query is required.' }
  }

  const maxResults = Math.min(Math.max(options?.maxResults ?? 5, 1), 20)
  const topic = options?.topic ?? 'general'

  try {
    const res = await fetch(TAVILY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query: q,
        max_results: maxResults,
        topic,
        search_depth: 'basic',
      }),
    })

    const json = (await res.json()) as TavilySearchResponse & { detail?: string }
    if (!res.ok) {
      const detail = typeof json.detail === 'string' ? json.detail : JSON.stringify(json.detail ?? res.statusText)
      return { data: null, error: `Tavily API error ${res.status}: ${detail}` }
    }

    const results = json.results ?? []
    const resultsText = results
      .map((r, i) => {
        const title = r.title ?? 'Untitled'
        const url = r.url ?? ''
        const content = r.content ?? ''
        return `${i + 1}. ${title}\n   URL: ${url}\n   ${content}`
      })
      .join('\n\n')

    return {
      data: {
        results: resultsText || 'No results found.',
        answer: json.answer,
      },
      error: null,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { data: null, error: `Search failed: ${msg}` }
  }
}

export function registerTavilyHandlers(): void {
  ipcMain.handle(
    'tavily-search',
    async (
      _event,
      payload: TavilySearchPayload
    ): Promise<TavilySearchHandlerResult> => {
      return tavilySearch(payload.query, {
        maxResults: payload.maxResults,
        topic: payload.topic,
      })
    }
  )
}

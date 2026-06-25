/**
 * Pure parsing helpers for LocalAIService (streaming tags, follow-ups, attachments, JSON responses).
 */

import type { AIMessage } from '@langchain/core/messages'
import type { StructuredToolInterface } from '@langchain/core/tools'
import type { ChatFollowUp, ChatStreamChunk, DocumentInsight } from '../types'

export function parseContentToChunks(message: AIMessage): ChatStreamChunk[] {
  const chunks: ChatStreamChunk[] = []

  try {
    const blocks = message.contentBlocks
    if (blocks && blocks.length > 0) {
      for (const block of blocks) {
        if (
          block.type === 'reasoning' &&
          'reasoning' in block &&
          typeof (block as { reasoning?: string }).reasoning === 'string'
        ) {
          const r = (block as { reasoning: string }).reasoning
          if (r.trim()) chunks.push({ type: 'reasoning', content: r })
        } else if (
          block.type === 'text' &&
          'text' in block &&
          typeof (block as { text?: string }).text === 'string'
        ) {
          const t = (block as { text: string }).text
          if (t.trim()) chunks.push({ type: 'answer', content: t })
        }
      }
      if (chunks.length > 0) return chunks
    }
  } catch {
    /* contentBlocks may throw; fall through */
  }

  const raw = typeof message.content === 'string' ? message.content : String(message.content ?? '')
  if (!raw.trim()) return []

  const thinkMatch = raw.match(/<think>([\s\S]*?)<\/think>/i)
  if (thinkMatch) {
    const reasoning = thinkMatch[1].trim()
    if (reasoning) chunks.push({ type: 'reasoning', content: reasoning })
  }

  const answerPart = thinkMatch
    ? raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
    : raw
  if (answerPart) chunks.push({ type: 'answer', content: answerPart })

  return chunks.length > 0 ? chunks : [{ type: 'answer', content: raw }]
}

export function hasAppBuiltinBrowserTools(mcpTools: StructuredToolInterface[]): boolean {
  return mcpTools.some((t) => typeof t.name === 'string' && t.name.startsWith('app_browser_'))
}

export function isVisionImageMime(mime: string): boolean {
  const m = mime.toLowerCase().split(';')[0].trim()
  return (
    m === 'image/png' ||
    m === 'image/jpeg' ||
    m === 'image/jpg' ||
    m === 'image/gif' ||
    m === 'image/webp'
  )
}

const TEXT_LIKE_EXTENSIONS = new Set([
  '.json',
  '.md',
  '.markdown',
  '.html',
  '.htm',
  '.xml',
  '.txt',
  '.csv',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.sql',
  '.yaml',
  '.yml',
  '.log',
])

export function fileExtLower(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i).toLowerCase() : ''
}

export function isProbablyUtf8TextFile(fileName: string, mime: string): boolean {
  const m = mime.toLowerCase()
  if (m.startsWith('text/') || m.includes('json') || m.includes('xml') || m.includes('javascript')) {
    return true
  }
  return TEXT_LIKE_EXTENSIONS.has(fileExtLower(fileName))
}

export function normalizeChatFollowUps(items: { label: string; prompt: string }[]): ChatFollowUp[] {
  return items
    .filter(
      (i) =>
        typeof i.label === 'string' &&
        i.label.trim().length > 0 &&
        typeof i.prompt === 'string' &&
        i.prompt.trim().length > 0
    )
    .slice(0, 5)
    .map((i) => ({
      label: i.label.trim().slice(0, 100),
      prompt: i.prompt.trim().slice(0, 4000),
    }))
}

/** Stateful parser for Ollama-style <think>...</think> tags spanning multiple chunks. */
export class ThinkTagParser {
  private insideThink = false

  parse(text: string): ChatStreamChunk[] {
    const chunks: ChatStreamChunk[] = []
    let remaining = text

    while (remaining.length > 0) {
      if (this.insideThink) {
        const closeIdx = remaining.indexOf('</think>')
        if (closeIdx === -1) {
          if (remaining) chunks.push({ type: 'reasoning', content: remaining })
          remaining = ''
        } else {
          const before = remaining.slice(0, closeIdx)
          if (before) chunks.push({ type: 'reasoning', content: before })
          this.insideThink = false
          remaining = remaining.slice(closeIdx + '</think>'.length)
        }
      } else {
        const openIdx = remaining.indexOf('<think>')
        if (openIdx === -1) {
          if (remaining) chunks.push({ type: 'answer', content: remaining })
          remaining = ''
        } else {
          const before = remaining.slice(0, openIdx)
          if (before) chunks.push({ type: 'answer', content: before })
          this.insideThink = true
          remaining = remaining.slice(openIdx + '<think>'.length)
        }
      }
    }
    return chunks
  }
}

export function parseInsightResponse(
  raw: string,
  documentKey: string,
  documentName: string
): DocumentInsight {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const obj = JSON.parse(jsonMatch[0]) as {
        summary?: string
        riskRelevantPoints?: string[]
        recommendations?: string[]
      }
      return {
        documentKey,
        documentName,
        summary: obj.summary ?? 'No summary extracted.',
        riskRelevantPoints: Array.isArray(obj.riskRelevantPoints) ? obj.riskRelevantPoints : [],
        recommendations: Array.isArray(obj.recommendations) ? obj.recommendations : [],
      }
    }
  } catch {
    /* fall through */
  }

  return {
    documentKey,
    documentName,
    summary: raw.slice(0, 500) || 'No summary extracted.',
    riskRelevantPoints: [],
    recommendations: [],
  }
}

export function parseAdvancedAnalysisResponse(raw: string): { sections: { title: string; content: string }[] } {
  const sections: { title: string; content: string }[] = []
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const obj = JSON.parse(jsonMatch[0]) as {
        executiveSummary?: string
        keyFindings?: string[]
        recommendations?: string[]
        riskObservations?: string
        allocationNotes?: string
      }
      if (obj.executiveSummary) sections.push({ title: 'Executive Summary', content: obj.executiveSummary })
      if (Array.isArray(obj.keyFindings) && obj.keyFindings.length > 0) {
        sections.push({ title: 'Key Findings', content: obj.keyFindings.map((f) => `• ${f}`).join('\n') })
      }
      if (obj.riskObservations) sections.push({ title: 'Risk Observations', content: obj.riskObservations })
      if (obj.allocationNotes) sections.push({ title: 'Allocation Notes', content: obj.allocationNotes })
      if (Array.isArray(obj.recommendations) && obj.recommendations.length > 0) {
        sections.push({ title: 'Recommendations', content: obj.recommendations.map((r) => `• ${r}`).join('\n') })
      }
    }
  } catch {
    sections.push({ title: 'Analysis', content: raw.slice(0, 2000) || 'Analysis could not be generated.' })
  }
  if (sections.length === 0) sections.push({ title: 'Analysis', content: 'No analysis content was produced.' })
  return { sections }
}

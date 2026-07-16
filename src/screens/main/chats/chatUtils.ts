import type { SmartRoutingUpdate } from '../../../ai/GroupChatOrchestrator'
import type { ChatAttachment } from '../../../ai/types'

export interface MentionDraft {
  start: number
  end: number
  query: string
}

export interface SmartRoutingStatus extends SmartRoutingUpdate {
  conversationId: string
}

export interface RouterPresentation {
  showProvider: boolean
  verbose: boolean
  providerLabel: string
  model: string
}

export interface AgentProviderPresentation {
  showProvider: boolean
  primaryProvider: 'ollama' | 'bedrock' | 'azure'
  primaryModel: string
}

export interface PendingAttachment extends ChatAttachment {
  id: string
  size: number
  objectUrl?: string
}

export const MAX_CHAT_ATTACHMENTS = 6
export const MAX_CHAT_ATTACHMENT_BYTES = 4 * 1024 * 1024
export const CHAT_ATTACHMENT_ACCEPT =
  'image/png,image/jpeg,image/jpg,image/gif,image/webp,application/pdf,text/plain,text/csv,application/csv,.json,.md,.markdown,.html,.htm,.xml,.yaml,.yml,.txt,.csv,.pdf'
const CHAT_ATTACHMENT_EXTENSIONS = new Set([
  'csv', 'gif', 'htm', 'html', 'jpeg', 'jpg', 'json', 'markdown', 'md',
  'pdf', 'png', 'txt', 'webp', 'xml', 'yaml', 'yml',
])

export function formatConversationTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const today = new Date()
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const daysAgo = Math.round((startOfToday.getTime() - startOfDate.getTime()) / 86_400_000)

  if (daysAgo === 0) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }
  if (daysAgo === 1) return 'Yesterday'
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export function fileToBase64Data(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

export function isSupportedAttachment(file: File): boolean {
  const extension = file.name.split('.').pop()?.toLocaleLowerCase() ?? ''
  return (
    ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'].includes(file.type) ||
    file.type === 'application/pdf' ||
    file.type.startsWith('text/') ||
    ['application/json', 'application/xml', 'application/x-yaml'].includes(file.type) ||
    CHAT_ATTACHMENT_EXTENSIONS.has(extension)
  )
}

export function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function findMentionDraft(value: string, caret: number): MentionDraft | null {
  const beforeCaret = value.slice(0, caret)
  const match = /(^|\s)@([^\s@]*)$/.exec(beforeCaret)
  if (!match) return null
  return {
    start: beforeCaret.length - match[2].length - 1,
    end: caret,
    query: match[2],
  }
}

function escapeMentionPattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function containsMention(value: string, name: string): boolean {
  return new RegExp(
    `(^|\\s)@${escapeMentionPattern(name)}(?=$|[\\s,.;:!?])`,
    'i',
  ).test(value)
}

export function getModelProviderLabel(provider: 'ollama' | 'bedrock' | 'azure', model: string): string {
  if (provider === 'ollama') return 'Ollama'
  if (provider === 'azure') return 'Azure OpenAI'
  if (/anthropic|claude/i.test(model)) return 'Anthropic via Bedrock'
  if (/meta|llama/i.test(model)) return 'Meta via Bedrock'
  if (/mistral/i.test(model)) return 'Mistral via Bedrock'
  if (/cohere|command/i.test(model)) return 'Cohere via Bedrock'
  if (/amazon|nova|titan/i.test(model)) return 'Amazon Bedrock'
  return 'AWS Bedrock'
}

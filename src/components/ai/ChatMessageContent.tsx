import type { ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ChatAttachment, ChatFollowUp } from '../../ai/types'
import './ChatMessageContent.css'

function escapeMentionRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function renderTextWithMentions(text: string, mentionNames: string[]): ReactNode {
  const names = Array.from(
    new Set(mentionNames.map((name) => name.trim()).filter(Boolean)),
  ).sort((left, right) => right.length - left.length)
  if (names.length === 0) return text

  const pattern = new RegExp(
    `(^|\\s)(@(?:${names.map(escapeMentionRegExp).join('|')}))(?=$|[\\s,.;:!?])`,
    'gi',
  )
  const parts: ReactNode[] = []
  let cursor = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    const mentionStart = match.index + match[1].length
    if (mentionStart > cursor) parts.push(text.slice(cursor, mentionStart))
    parts.push(
      <mark key={`${mentionStart}-${match[2]}`} className="ai-chat-mention">
        {match[2]}
      </mark>,
    )
    cursor = mentionStart + match[2].length
  }

  if (cursor < text.length) parts.push(text.slice(cursor))
  return parts.length > 0 ? parts : text
}

export function isImageAttachmentMime(mime: string): boolean {
  const m = mime.toLowerCase().split(';')[0].trim()
  return (
    m === 'image/png' ||
    m === 'image/jpeg' ||
    m === 'image/jpg' ||
    m === 'image/gif' ||
    m === 'image/webp'
  )
}

/** Clickable follow-up prompt chips shown under an assistant reply. */
export function FollowUpsRow({
  items,
  disabled,
  onPick,
}: {
  items: ChatFollowUp[]
  disabled?: boolean
  onPick: (prompt: string) => void
}) {
  if (!items || items.length === 0) return null
  return (
    <div className="ai-chat-follow-ups" role="list" aria-label="Suggested follow-ups">
      {items.map((item, idx) => (
        <button
          key={`${idx}-${item.label.slice(0, 32)}`}
          type="button"
          className="ai-chat-follow-up-chip"
          disabled={disabled}
          onClick={() => onPick(item.prompt)}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

export interface ChatMessageContentProps {
  role: 'user' | 'assistant'
  content: string
  attachments?: ChatAttachment[]
  /** Thinking/reasoning trace for models that support it (o1, o3, llama thinking, etc.) */
  reasoning?: string
  /** Suggested follow-up prompts to render as clickable chips (assistant messages only). */
  followUps?: ChatFollowUp[]
  /** Agent/display names that should be highlighted when @mentioned in user text. */
  mentionNames?: string[]
  /** Disables follow-up chips while a response is in flight. */
  disabled?: boolean
  onFollowUpClick?: (prompt: string) => void
}

/**
 * Shared rendering for a single chat turn's body: markdown answer + reasoning
 * block + follow-up chips for assistant turns, or text + attachment previews
 * for user turns. Extracted from AIChatBubble so the floating assistant
 * widget and the dedicated Chats screen render messages identically.
 */
export default function ChatMessageContent({
  role,
  content,
  attachments,
  reasoning,
  followUps,
  mentionNames = [],
  disabled,
  onFollowUpClick,
}: ChatMessageContentProps) {
  if (role === 'assistant') {
    return (
      <>
        {reasoning && <div className="ai-chat-reasoning">{reasoning}</div>}
        <div className="ai-chat-markdown">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
        <FollowUpsRow
          items={followUps ?? []}
          disabled={disabled}
          onPick={(prompt) => onFollowUpClick?.(prompt)}
        />
      </>
    )
  }

  const hasUnrestoredAttachments =
    content === '(See attached files)' &&
    !!attachments?.length &&
    !attachments.some((a) => (a.dataBase64?.length ?? 0) > 0)

  return (
    <div className="ai-chat-user-turn">
      {attachments && attachments.length > 0 && (
        <div className="ai-chat-msg-attachments">
          {attachments.map((a, idx) =>
            isImageAttachmentMime(a.mimeType) && a.dataBase64 ? (
              <img
                key={`${idx}-${a.name}`}
                className="ai-chat-msg-thumb"
                src={`data:${a.mimeType};base64,${a.dataBase64}`}
                alt=""
              />
            ) : (
              <span key={`${idx}-${a.name}`} className="ai-chat-file-chip" title={a.name}>
                {a.name}
              </span>
            )
          )}
        </div>
      )}
      {hasUnrestoredAttachments ? (
        <span className="ai-chat-att-hint">
          Attached files (payload not restored after reload — re-attach to use in new messages)
        </span>
      ) : content !== '(See attached files)' ? (
        <span className="ai-chat-user-text">{renderTextWithMentions(content, mentionNames)}</span>
      ) : null}
    </div>
  )
}

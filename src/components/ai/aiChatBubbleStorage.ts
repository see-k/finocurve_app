/** Pure helpers for per-user AI chat persistence in localStorage. */

export interface StoredChatFollowUp {
  label: string
  prompt: string
}

export interface StoredChatAttachment {
  name: string
  mimeType: string
  dataBase64: string
}

export interface StoredChatMessage {
  role: 'user' | 'assistant'
  content: string
  attachments?: StoredChatAttachment[]
  reasoning?: string
  followUps?: StoredChatFollowUp[]
}

export const MAX_PERSISTED_CHAT_MESSAGES = 200

export function chatStorageKeyForUser(userEmail?: string, isGuest?: boolean): string {
  const id = userEmail?.trim() || (isGuest ? 'guest' : 'local')
  return `finocurve-ai-chat-messages-${id}`
}

export function loadChatMessages(storageKey: string): StoredChatMessage[] {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((raw): raw is Record<string, unknown> => !!raw && typeof raw === 'object')
      .filter((m) => {
        const role = m.role
        const content = m.content
        const atts = m.attachments
        if (role !== 'user' && role !== 'assistant') return false
        if (typeof content !== 'string') return false
        const hasText = content.trim().length > 0
        const hasAtt =
          role === 'user' &&
          Array.isArray(atts) &&
          atts.length > 0 &&
          atts.every((a) => !!a && typeof a === 'object' && typeof (a as { name?: string }).name === 'string')
        return hasText || hasAtt
      })
      .map((m) => {
        const msg = m as unknown as StoredChatMessage
        const rawFu = msg.followUps
        const followUps =
          Array.isArray(rawFu) && rawFu.length > 0
            ? rawFu.filter(
                (f): f is StoredChatFollowUp =>
                  !!f &&
                  typeof f === 'object' &&
                  typeof f.label === 'string' &&
                  f.label.trim().length > 0 &&
                  typeof f.prompt === 'string' &&
                  f.prompt.trim().length > 0
              )
            : undefined
        const rawAtt = msg.attachments
        const attachments =
          msg.role === 'user' && Array.isArray(rawAtt) && rawAtt.length > 0
            ? rawAtt
                .filter(
                  (a): a is StoredChatAttachment =>
                    !!a &&
                    typeof a === 'object' &&
                    typeof a.name === 'string' &&
                    a.name.trim().length > 0
                )
                .map((a) => ({
                  name: a.name.trim(),
                  mimeType:
                    typeof a.mimeType === 'string' && a.mimeType.trim()
                      ? a.mimeType.trim()
                      : 'application/octet-stream',
                  dataBase64: typeof a.dataBase64 === 'string' ? a.dataBase64 : '',
                }))
            : undefined
        return {
          role: msg.role,
          content: msg.content,
          ...(attachments && attachments.length > 0 ? { attachments } : {}),
          ...(typeof msg.reasoning === 'string' && msg.reasoning ? { reasoning: msg.reasoning } : {}),
          ...(followUps && followUps.length > 0 ? { followUps } : {}),
        }
      })
  } catch {
    return []
  }
}

export function stripChatAttachmentPayloads(messages: StoredChatMessage[]): StoredChatMessage[] {
  return messages.map((m) => {
    if (!m.attachments?.length) return m
    return {
      ...m,
      attachments: m.attachments.map((a) => ({ ...a, dataBase64: '' })),
    }
  })
}

export function persistChatMessages(storageKey: string, messages: StoredChatMessage[]) {
  const trimmed =
    messages.length > MAX_PERSISTED_CHAT_MESSAGES
      ? messages.slice(-MAX_PERSISTED_CHAT_MESSAGES)
      : messages
  const save = (payload: StoredChatMessage[]) => {
    localStorage.setItem(storageKey, JSON.stringify(payload))
  }
  try {
    save(trimmed)
  } catch {
    try {
      save(stripChatAttachmentPayloads(trimmed))
    } catch {
      try {
        save(stripChatAttachmentPayloads(trimmed).slice(-80))
      } catch {
        /* quota or private mode */
      }
    }
  }
}

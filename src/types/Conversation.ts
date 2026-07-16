import type { ChatAttachment, ChatFollowUp } from '../ai/types'

/** A single turn in a Conversation. Extends the base chat message shape with sender metadata
 *  so the UI can show "who said this" for both the user and any number of agent participants. */
export interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
  /** User turns only: images (vision) and/or documents inlined as text after extraction. */
  attachments?: ChatAttachment[]
  /** Which agent authored this reply (assistant turns only). Undefined = the user. */
  senderAgentId?: string
  /** Display name for the message author (user's name, or the agent's name). */
  senderName: string
  /** Avatar for the message author (user's profile picture, or the agent's image). */
  senderAvatar?: string
  /** Reasoning/thinking trace for models that support it (o1, o3, llama thinking, etc.) */
  reasoning?: string
  /** Suggested follow-up prompts from suggest_conversation_follow_ups. */
  followUps?: ChatFollowUp[]
}

/**
 * A persistent chat thread with one or more Agents. A 1:1 chat is simply a Conversation
 * with a single participant; group chats have multiple participantAgentIds who each reply,
 * in order, to every user message.
 */
export interface Conversation {
  id: string
  title: string
  participantAgentIds: string[]
  messages: ConversationMessage[]
  createdAt: string
  updatedAt: string
}

export type ConversationInput = Pick<Conversation, 'title' | 'participantAgentIds'>

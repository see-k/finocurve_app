import { useState, useEffect, useCallback } from 'react'
import type { Conversation, ConversationInput, ConversationMessage } from '../types/Conversation'
import {
  CONVERSATIONS_STORAGE_KEY,
  getCoreDataItem,
  setCoreDataItem,
} from '../lib/coreDataStorage'

function load(): Conversation[] {
  try {
    const stored = getCoreDataItem(CONVERSATIONS_STORAGE_KEY)
    if (stored) return JSON.parse(stored)
  } catch { /* ignore */ }
  return []
}

function save(conversations: Conversation[]) {
  try { setCoreDataItem(CONVERSATIONS_STORAGE_KEY, JSON.stringify(conversations)) } catch { /* ignore */ }
}

function makeId(): string {
  return `conv-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/** SQLite-backed CRUD store with a synchronous local compatibility cache. */
export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>(load)

  useEffect(() => { save(conversations) }, [conversations])

  const getConversation = useCallback(
    (id: string) => conversations.find((c) => c.id === id),
    [conversations],
  )

  /** Returns the existing 1:1 conversation for this agent, if any. */
  const findOneOnOne = useCallback(
    (agentId: string) =>
      conversations.find((c) => c.participantAgentIds.length === 1 && c.participantAgentIds[0] === agentId),
    [conversations],
  )

  const createConversation = useCallback((input: ConversationInput): Conversation => {
    const now = new Date().toISOString()
    const conversation: Conversation = {
      id: makeId(),
      title: input.title,
      participantAgentIds: input.participantAgentIds,
      smartRoutingEnabled: input.smartRoutingEnabled ?? false,
      messages: [],
      createdAt: now,
      updatedAt: now,
    }
    setConversations((prev) => [conversation, ...prev])
    return conversation
  }, [])

  const renameConversation = useCallback((id: string, title: string) => {
    setConversations((prev) => prev.map((c) => (
      c.id === id ? { ...c, title, updatedAt: new Date().toISOString() } : c
    )))
  }, [])

  const appendMessage = useCallback((id: string, message: ConversationMessage) => {
    setConversations((prev) => prev.map((c) => (
      c.id === id
        ? { ...c, messages: [...c.messages, message], updatedAt: new Date().toISOString() }
        : c
    )))
  }, [])

  const replaceMessages = useCallback((id: string, messages: ConversationMessage[]) => {
    setConversations((prev) => prev.map((c) => (
      c.id === id ? { ...c, messages, updatedAt: new Date().toISOString() } : c
    )))
  }, [])

  const setSmartRouting = useCallback((id: string, enabled: boolean) => {
    setConversations((prev) => prev.map((c) => (
      c.id === id
        ? { ...c, smartRoutingEnabled: enabled, updatedAt: new Date().toISOString() }
        : c
    )))
  }, [])

  const setParticipants = useCallback((id: string, participantAgentIds: string[]) => {
    const uniqueParticipantIds = [...new Set(participantAgentIds)]
    if (uniqueParticipantIds.length === 0) return

    setConversations((prev) => prev.map((c) => (
      c.id === id
        ? {
            ...c,
            participantAgentIds: uniqueParticipantIds,
            smartRoutingEnabled: uniqueParticipantIds.length > 1 && c.smartRoutingEnabled === true,
            updatedAt: new Date().toISOString(),
          }
        : c
    )))
  }, [])

  const deleteConversation = useCallback((id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id))
  }, [])

  return {
    conversations,
    getConversation,
    findOneOnOne,
    createConversation,
    renameConversation,
    appendMessage,
    replaceMessages,
    setSmartRouting,
    setParticipants,
    deleteConversation,
  }
}

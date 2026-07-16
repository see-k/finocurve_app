import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react'
import {
  MAX_CHAT_ATTACHMENTS,
  MAX_CHAT_ATTACHMENT_BYTES,
  fileToBase64Data,
  isSupportedAttachment,
  type PendingAttachment,
} from './chatUtils'

/**
 * Owns chat composer attachments: the pending-file list, drag-and-drop state, read
 * errors, and object-URL lifecycle. Kept separate from the conversation runner so the
 * container only wires callbacks together.
 */
export function useChatAttachments(loading: boolean) {
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([])
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const [isReadingAttachments, setIsReadingAttachments] = useState(false)
  const [isDraggingFiles, setIsDraggingFiles] = useState(false)

  const pendingAttachmentsRef = useRef<PendingAttachment[]>([])
  const attachmentReadInProgressRef = useRef(false)
  const dragDepthRef = useRef(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  pendingAttachmentsRef.current = pendingAttachments

  /** Drop every pending file (revoking previews) — call on conversation change or after send. */
  const clearAttachments = useCallback(() => {
    pendingAttachmentsRef.current.forEach((attachment) => {
      if (attachment.objectUrl) URL.revokeObjectURL(attachment.objectUrl)
    })
    pendingAttachmentsRef.current = []
    setPendingAttachments([])
    setAttachmentError(null)
    dragDepthRef.current = 0
    setIsDraggingFiles(false)
  }, [])

  useEffect(() => () => {
    pendingAttachmentsRef.current.forEach((attachment) => {
      if (attachment.objectUrl) URL.revokeObjectURL(attachment.objectUrl)
    })
  }, [])

  const removePendingAttachment = useCallback((id: string) => {
    setPendingAttachments((current) => {
      const removed = current.find((attachment) => attachment.id === id)
      if (removed?.objectUrl) URL.revokeObjectURL(removed.objectUrl)
      const next = current.filter((attachment) => attachment.id !== id)
      pendingAttachmentsRef.current = next
      return next
    })
    setAttachmentError(null)
  }, [])

  const addAttachmentFiles = useCallback(async (files: File[]) => {
    if (files.length === 0 || attachmentReadInProgressRef.current || loading) return

    attachmentReadInProgressRef.current = true
    setIsReadingAttachments(true)
    let availableSlots = MAX_CHAT_ATTACHMENTS - pendingAttachmentsRef.current.length
    const accepted: PendingAttachment[] = []
    let nextError: string | null = null

    try {
      for (const file of files) {
        if (availableSlots <= 0) {
          nextError = `You can attach up to ${MAX_CHAT_ATTACHMENTS} files to one message.`
          break
        }
        if (!isSupportedAttachment(file)) {
          nextError = `“${file.name}” is not a supported image, PDF, or text document.`
          continue
        }
        if (file.size > MAX_CHAT_ATTACHMENT_BYTES) {
          nextError = `“${file.name}” is larger than the 4 MB file limit.`
          continue
        }

        try {
          const mimeType = file.type || 'application/octet-stream'
          accepted.push({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            name: file.name,
            mimeType,
            dataBase64: await fileToBase64Data(file),
            size: file.size,
            objectUrl: mimeType.startsWith('image/') ? URL.createObjectURL(file) : undefined,
          })
          availableSlots -= 1
        } catch {
          nextError = `Could not read “${file.name}”.`
        }
      }

      if (accepted.length > 0) {
        const next = [...pendingAttachmentsRef.current, ...accepted]
        pendingAttachmentsRef.current = next
        setPendingAttachments(next)
      }
      setAttachmentError(nextError)
    } finally {
      attachmentReadInProgressRef.current = false
      setIsReadingAttachments(false)
    }
  }, [loading])

  const hasDraggedFiles = (event: DragEvent<HTMLElement>) =>
    Array.from(event.dataTransfer.types).includes('Files')

  const handleComposerDragEnter = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!hasDraggedFiles(event) || loading) return
    event.preventDefault()
    dragDepthRef.current += 1
    setIsDraggingFiles(true)
  }, [loading])

  const handleComposerDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!hasDraggedFiles(event) || loading) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }, [loading])

  const handleComposerDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!hasDraggedFiles(event)) return
    event.preventDefault()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) setIsDraggingFiles(false)
  }, [])

  const handleComposerDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!hasDraggedFiles(event) || loading) return
    event.preventDefault()
    dragDepthRef.current = 0
    setIsDraggingFiles(false)
    void addAttachmentFiles(Array.from(event.dataTransfer.files))
  }, [loading, addAttachmentFiles])

  return {
    pendingAttachments,
    pendingAttachmentsRef,
    attachmentError,
    setAttachmentError,
    isReadingAttachments,
    isDraggingFiles,
    fileInputRef,
    clearAttachments,
    addAttachmentFiles,
    removePendingAttachment,
    handleComposerDragEnter,
    handleComposerDragOver,
    handleComposerDragLeave,
    handleComposerDrop,
  }
}

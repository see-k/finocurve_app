import { type DragEvent, type KeyboardEvent, type RefObject } from 'react'
import { ArrowUp, FileText, Paperclip, Square, Users, X, BrainCircuit } from 'lucide-react'
import UserAvatar, { getInitials } from '../../../components/UserAvatar'
import { renderTextWithMentions } from '../../../components/ai/ChatMessageContent'
import type { Agent } from '../../../types/Agent'
import {
  CHAT_ATTACHMENT_ACCEPT,
  MAX_CHAT_ATTACHMENTS,
  containsMention,
  formatAttachmentSize,
  type MentionDraft,
  type PendingAttachment,
} from './chatUtils'

export interface MentionSuggestion {
  id: string
  name: string
  image?: string
  description: string
  everyone: boolean
}

interface ChatComposerProps {
  conversationTitle: string
  participants: Agent[]
  input: string
  mentionNames: string[]
  mentionDraft: MentionDraft | null
  mentionSuggestions: MentionSuggestion[]
  activeMentionIndex: number
  onMentionHover: (index: number) => void
  onMentionSelect: (name: string) => void
  composerRef: RefObject<HTMLTextAreaElement | null>
  composerHighlightRef: RefObject<HTMLDivElement | null>
  fileInputRef: RefObject<HTMLInputElement | null>
  onFileInputChange: (files: File[]) => void
  onInputChange: (value: string, caret: number) => void
  onSelectCaret: (value: string, caret: number) => void
  onPasteFiles: (files: File[]) => void
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void
  pendingAttachments: PendingAttachment[]
  onRemoveAttachment: (id: string) => void
  attachmentError: string | null
  isReadingAttachments: boolean
  isDraggingFiles: boolean
  loading: boolean
  verboseStreaming: boolean
  onToggleVerbose: () => void
  onDragEnter: (event: DragEvent<HTMLDivElement>) => void
  onDragOver: (event: DragEvent<HTMLDivElement>) => void
  onDragLeave: (event: DragEvent<HTMLDivElement>) => void
  onDrop: (event: DragEvent<HTMLDivElement>) => void
  onAttachClick: () => void
  onSend: () => void
  onStop: () => void
}

export default function ChatComposer({
  conversationTitle,
  participants,
  input,
  mentionNames,
  mentionDraft,
  mentionSuggestions,
  activeMentionIndex,
  onMentionHover,
  onMentionSelect,
  composerRef,
  composerHighlightRef,
  fileInputRef,
  onFileInputChange,
  onInputChange,
  onSelectCaret,
  onPasteFiles,
  onKeyDown,
  pendingAttachments,
  onRemoveAttachment,
  attachmentError,
  isReadingAttachments,
  isDraggingFiles,
  loading,
  verboseStreaming,
  onToggleVerbose,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
  onAttachClick,
  onSend,
  onStop,
}: ChatComposerProps) {
  const firstNameCounts = new Map<string, number>()
  participants.forEach((participant) => {
    const firstName = participant.name.trim().split(/\s+/)[0].toLocaleLowerCase()
    firstNameCounts.set(firstName, (firstNameCounts.get(firstName) ?? 0) + 1)
  })

  return (
    <footer className="chats-screen__composer-shell">
      {mentionDraft && mentionSuggestions.length > 0 && (
        <div
          className="chats-screen__mention-popover"
          role="listbox"
          id="chat-mention-suggestions"
          aria-label="Mention suggestions"
        >
          <div className="chats-screen__mention-popover-header">
            <span>Address someone</span>
            <small>↑↓ navigate · Enter select</small>
          </div>
          {mentionSuggestions.map((option, index) => (
            <button
              key={option.id}
              id={`chat-mention-option-${option.id}`}
              type="button"
              role="option"
              aria-selected={index === activeMentionIndex}
              className={index === activeMentionIndex ? 'chats-screen__mention-option--active' : ''}
              onMouseEnter={() => onMentionHover(index)}
              onMouseDown={(event) => {
                event.preventDefault()
                onMentionSelect(option.name)
              }}
            >
              {option.everyone ? (
                <span className="chats-screen__mention-everyone"><Users size={15} /></span>
              ) : (
                <UserAvatar src={option.image} initials={getInitials(option.name)} size={30} />
              )}
              <span className="chats-screen__mention-option-copy">
                <strong>@{option.name}</strong>
                <small>{option.description}</small>
              </span>
              <span className="chats-screen__mention-route">
                {option.everyone ? 'Group' : 'Direct'}
              </span>
            </button>
          ))}
        </div>
      )}
      {participants.length > 1 && (
        <div className="chats-screen__mentions" aria-label="Address an advisor">
          <span>To</span>
          {participants.map((participant) => (
            <button
              key={participant.id}
              type="button"
              className={
                containsMention(input, participant.name) ||
                (firstNameCounts.get(participant.name.trim().split(/\s+/)[0].toLocaleLowerCase()) === 1 &&
                  containsMention(input, participant.name.trim().split(/\s+/)[0]))
                  ? 'chats-screen__mention-chip--active'
                  : ''
              }
              onClick={() => onMentionSelect(participant.name)}
              disabled={loading}
              title={`Only ${participant.name} will respond`}
            >
              @{participant.name}
            </button>
          ))}
          <button
            type="button"
            className={containsMention(input, 'everyone') || containsMention(input, 'all')
              ? 'chats-screen__mention-chip--active'
              : ''}
            onClick={() => onMentionSelect('everyone')}
            disabled={loading}
            title="Invite every advisor in a fresh order"
          >
            @everyone
          </button>
        </div>
      )}
      <div
        className={`chats-screen__composer ${isDraggingFiles ? 'chats-screen__composer--dragging' : ''}`}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="chats-screen__file-input"
          accept={CHAT_ATTACHMENT_ACCEPT}
          multiple
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            const files = event.currentTarget.files
              ? Array.from(event.currentTarget.files)
              : []
            event.currentTarget.value = ''
            onFileInputChange(files)
          }}
        />
        {pendingAttachments.length > 0 && (
          <div className="chats-screen__pending-files" aria-label="Files ready to send">
            {pendingAttachments.map((attachment) => (
              <div key={attachment.id} className="chats-screen__pending-file">
                {attachment.objectUrl ? (
                  <img src={attachment.objectUrl} alt="" />
                ) : (
                  <span className="chats-screen__pending-file-icon" aria-hidden="true">
                    <FileText size={16} />
                  </span>
                )}
                <span className="chats-screen__pending-file-copy">
                  <strong>{attachment.name}</strong>
                  <small>{attachment.objectUrl ? 'Image' : 'Document'} · {formatAttachmentSize(attachment.size)}</small>
                </span>
                <button
                  type="button"
                  onClick={() => onRemoveAttachment(attachment.id)}
                  disabled={loading}
                  aria-label={`Remove ${attachment.name}`}
                  title="Remove attachment"
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="chats-screen__composer-row">
          <button
            type="button"
            className="chats-screen__attach"
            onClick={onAttachClick}
            disabled={
              loading ||
              isReadingAttachments ||
              pendingAttachments.length >= MAX_CHAT_ATTACHMENTS ||
              participants.length === 0
            }
            aria-label="Attach files or images"
            title="Attach files or images"
          >
            <Paperclip size={18} />
          </button>
          <div className={`chats-screen__composer-input ${input ? 'chats-screen__composer-input--has-value' : ''}`}>
            <div
              ref={composerHighlightRef}
              className="chats-screen__composer-highlight"
              aria-hidden="true"
            >
              {input ? renderTextWithMentions(input, mentionNames) : '\u200b'}
            </div>
            <textarea
              ref={composerRef}
              value={input}
              onChange={(event) => {
                const nextValue = event.target.value
                onInputChange(nextValue, event.target.selectionStart ?? nextValue.length)
              }}
              onSelect={(event) => {
                onSelectCaret(
                  event.currentTarget.value,
                  event.currentTarget.selectionStart ?? event.currentTarget.value.length,
                )
              }}
              onScroll={(event) => {
                if (composerHighlightRef.current) {
                  composerHighlightRef.current.scrollTop = event.currentTarget.scrollTop
                }
              }}
              onPaste={(event) => {
                const files = Array.from(event.clipboardData.files)
                if (files.length === 0) return
                event.preventDefault()
                onPasteFiles(files)
              }}
              placeholder={participants.length === 0
                ? 'Reactivate or add an expert to continue…'
                : participants.length > 1
                ? 'Message everyone, or @ an advisor directly…'
                : `Message ${conversationTitle}…`}
              rows={1}
              disabled={loading || participants.length === 0}
              aria-label={`Message ${conversationTitle}`}
              aria-autocomplete="list"
              aria-expanded={!!mentionDraft && mentionSuggestions.length > 0}
              aria-controls={mentionDraft ? 'chat-mention-suggestions' : undefined}
              aria-activedescendant={mentionDraft && mentionSuggestions[activeMentionIndex]
                ? `chat-mention-option-${mentionSuggestions[activeMentionIndex].id}`
                : undefined}
              onKeyDown={onKeyDown}
            />
          </div>
          <button
            type="button"
            className={`chats-screen__send ${loading ? 'chats-screen__send--stop' : ''}`}
            onClick={loading ? onStop : onSend}
            disabled={!loading && (
              (!input.trim() && pendingAttachments.length === 0) ||
              participants.length === 0 ||
              isReadingAttachments
            )}
            aria-label={loading ? 'Stop response' : 'Send message'}
            title={loading ? 'Stop response' : 'Send message'}
          >
            {loading ? <Square size={15} fill="currentColor" /> : <ArrowUp size={19} />}
          </button>
        </div>
      </div>
      {attachmentError && <div className="chats-screen__attachment-error" role="alert">{attachmentError}</div>}
      <p>
        <button
          type="button"
          className={`chats-screen__verbose-toggle ${verboseStreaming ? 'chats-screen__verbose-toggle--active' : ''}`}
          onClick={onToggleVerbose}
          aria-pressed={verboseStreaming}
          title="Show live reasoning and tool activity while responses generate"
        >
          <BrainCircuit size={13} /> Verbose {verboseStreaming ? 'on' : 'off'}
        </button>
        <span>·</span>
        {participants.length > 1 && <><b>@mention for a direct reply</b><span>·</span></>}
        <b>Attach, paste, or drop files</b><span>·</span>
        Enter to send <span>·</span> Shift + Enter for a new line
      </p>
    </footer>
  )
}

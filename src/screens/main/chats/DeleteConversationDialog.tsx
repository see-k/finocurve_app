import { createPortal } from 'react-dom'
import { Trash2 } from 'lucide-react'
import type { Conversation } from '../../../types/Conversation'

interface DeleteConversationDialogProps {
  target: Conversation
  title: string
  onCancel: () => void
  onConfirm: () => void
}

export default function DeleteConversationDialog({ target, title, onCancel, onConfirm }: DeleteConversationDialogProps) {
  return createPortal(
    <div
      className="chats-screen__delete-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <div
        className="chats-screen__delete-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-conversation-title"
        aria-describedby="delete-conversation-description"
      >
        <span className="chats-screen__delete-dialog-icon"><Trash2 size={20} /></span>
        <span className="chats-screen__eyebrow">Permanent action</span>
        <h2 id="delete-conversation-title">Delete this conversation?</h2>
        <p id="delete-conversation-description">
          “{title}” and {target.messages.length}{' '}
          {target.messages.length === 1 ? 'message' : 'messages'} will be permanently removed.
        </p>
        <div className="chats-screen__delete-dialog-actions">
          <button type="button" onClick={onCancel}>Keep conversation</button>
          <button type="button" className="chats-screen__delete-confirm" onClick={onConfirm}>
            <Trash2 size={14} /> Delete permanently
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

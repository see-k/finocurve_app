import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Camera, Bot, Trash2 } from 'lucide-react'
import GlassContainer from '../../../components/glass/GlassContainer'
import GlassButton from '../../../components/glass/GlassButton'
import GlassTextField from '../../../components/glass/GlassTextField'
import GlassIconButton from '../../../components/glass/GlassIconButton'
import UserAvatar, { getInitials } from '../../../components/UserAvatar'
import { useAgents } from '../../../store/useAgents'
import { compressImageForProfile } from '../../../utils/profilePicture'
import '../SettingsSubScreen.css'
import './AgentsScreen.css'

export default function CreateEditAgentScreen() {
  const navigate = useNavigate()
  const { agentId } = useParams<{ agentId: string }>()
  const isEditing = !!agentId && agentId !== 'new'
  const { getAgent, createAgent, updateAgent, deleteAgent } = useAgents()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const existing = isEditing ? getAgent(agentId!) : undefined

  const [visible, setVisible] = useState(false)
  const [name, setName] = useState(existing?.name || '')
  const [description, setDescription] = useState(existing?.description || '')
  const [systemPrompt, setSystemPrompt] = useState(existing?.systemPrompt || '')
  const [image, setImage] = useState<string | undefined>(existing?.image)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  useEffect(() => { requestAnimationFrame(() => setVisible(true)) }, [])

  // Keep form in sync if navigated directly to an existing agent's id
  useEffect(() => {
    if (existing) {
      setName(existing.name)
      setDescription(existing.description || '')
      setSystemPrompt(existing.systemPrompt)
      setImage(existing.image)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId])

  const handleAvatarClick = () => fileInputRef.current?.click()

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    setUploading(true)
    try {
      const dataUrl = await compressImageForProfile(file)
      setImage(dataUrl)
    } catch {
      // Silently fail; user can try again
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const handleSave = () => {
    if (!name.trim()) {
      setError('Agent name is required')
      return
    }
    if (!systemPrompt.trim()) {
      setError('System prompt is required')
      return
    }
    setError(null)
    const input = {
      name: name.trim(),
      description: description.trim() || undefined,
      systemPrompt: systemPrompt.trim(),
      image,
    }
    if (isEditing && existing) {
      updateAgent(existing.id, input)
    } else {
      createAgent(input)
    }
    navigate('/settings/agents')
  }

  const handleDelete = () => {
    if (existing) deleteAgent(existing.id)
    navigate('/settings/agents')
  }

  return (
    <div className="settings-sub">
      <div className="settings-sub-bg settings-sub-bg--1" />
      <div className="settings-sub-bg settings-sub-bg--2" />
      <div className={`settings-sub-content ${visible ? 'settings-sub-content--visible' : ''}`}>
        <div className="settings-sub-header">
          <GlassIconButton icon={<ArrowLeft size={20} />} onClick={() => navigate('/settings/agents')} size={44} />
          <h1 className="settings-sub-title">{isEditing ? 'Edit Agent' : 'Create Agent'}</h1>
        </div>

        <GlassContainer>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
          <div
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 24 }}
            role="button"
            tabIndex={0}
            onClick={handleAvatarClick}
            onKeyDown={(e) => e.key === 'Enter' && handleAvatarClick()}
            className="agent-avatar-picker"
          >
            <div className="account-avatar-wrapper">
              <UserAvatar src={image} initials={getInitials(name || 'Agent')} size={80} />
              {uploading && <div className="account-avatar-overlay">Uploading…</div>}
              <div className="account-avatar-badge">
                <Camera size={16} />
              </div>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
              {image ? (
                <>
                  Tap to change photo ·{' '}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setImage(undefined) }}
                    style={{ background: 'none', border: 'none', color: 'var(--status-error)', cursor: 'pointer', fontSize: 12, textDecoration: 'underline' }}
                  >
                    Remove
                  </button>
                </>
              ) : (
                'Tap to add photo'
              )}
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Agent name</label>
              <GlassTextField value={name} onChange={setName} placeholder="e.g. Portfolio Analyst" prefixIcon={<Bot size={16} />} />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Description (optional)</label>
              <GlassTextField value={description} onChange={setDescription} placeholder="Short summary shown in the agents list" />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>System prompt</label>
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 8 }}>
                Defines this agent's persona, tone, and instructions. Sent to the model before every conversation.
              </p>
              <GlassTextField
                value={systemPrompt}
                onChange={setSystemPrompt}
                placeholder="You are a helpful assistant that specializes in..."
                maxLines={6}
              />
            </div>

            {error && <p style={{ fontSize: 13, color: 'var(--status-error)' }}>{error}</p>}

            <GlassButton text={isEditing ? 'Save Changes' : 'Create Agent'} onClick={handleSave} isPrimary />

            {isEditing && (
              <GlassButton
                text="Delete Agent"
                icon={<Trash2 size={16} />}
                onClick={() => setShowDeleteConfirm(true)}
              />
            )}
          </div>
        </GlassContainer>
      </div>

      {showDeleteConfirm && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <GlassContainer className="modal-content" onClick={undefined}>
            <div onClick={(e) => e.stopPropagation()}>
              <h2 style={{ color: 'var(--status-error)', marginBottom: 8 }}>Delete Agent?</h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: 20, fontSize: 14 }}>
                This will permanently delete "{existing?.name}". This cannot be undone.
              </p>
              <div style={{ display: 'flex', gap: 12 }}>
                <GlassButton text="Cancel" onClick={() => setShowDeleteConfirm(false)} />
                <GlassButton text="Delete" onClick={handleDelete} isPrimary />
              </div>
            </div>
          </GlassContainer>
        </div>
      )}
    </div>
  )
}

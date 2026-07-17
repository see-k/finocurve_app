import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, User, Mail, Camera, Building2, BriefcaseBusiness, Globe, Link, ExternalLink, FileText } from 'lucide-react'
import GlassContainer from '../../components/glass/GlassContainer'
import GlassButton from '../../components/glass/GlassButton'
import GlassTextField from '../../components/glass/GlassTextField'
import GlassIconButton from '../../components/glass/GlassIconButton'
import UserAvatar from '../../components/UserAvatar'
import { usePreferences } from '../../store/usePreferences'
import { compressImageForProfile } from '../../utils/profilePicture'
import './SettingsSubScreen.css'

export default function AccountScreen() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { prefs, updatePreferences } = usePreferences()
  const [visible, setVisible] = useState(false)
  const [name, setName] = useState(prefs.userName || '')
  const [email, setEmail] = useState(prefs.userEmail || '')
  const [profilePicture, setProfilePicture] = useState<string | undefined>(prefs.profilePicturePath)
  const [companyName, setCompanyName] = useState(prefs.companyName || '')
  const [companyRole, setCompanyRole] = useState(prefs.companyRole || '')
  const [companyWebsite, setCompanyWebsite] = useState(prefs.companyWebsite || '')
  const [linkedInUrl, setLinkedInUrl] = useState(prefs.linkedInUrl || '')
  const [socialMediaUrl, setSocialMediaUrl] = useState(prefs.socialMediaUrl || '')
  const [personalBio, setPersonalBio] = useState(prefs.personalBio || '')
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    setName(prefs.userName || '')
    setEmail(prefs.userEmail || '')
    setProfilePicture(prefs.profilePicturePath)
    setCompanyName(prefs.companyName || '')
    setCompanyRole(prefs.companyRole || '')
    setCompanyWebsite(prefs.companyWebsite || '')
    setLinkedInUrl(prefs.linkedInUrl || '')
    setSocialMediaUrl(prefs.socialMediaUrl || '')
    setPersonalBio(prefs.personalBio || '')
  }, [prefs])

  useEffect(() => { requestAnimationFrame(() => setVisible(true)) }, [])

  const handleSave = () => {
    updatePreferences({
      userName: name.trim(), userEmail: email.trim(), profilePicturePath: profilePicture,
      companyName: companyName.trim() || undefined,
      companyRole: companyRole.trim() || undefined,
      companyWebsite: companyWebsite.trim() || undefined,
      linkedInUrl: linkedInUrl.trim() || undefined,
      socialMediaUrl: socialMediaUrl.trim() || undefined,
      personalBio: personalBio.trim() || undefined,
    })
    navigate(-1)
  }

  const handleAvatarClick = () => fileInputRef.current?.click()

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    setUploading(true)
    try {
      const dataUrl = await compressImageForProfile(file)
      setProfilePicture(dataUrl)
      updatePreferences({ profilePicturePath: dataUrl })
    } catch {
      // Silently fail; user can try again
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const initials = (name || 'U').split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div className="settings-sub">
      <div className="settings-sub-bg settings-sub-bg--1" />
      <div className="settings-sub-bg settings-sub-bg--2" />
      <div className={`settings-sub-content ${visible ? 'settings-sub-content--visible' : ''}`}>
        <div className="settings-sub-header">
          <GlassIconButton icon={<ArrowLeft size={20} />} onClick={() => navigate(-1)} size={44} />
          <h1 className="settings-sub-title">Account</h1>
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
            className="account-avatar-picker"
          >
            <div className="account-avatar-wrapper">
              <UserAvatar src={profilePicture} initials={initials} size={80} />
              {uploading && <div className="account-avatar-overlay">Uploading…</div>}
              <div className="account-avatar-badge">
                <Camera size={16} />
              </div>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
              {profilePicture ? (
                <>
                  Tap to change photo ·{' '}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setProfilePicture(undefined); updatePreferences({ profilePicturePath: undefined }); }}
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
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Name</label>
              <GlassTextField value={name} onChange={setName} placeholder="Your name" prefixIcon={<User size={16} />} />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Email</label>
              <GlassTextField value={email} onChange={setEmail} placeholder="your@email.com" prefixIcon={<Mail size={16} />} type="email" />
            </div>

            <div className="account-form-section">
              <h2>Company</h2>
              <p>Optional details help your experts tailor business and financial guidance.</p>
            </div>
            <div>
              <label className="account-field-label">Company name <span>Optional</span></label>
              <GlassTextField value={companyName} onChange={setCompanyName} placeholder="Acme, Inc." prefixIcon={<Building2 size={16} />} />
            </div>
            <div>
              <label className="account-field-label">Your role <span>Optional</span></label>
              <GlassTextField value={companyRole} onChange={setCompanyRole} placeholder="Founder, CFO, Analyst…" prefixIcon={<BriefcaseBusiness size={16} />} />
            </div>
            <div>
              <label className="account-field-label">Company website <span>Optional</span></label>
              <GlassTextField value={companyWebsite} onChange={setCompanyWebsite} placeholder="https://company.com" prefixIcon={<Globe size={16} />} type="url" />
            </div>

            <div className="account-form-section">
              <h2>About you</h2>
              <p>These details are optional and available to your AI experts when relevant.</p>
            </div>
            <div>
              <label className="account-field-label">LinkedIn <span>Optional</span></label>
              <GlassTextField value={linkedInUrl} onChange={setLinkedInUrl} placeholder="https://linkedin.com/in/you" prefixIcon={<Link size={16} />} type="url" />
            </div>
            <div>
              <label className="account-field-label">Other social profile <span>Optional</span></label>
              <GlassTextField value={socialMediaUrl} onChange={setSocialMediaUrl} placeholder="X, Bluesky, personal site…" prefixIcon={<ExternalLink size={16} />} type="url" />
            </div>
            <div>
              <label className="account-field-label">Short bio <span>Optional</span></label>
              <GlassTextField value={personalBio} onChange={setPersonalBio} placeholder="Share your background, interests, or priorities" prefixIcon={<FileText size={16} />} maxLines={3} />
            </div>
            <GlassButton text="Save Changes" onClick={handleSave} isPrimary />
          </div>
        </GlassContainer>
      </div>
    </div>
  )
}

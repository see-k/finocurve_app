import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Image as ImageIcon, Trash2, FileText, UploadCloud } from 'lucide-react'
import GlassContainer from '../../components/glass/GlassContainer'
import GlassButton from '../../components/glass/GlassButton'
import GlassTextField from '../../components/glass/GlassTextField'
import GlassIconButton from '../../components/glass/GlassIconButton'
import {
  loadDocumentBranding,
  saveDocumentBranding,
  resolveFooterLabel,
  hexToRgbTuple,
  DEFAULT_BRAND_ACCENT,
  type DocumentBranding,
} from '../../services/documentBranding'
import { normalizeLogoForDocuments, BrandLogoError } from '../../utils/brandLogo'
import { generateBrandedCustomReportPdf } from '../../services/brandedCustomReportPdf'
import './SettingsSubScreen.css'

export default function DocumentBrandingScreen() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pageVisible, setPageVisible] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedOk, setSavedOk] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [companyName, setCompanyName] = useState('')
  const [logo, setLogo] = useState<string | undefined>(undefined)
  const [accentColor, setAccentColor] = useState(DEFAULT_BRAND_ACCENT)
  const [footerLabel, setFooterLabel] = useState('')

  useEffect(() => {
    requestAnimationFrame(() => setPageVisible(true))
  }, [])

  useEffect(() => {
    loadDocumentBranding()
      .then((b) => {
        setCompanyName(b.companyName)
        setLogo(b.logoPngDataUrl)
        setAccentColor(b.accentColor ?? DEFAULT_BRAND_ACCENT)
        setFooterLabel(b.footerLabel ?? '')
      })
      .catch(() => setError('Could not load saved branding'))
      .finally(() => setLoading(false))
  }, [])

  const currentBranding = (): DocumentBranding => ({
    companyName: companyName.trim(),
    logoPngDataUrl: logo,
    accentColor,
    footerLabel: footerLabel.trim() || undefined,
  })

  const handleLogoPick = () => fileInputRef.current?.click()

  const handleLogoFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    try {
      const dataUrl = await normalizeLogoForDocuments(file)
      setLogo(dataUrl)
    } catch (err) {
      setError(err instanceof BrandLogoError ? err.message : 'Could not process the logo.')
    }
  }

  const handleSave = async () => {
    setError(null)
    setSavedOk(false)
    setSaving(true)
    try {
      const result = await saveDocumentBranding(currentBranding())
      if (!result.ok) {
        setError(result.error || 'Could not save branding')
        return
      }
      setSavedOk(true)
      setTimeout(() => setSavedOk(false), 2500)
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    setError(null)
    setSaving(true)
    try {
      await saveDocumentBranding({ companyName: '' })
      setCompanyName('')
      setLogo(undefined)
      setAccentColor(DEFAULT_BRAND_ACCENT)
      setFooterLabel('')
    } finally {
      setSaving(false)
    }
  }

  const handleSamplePdf = () => {
    setError(null)
    try {
      const branding = currentBranding()
      const bytes = generateBrandedCustomReportPdf({
        title: branding.companyName ? `${branding.companyName} — Sample Report` : 'Sample Report',
        subtitle: 'Branding preview',
        logoDataUrl: branding.logoPngDataUrl ?? null,
        footerLabel: resolveFooterLabel(branding),
        brandColor: hexToRgbTuple(branding.accentColor) ?? undefined,
        coverNote: branding.companyName
          ? `Prepared by ${branding.companyName}. Generated with FinoCurve.`
          : undefined,
        sections: [
          {
            heading: 'Overview',
            body: 'This is a preview of how generated reports and documents will look with your branding. '
              + 'The cover logo, accent color, and footer reflect the settings above.',
          },
          {
            heading: 'Sample metrics',
            body: 'Tables and charts use your accent color for emphasis.',
            tables: [{ headers: ['Metric', 'Value'], rows: [['Total value', '$1,250,000'], ['Holdings', '18'], ['Risk score', '46 / 100']] }],
            charts: [{ type: 'bar', title: 'Allocation', labels: ['Equity', 'Bonds', 'Cash', 'Alt'], values: [55, 25, 12, 8] }],
          },
        ],
      })
      const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate the sample PDF.')
    }
  }

  const labelStyle: CSSProperties = {
    display: 'block', color: 'var(--text-tertiary)', fontSize: 12,
    textTransform: 'uppercase', letterSpacing: '0.06em', margin: '18px 0 8px',
  }

  return (
    <div className="settings-sub">
      <div className="settings-sub-bg settings-sub-bg--1" />
      <div className="settings-sub-bg settings-sub-bg--2" />
      <div className={`settings-sub-content ${pageVisible ? 'settings-sub-content--visible' : ''}`}>
        <div className="settings-sub-header">
          <GlassIconButton icon={<ArrowLeft size={20} />} onClick={() => navigate('/main?tab=settings')} title="Back" />
          <h1 className="settings-sub-title">Document branding</h1>
        </div>

        {loading ? (
          <GlassContainer padding="24px" borderRadius={16}>
            <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Loading…</p>
          </GlassContainer>
        ) : (
          <GlassContainer padding="20px 22px" borderRadius={16}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <ImageIcon size={18} style={{ color: 'var(--brand-primary)' }} />
              <h2 style={{ color: 'var(--text-primary)', fontSize: 16, margin: 0 }}>Your brand on generated documents</h2>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.55, margin: '0 0 6px' }}>
              Applied to every report and document generated in this app, including those created by AI agents.
              A small "Generated with FinoCurve" line remains in the footer and disclaimers. Stored on this device only.
            </p>

            <span style={labelStyle}>Company name</span>
            <GlassTextField value={companyName} onChange={setCompanyName} placeholder="Acme Capital" />

            <span style={labelStyle}>Logo</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{
                width: 96, height: 96, borderRadius: 12, background: 'var(--glass-bg, rgba(255,255,255,0.06))',
                border: '1px solid var(--glass-border, rgba(255,255,255,0.12))', display: 'flex',
                alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0,
              }}>
                {logo
                  ? <img src={logo} alt="Logo preview" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                  : <ImageIcon size={28} style={{ color: 'var(--text-tertiary)' }} />}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <GlassButton text={logo ? 'Replace logo' : 'Upload logo'} icon={<UploadCloud size={16} />} onClick={handleLogoPick} width="auto" />
                {logo && <GlassButton text="Remove" icon={<Trash2 size={16} />} onClick={() => setLogo(undefined)} width="auto" />}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/svg+xml,image/png,image/jpeg,image/webp,image/gif"
                onChange={handleLogoFile}
                style={{ display: 'none' }}
              />
            </div>
            <p style={{ color: 'var(--text-tertiary)', fontSize: 13, lineHeight: 1.5, margin: '10px 0 0' }}>
              SVG, PNG, JPG, WEBP, or GIF up to 2 MB. Logos are converted to a high-resolution PNG for use in PDFs.
            </p>

            <span style={labelStyle}>Accent color</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <input
                type="color"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                aria-label="Accent color"
                style={{ width: 44, height: 36, border: 'none', background: 'none', padding: 0, cursor: 'pointer' }}
              />
              <div style={{ width: 120 }}>
                <GlassTextField value={accentColor} onChange={setAccentColor} placeholder="#6366f1" />
              </div>
            </div>

            <span style={labelStyle}>Footer label (optional)</span>
            <GlassTextField
              value={footerLabel}
              onChange={setFooterLabel}
              placeholder={companyName.trim() ? `${companyName.trim()} Report` : 'FinoCurve Report'}
            />

            {error && <p style={{ color: 'var(--status-error)', fontSize: 14, margin: '16px 0 0' }}>{error}</p>}
            {savedOk && <p style={{ color: 'var(--status-success)', fontSize: 14, margin: '16px 0 0' }}>Saved.</p>}

            <div style={{ display: 'flex', gap: 12, marginTop: 22, flexWrap: 'wrap' }}>
              <GlassButton text={saving ? 'Saving…' : 'Save'} onClick={handleSave} isPrimary disabled={saving} width="auto" />
              <GlassButton text="Generate sample PDF" icon={<FileText size={16} />} onClick={handleSamplePdf} disabled={saving} width="auto" />
              <GlassButton text="Reset to default" onClick={handleReset} disabled={saving} width="auto" />
            </div>
          </GlassContainer>
        )}
      </div>
    </div>
  )
}

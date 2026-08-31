/**
 * Pure document-branding helpers shared by the renderer, Electron main, and tests.
 * No Electron, SQLite, or DOM dependencies.
 */

/** Default accent used when no brand color is configured (matches app brand). */
export const DEFAULT_BRAND_ACCENT = '#6366f1'

export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/
export const MAX_COMPANY_NAME = 120
export const MAX_FOOTER_LABEL = 120
/** Data URLs are ~1.33x the raw bytes; 4MB string ~= 3MB image, generous for a 512px PNG. */
export const MAX_LOGO_DATA_URL_LENGTH = 4 * 1024 * 1024

export interface DocumentBranding {
  /** Client/company display name shown on documents. Empty means unbranded. */
  companyName: string
  /** Normalized PNG data URL (longest edge <= 512px), or undefined when unset. */
  logoPngDataUrl?: string
  /** Hex accent color (#rrggbb) used for document chrome. */
  accentColor?: string
  /** Footer label; defaults to `${companyName} Report` when unset. */
  footerLabel?: string
}

export const EMPTY_BRANDING: DocumentBranding = { companyName: '' }

/** True when a brand is actually configured (has a name or logo). */
export function hasBranding(branding: DocumentBranding | null | undefined): boolean {
  return Boolean(branding && (branding.companyName || branding.logoPngDataUrl))
}

/** True when nothing is configured and documents should fall back to FinoCurve identity. */
export function isEmptyBranding(branding: DocumentBranding): boolean {
  return !branding.companyName && !branding.logoPngDataUrl && !branding.accentColor && !branding.footerLabel
}

/**
 * Coerce arbitrary input into a valid, storable branding record.
 * Returns null when the payload is structurally invalid (wrong types, bad logo, bad color).
 */
export function normalizeDocumentBranding(raw: unknown): DocumentBranding | null {
  if (raw === null || raw === undefined) return { companyName: '' }
  if (typeof raw !== 'object' || Array.isArray(raw)) return null
  const input = raw as Record<string, unknown>

  const companyName = typeof input.companyName === 'string'
    ? input.companyName.trim().slice(0, MAX_COMPANY_NAME)
    : ''

  const result: DocumentBranding = { companyName }

  if (typeof input.logoPngDataUrl === 'string' && input.logoPngDataUrl.length > 0) {
    const logo = input.logoPngDataUrl
    if (!logo.startsWith('data:image/png;base64,')) return null
    if (logo.length > MAX_LOGO_DATA_URL_LENGTH) return null
    result.logoPngDataUrl = logo
  }

  if (typeof input.accentColor === 'string' && input.accentColor.length > 0) {
    const color = input.accentColor.trim()
    if (!HEX_COLOR.test(color)) return null
    result.accentColor = color.toLowerCase()
  }

  if (typeof input.footerLabel === 'string' && input.footerLabel.trim().length > 0) {
    result.footerLabel = input.footerLabel.trim().slice(0, MAX_FOOTER_LABEL)
  }

  return result
}

/** Lenient parse used by the renderer cache (never throws, never returns null). */
export function sanitizeDocumentBranding(raw: unknown): DocumentBranding {
  return normalizeDocumentBranding(raw) ?? { ...EMPTY_BRANDING }
}

/** Resolve the effective footer label for a document. */
export function resolveFooterLabel(branding: DocumentBranding | null | undefined): string {
  if (branding?.footerLabel) return branding.footerLabel
  if (branding?.companyName) return `${branding.companyName} Report`
  return 'FinoCurve Report'
}

/** Filename-safe slug of the company name; empty when unbranded. */
export function brandFileSlug(name: string | undefined): string {
  if (!name) return ''
  return name.trim().replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40)
}

/** Parse a validated `#rrggbb` string into a jsPDF RGB tuple; null when invalid/unset. */
export function hexToRgbTuple(hex: string | undefined): [number, number, number] | null {
  if (!hex || !HEX_COLOR.test(hex)) return null
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return [r, g, b]
}

/**
 * Document branding storage: an installation-level brand (company name, logo,
 * accent color, footer label) applied to generated reports and documents.
 * Persisted as a single JSON value in the app_settings table, mirroring the
 * enterprise-service-URL pattern.
 */

import { getCoreDataDb } from './coreDataDb'
import {
  isEmptyBranding,
  normalizeDocumentBranding,
  type DocumentBranding,
} from '../src/lib/documentBrandingCore'

export {
  DEFAULT_BRAND_ACCENT,
  EMPTY_BRANDING,
  brandFileSlug,
  hexToRgbTuple,
  isEmptyBranding,
  normalizeDocumentBranding,
  resolveFooterLabel,
  type DocumentBranding,
} from '../src/lib/documentBrandingCore'

const DOCUMENT_BRANDING_SETTING_KEY = 'document_branding'

/** Read the stored branding, or an empty (unbranded) record when unset or unreadable. */
export function readDocumentBranding(): DocumentBranding {
  try {
    const row = getCoreDataDb()
      .prepare('SELECT value FROM app_settings WHERE key = ?')
      .get(DOCUMENT_BRANDING_SETTING_KEY) as { value?: string } | undefined
    if (!row?.value) return { companyName: '' }
    const parsed = JSON.parse(row.value) as unknown
    return normalizeDocumentBranding(parsed) ?? { companyName: '' }
  } catch {
    return { companyName: '' }
  }
}

/**
 * Persist branding. An empty company name with no logo clears the setting so
 * documents fall back to the default FinoCurve identity.
 */
export function saveDocumentBranding(branding: DocumentBranding): void {
  const db = getCoreDataDb()
  if (isEmptyBranding(branding)) {
    db.prepare('DELETE FROM app_settings WHERE key = ?').run(DOCUMENT_BRANDING_SETTING_KEY)
    return
  }
  db.prepare(`
    INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(DOCUMENT_BRANDING_SETTING_KEY, JSON.stringify(branding), new Date().toISOString())
}

/**
 * Installation-level document branding (company name, logo, accent color,
 * footer label) applied to generated reports and documents.
 *
 * Storage lives in the app's SQLite database via IPC (Settings → Document
 * branding). Browser dev builds without Electron fall back to localStorage.
 */

import {
  EMPTY_BRANDING,
  isEmptyBranding,
  sanitizeDocumentBranding,
  type DocumentBranding,
} from '../lib/documentBrandingCore'

export {
  DEFAULT_BRAND_ACCENT,
  EMPTY_BRANDING,
  brandFileSlug,
  hasBranding,
  hexToRgbTuple,
  isEmptyBranding,
  resolveFooterLabel,
  type DocumentBranding,
} from '../lib/documentBrandingCore'

const BROWSER_STORAGE_KEY = 'finocurve-document-branding'

let cachedBranding: DocumentBranding | null = null

/** Load the configured branding (IPC or localStorage) into the module cache. */
export async function loadDocumentBranding(): Promise<DocumentBranding> {
  if (window.electronAPI?.brandingGet) {
    try {
      const result = await window.electronAPI.brandingGet()
      cachedBranding = sanitizeDocumentBranding(result?.branding)
    } catch {
      cachedBranding = { ...EMPTY_BRANDING }
    }
  } else {
    try {
      const stored = localStorage.getItem(BROWSER_STORAGE_KEY)
      cachedBranding = stored ? sanitizeDocumentBranding(JSON.parse(stored)) : { ...EMPTY_BRANDING }
    } catch {
      cachedBranding = { ...EMPTY_BRANDING }
    }
  }
  return cachedBranding
}

/** Last loaded branding; empty until loadDocumentBranding resolves or when unconfigured. */
export function getDocumentBranding(): DocumentBranding {
  return cachedBranding ?? { ...EMPTY_BRANDING }
}

/** Ensure branding is loaded once, returning the cached value on subsequent calls. */
export async function ensureDocumentBranding(): Promise<DocumentBranding> {
  if (cachedBranding) return cachedBranding
  return loadDocumentBranding()
}

export async function saveDocumentBranding(
  branding: DocumentBranding,
): Promise<{ ok: boolean; branding?: DocumentBranding; error?: string }> {
  const clean = sanitizeDocumentBranding(branding)
  if (window.electronAPI?.brandingSet) {
    const result = await window.electronAPI.brandingSet(clean)
    if (result.ok) cachedBranding = sanitizeDocumentBranding(result.branding ?? clean)
    return result
  }
  try {
    if (isEmptyBranding(clean)) {
      localStorage.removeItem(BROWSER_STORAGE_KEY)
    } else {
      localStorage.setItem(BROWSER_STORAGE_KEY, JSON.stringify(clean))
    }
    cachedBranding = clean
    return { ok: true, branding: clean }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not save branding' }
  }
}

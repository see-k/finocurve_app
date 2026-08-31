import { describe, expect, it } from 'vitest'
import {
  DEFAULT_BRAND_ACCENT,
  EMPTY_BRANDING,
  MAX_COMPANY_NAME,
  MAX_FOOTER_LABEL,
  MAX_LOGO_DATA_URL_LENGTH,
  brandFileSlug,
  hasBranding,
  hexToRgbTuple,
  isEmptyBranding,
  normalizeDocumentBranding,
  resolveFooterLabel,
  sanitizeDocumentBranding,
} from '../src/lib/documentBrandingCore'
import {
  BrandLogoError,
  MAX_EDGE,
  MAX_FILE_BYTES,
  SVG_FALLBACK_SIZE,
  assertLogoFileAcceptable,
  computeLogoOutputSize,
  isAcceptedLogoType,
  looksDimensionless,
} from '../src/utils/brandLogo'
import { generateBrandedCustomReportPdf } from '../src/services/brandedCustomReportPdf'

describe('normalizeDocumentBranding', () => {
  it('treats null/undefined as an empty brand', () => {
    expect(normalizeDocumentBranding(null)).toEqual({ companyName: '' })
    expect(normalizeDocumentBranding(undefined)).toEqual({ companyName: '' })
  })

  it('rejects arrays and primitives', () => {
    expect(normalizeDocumentBranding([])).toBeNull()
    expect(normalizeDocumentBranding('Acme')).toBeNull()
    expect(normalizeDocumentBranding(42)).toBeNull()
  })

  it('trims and caps company name and footer label', () => {
    const result = normalizeDocumentBranding({
      companyName: `  ${'A'.repeat(MAX_COMPANY_NAME + 20)}  `,
      footerLabel: `  ${'B'.repeat(MAX_FOOTER_LABEL + 20)}  `,
    })
    expect(result?.companyName).toHaveLength(MAX_COMPANY_NAME)
    expect(result?.footerLabel).toHaveLength(MAX_FOOTER_LABEL)
  })

  it('lowercases a valid accent color', () => {
    expect(normalizeDocumentBranding({ companyName: 'Acme', accentColor: '#C8A96A' })?.accentColor).toBe('#c8a96a')
  })

  it('rejects invalid accent colors', () => {
    expect(normalizeDocumentBranding({ companyName: 'Acme', accentColor: 'indigo' })).toBeNull()
    expect(normalizeDocumentBranding({ companyName: 'Acme', accentColor: '#fff' })).toBeNull()
    expect(normalizeDocumentBranding({ companyName: 'Acme', accentColor: '#GGGGGG' })).toBeNull()
  })

  it('accepts a PNG data URL logo and rejects other encodings', () => {
    const png = 'data:image/png;base64,iVBORw0KGgo='
    expect(normalizeDocumentBranding({ companyName: 'Acme', logoPngDataUrl: png })?.logoPngDataUrl).toBe(png)
    expect(normalizeDocumentBranding({ companyName: 'Acme', logoPngDataUrl: 'data:image/svg+xml;base64,abc' })).toBeNull()
    expect(normalizeDocumentBranding({ companyName: 'Acme', logoPngDataUrl: 'https://example.com/logo.png' })).toBeNull()
  })

  it('rejects oversized logo data URLs', () => {
    const huge = `data:image/png;base64,${'A'.repeat(MAX_LOGO_DATA_URL_LENGTH)}`
    expect(normalizeDocumentBranding({ companyName: 'Acme', logoPngDataUrl: huge })).toBeNull()
  })

  it('omits empty optional fields', () => {
    expect(normalizeDocumentBranding({ companyName: 'Acme', accentColor: '', footerLabel: '  ' })).toEqual({
      companyName: 'Acme',
    })
  })
})

describe('branding resolution defaults', () => {
  it('uses FinoCurve Report when nothing is configured', () => {
    expect(resolveFooterLabel(undefined)).toBe('FinoCurve Report')
    expect(resolveFooterLabel(EMPTY_BRANDING)).toBe('FinoCurve Report')
    expect(resolveFooterLabel({ companyName: '' })).toBe('FinoCurve Report')
  })

  it('derives footer from company name, then an explicit footer label', () => {
    expect(resolveFooterLabel({ companyName: 'Acme Capital' })).toBe('Acme Capital Report')
    expect(resolveFooterLabel({ companyName: 'Acme', footerLabel: 'Confidential' })).toBe('Confidential')
  })

  it('slugs company names for filenames and returns empty when unbranded', () => {
    expect(brandFileSlug(undefined)).toBe('')
    expect(brandFileSlug('')).toBe('')
    expect(brandFileSlug('  Acme Capital LLC  ')).toBe('Acme_Capital_LLC')
    expect(brandFileSlug('@@@')).toBe('')
    expect(brandFileSlug('A'.repeat(80))).toHaveLength(40)
  })

  it('parses hex colors into jsPDF RGB tuples', () => {
    expect(hexToRgbTuple(undefined)).toBeNull()
    expect(hexToRgbTuple(DEFAULT_BRAND_ACCENT)).toEqual([99, 102, 241])
    expect(hexToRgbTuple('#c8a96a')).toEqual([200, 169, 106])
    expect(hexToRgbTuple('#fff')).toBeNull()
  })

  it('detects configured vs empty branding', () => {
    expect(hasBranding(undefined)).toBe(false)
    expect(hasBranding(EMPTY_BRANDING)).toBe(false)
    expect(hasBranding({ companyName: 'Acme' })).toBe(true)
    expect(hasBranding({ companyName: '', logoPngDataUrl: 'data:image/png;base64,abc' })).toBe(true)
    expect(isEmptyBranding({ companyName: '', accentColor: '#6366f1' })).toBe(false)
    expect(isEmptyBranding(EMPTY_BRANDING)).toBe(true)
  })

  it('sanitizeDocumentBranding never returns null', () => {
    expect(sanitizeDocumentBranding([])).toEqual(EMPTY_BRANDING)
    expect(sanitizeDocumentBranding({ companyName: ' Acme ' }).companyName).toBe('Acme')
  })
})

describe('logo normalization guards', () => {
  it('rejects files over 2 MB', () => {
    expect(() => assertLogoFileAcceptable({ size: MAX_FILE_BYTES + 1, type: 'image/png', name: 'logo.png' }))
      .toThrow(BrandLogoError)
  })

  it('rejects unsupported MIME types', () => {
    expect(() => assertLogoFileAcceptable({ size: 100, type: 'application/pdf', name: 'logo.pdf' }))
      .toThrow(/Unsupported image type/)
  })

  it('accepts svg, png, jpg, webp, and gif', () => {
    for (const type of ['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp', 'image/gif']) {
      expect(() => assertLogoFileAcceptable({ size: 100, type, name: 'logo' })).not.toThrow()
    }
    expect(isAcceptedLogoType('', 'brand.svg')).toBe(true)
    expect(isAcceptedLogoType('', 'brand.pdf')).toBe(false)
  })

  it('treats Chromium’s 300×150 default as dimensionless', () => {
    expect(looksDimensionless(300, 150)).toBe(true)
    expect(looksDimensionless(0, 0)).toBe(true)
    expect(looksDimensionless(128, 128)).toBe(false)
  })

  it('rasterizes dimensionless SVGs into a 512×512 box', () => {
    expect(computeLogoOutputSize(300, 150, true)).toEqual({ width: SVG_FALLBACK_SIZE, height: SVG_FALLBACK_SIZE })
    expect(computeLogoOutputSize(0, 0, false)).toBeNull()
  })

  it('scales oversized rasters to MAX_EDGE while preserving aspect ratio', () => {
    expect(computeLogoOutputSize(1024, 512, false)).toEqual({ width: MAX_EDGE, height: 256 })
    expect(computeLogoOutputSize(256, 1024, false)).toEqual({ width: 128, height: MAX_EDGE })
    expect(computeLogoOutputSize(200, 100, false)).toEqual({ width: 200, height: 100 })
  })
})

describe('generateBrandedCustomReportPdf', () => {
  it('emits a PDF when given client branding options', () => {
    const pdf = generateBrandedCustomReportPdf({
      title: 'Q1 Review',
      subtitle: 'Preview',
      footerLabel: 'Acme Capital Report',
      brandColor: [200, 169, 106],
      coverNote: 'Prepared by Acme Capital. Generated with FinoCurve.',
      sections: [{ heading: 'Summary', body: 'Holdings remain within target ranges.' }],
    })
    expect(pdf.byteLength).toBeGreaterThan(500)
    expect(String.fromCharCode(pdf[0], pdf[1], pdf[2], pdf[3])).toBe('%PDF')
  })
})

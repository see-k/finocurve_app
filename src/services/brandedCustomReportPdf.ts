/**
 * Branded custom report PDF for AI-generated content.
 * Visual language matches riskReportPdf (letterhead, logo placement, palette).
 * Uses named jsPDF import for Electron main / Node resolution.
 */
import { jsPDF } from 'jspdf'

const C = {
  brand: [99, 102, 241] as [number, number, number],
  dark: [15, 23, 42] as [number, number, number],
  text: [30, 41, 59] as [number, number, number],
  muted: [100, 116, 139] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  lightBg: [241, 245, 249] as [number, number, number],
}

export interface BrandedCustomReportSection {
  heading: string
  body: string
}

export interface BrandedCustomReportOptions {
  title: string
  subtitle?: string
  sections: BrandedCustomReportSection[]
  /** PNG as data URL, e.g. data:image/png;base64,... */
  logoDataUrl?: string | null
  /** Left footer text (default: FinoCurve Report) */
  footerLabel?: string
}

export function generateBrandedCustomReportPdf(opts: BrandedCustomReportOptions): Uint8Array {
  const { title, subtitle, sections, logoDataUrl: logoData } = opts
  const footerLabel = opts.footerLabel ?? 'FinoCurve Report'

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pw = doc.internal.pageSize.getWidth()
  const ph = doc.internal.pageSize.getHeight()
  const margin = 20
  const cw = pw - margin * 2
  let y = 0

  function addFooter() {
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...C.muted)
    doc.text(footerLabel, margin, ph - 8)
    doc.text(`Page ${doc.getNumberOfPages()}`, pw - margin, ph - 8, { align: 'right' })
  }

  function newPage() {
    doc.addPage()
    y = margin
    addFooter()
  }

  function checkSpace(needed: number) {
    if (y + needed > ph - 20) newPage()
  }

  function sectionTitleBlock(sectionHeading: string) {
    checkSpace(16)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...C.dark)
    doc.text(sectionHeading, margin, y)
    y += 2
    doc.setDrawColor(...C.brand)
    doc.setLineWidth(0.8)
    doc.line(margin, y, margin + 40, y)
    y += 8
  }

  function bodyText(text: string, maxW: number = cw) {
    const paragraphs = text.split(/\n\n+/).map((p) => p.trim()).filter(Boolean)
    for (const para of paragraphs) {
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...C.text)
      const lines = doc.splitTextToSize(para, maxW)
      const blockH = lines.length * 4 + 2
      checkSpace(blockH)
      doc.text(lines, margin, y)
      y += lines.length * 4 + 4
    }
  }

  // ── Cover (aligned with risk report) ──
  doc.setFillColor(...C.dark)
  doc.rect(0, 0, pw, 80, 'F')
  doc.setFillColor(...C.brand)
  doc.rect(0, 80, pw, 3, 'F')

  if (logoData) {
    try {
      doc.addImage(logoData, 'PNG', pw - margin - 36, 12, 36, 36)
    } catch {
      /* ignore */
    }
  }

  let coverY = 28
  doc.setFontSize(26)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...C.white)
  const titleLines = doc.splitTextToSize(title.slice(0, 180), cw - 8)
  doc.text(titleLines, margin, coverY)
  coverY += titleLines.length * 9 + 4

  doc.setFontSize(12)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(180, 190, 220)
  const sub = subtitle?.trim() || 'Custom analysis'
  const subLines = doc.splitTextToSize(sub.slice(0, 220), cw - 8)
  doc.text(subLines, margin, coverY)
  coverY += subLines.length * 5 + 6

  doc.setFontSize(10)
  doc.text(
    `Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`,
    margin,
    Math.min(coverY, 72)
  )

  y = 100
  doc.setFillColor(...C.lightBg)
  doc.roundedRect(margin, y - 4, cw, 22, 4, 4, 'F')
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...C.muted)
  doc.text('This document was prepared in FinoCurve with the same branding as standard app reports.', margin + 6, y + 6)
  doc.text('Content below reflects the analysis requested; review figures and assumptions before acting.', margin + 6, y + 14)
  y = 132

  addFooter()

  for (const sec of sections) {
    sectionTitleBlock(sec.heading)
    bodyText(sec.body)
    y += 4
  }

  checkSpace(28)
  doc.setDrawColor(...C.muted)
  doc.setLineWidth(0.3)
  doc.line(margin, y, pw - margin, y)
  y += 10
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...C.muted)
  const disclaimers = [
    'This report is for informational purposes only and does not constitute financial, investment, or tax advice.',
    'You should consult a qualified professional before making investment decisions.',
  ]
  for (const d of disclaimers) {
    const lines = doc.splitTextToSize(`• ${d}`, cw)
    checkSpace(lines.length * 3.5 + 4)
    doc.text(lines, margin, y)
    y += lines.length * 3.5 + 2
  }

  const arr = doc.output('arraybuffer')
  return new Uint8Array(arr)
}

export function safeReportFileSlug(title: string, maxLen = 48): string {
  const base = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, maxLen)
  return base || 'Report'
}

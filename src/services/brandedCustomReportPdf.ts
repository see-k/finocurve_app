/**
 * Branded custom report PDF for AI-generated content.
 * Visual language matches riskReportPdf (letterhead, logo placement, palette).
 * Uses named jsPDF import for Electron main / Node resolution.
 */
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

const C = {
  brand: [99, 102, 241] as [number, number, number],
  dark: [15, 23, 42] as [number, number, number],
  text: [30, 41, 59] as [number, number, number],
  muted: [100, 116, 139] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  lightBg: [241, 245, 249] as [number, number, number],
}

const CHART_COLORS: [number, number, number][] = [
  [99, 102, 241],
  [59, 130, 246],
  [16, 185, 129],
  [245, 158, 11],
  [239, 68, 68],
  [139, 92, 246],
  [236, 72, 153],
  [20, 184, 166],
]

export interface BrandedCustomReportTable {
  /** Optional caption above the table */
  title?: string
  headers: string[]
  rows: string[][]
}

export type BrandedCustomReportChart =
  | { type: 'bar'; title?: string; labels: string[]; values: number[] }
  | { type: 'line'; title?: string; labels: string[]; values: number[] }
  | { type: 'pie'; title?: string; labels: string[]; values: number[] }

export interface BrandedCustomReportSection {
  heading: string
  body: string
  /** Rendered after the section body; same styling as risk report tables */
  tables?: BrandedCustomReportTable[]
  /** Bar, line, or pie visuals using numeric series aligned with labels */
  charts?: BrandedCustomReportChart[]
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

function normalizeRow(headers: string[], row: string[]): string[] {
  const out = headers.map((_, i) => (row[i] != null ? String(row[i]) : ''))
  return out
}

function drawPieSlice(
  doc: jsPDF,
  cx: number,
  cy: number,
  r: number,
  a0: number,
  a1: number,
  rgb: [number, number, number]
) {
  const segs = Math.max(8, Math.ceil((32 * (a1 - a0)) / (2 * Math.PI)))
  doc.setFillColor(...rgb)
  for (let i = 0; i < segs; i++) {
    const t0 = a0 + ((a1 - a0) * i) / segs
    const t1 = a0 + ((a1 - a0) * (i + 1)) / segs
    const x1 = cx + r * Math.cos(t0)
    const y1 = cy + r * Math.sin(t0)
    const x2 = cx + r * Math.cos(t1)
    const y2 = cy + r * Math.sin(t1)
    doc.lines(
      [
        [x1 - cx, y1 - cy],
        [x2 - x1, y2 - y1],
        [cx - x2, cy - y2],
      ],
      cx,
      cy,
      [1, 1],
      'F',
      true
    )
  }
}

function renderTableBlock(
  doc: jsPDF,
  y: number,
  margin: number,
  cw: number,
  table: BrandedCustomReportTable
): number {
  let startY = y
  const title = table.title?.trim()
  if (title) {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...C.dark)
    doc.text(title.slice(0, 200), margin, startY)
    startY += 7
  }
  const headers = table.headers.map((h) => h.slice(0, 500))
  const body = table.rows.map((row) => normalizeRow(headers, row))
  autoTable(doc, {
    startY: startY,
    head: [headers],
    body,
    margin: { left: margin, right: margin },
    tableWidth: cw,
    theme: 'striped',
    headStyles: { fillColor: C.dark, textColor: C.white, fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8, textColor: C.text },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    styles: { overflow: 'linebreak', cellPadding: 1.5 },
  })
  const last = (doc as { lastAutoTable?: { finalY: number } }).lastAutoTable
  return (last?.finalY ?? startY) + 8
}

function formatChartNumber(n: number): string {
  if (!Number.isFinite(n)) return '—'
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)}M`
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(2)}k`
  if (Number.isInteger(n)) return String(n)
  return n.toFixed(2)
}

function estimateChartHeight(chart: BrandedCustomReportChart): number {
  const titleH = chart.title?.trim() ? 7 : 0
  if (chart.type === 'pie') {
    const legendRows = Math.ceil(chart.labels.length / 2)
    return titleH + 42 + Math.min(legendRows, 8) * 4 + 6
  }
  return titleH + 38 + 8
}

function renderBarChart(
  doc: jsPDF,
  y: number,
  margin: number,
  cw: number,
  chart: { title?: string; labels: string[]; values: number[] }
): number {
  let yy = y
  if (chart.title?.trim()) {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...C.dark)
    doc.text(chart.title.trim().slice(0, 120), margin, yy)
    yy += 7
  }
  const labels = chart.labels
  const values = chart.values
  const n = labels.length
  const chartH = 32
  const chartTop = yy + 2
  const chartBottom = chartTop + chartH
  const minV = Math.min(0, ...values)
  const maxV = Math.max(0, ...values)
  const range = maxV - minV || 1
  const gap = 1.2
  const barW = Math.max(2, (cw - gap * (n + 1)) / n)

  doc.setDrawColor(...C.muted)
  doc.setLineWidth(0.2)
  doc.line(margin, chartBottom, margin + cw, chartBottom)

  const zeroY = chartBottom - ((0 - minV) / range) * chartH
  if (minV < 0 && maxV > 0) {
    doc.setDrawColor(200, 200, 210)
    doc.line(margin, zeroY, margin + cw, zeroY)
  }

  for (let i = 0; i < n; i++) {
    const v = values[i]
    const x = margin + gap + i * (barW + gap)
    const yVal = chartBottom - ((v - minV) / range) * chartH
    const top = Math.min(zeroY, yVal)
    const h = Math.abs(yVal - zeroY)
    if (h > 0.05) {
      doc.setFillColor(...C.brand)
      doc.rect(x, top, barW, h, 'F')
    }
    doc.setFontSize(6)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...C.muted)
    const lbl = doc.splitTextToSize(labels[i].slice(0, 40), barW + gap)
    doc.text(lbl, x + barW / 2, chartBottom + 3.5, { align: 'center', maxWidth: barW + gap })
    doc.setFontSize(6)
    doc.setTextColor(...C.text)
    const tag = formatChartNumber(v)
    doc.text(tag, x + barW / 2, top - 1.5, { align: 'center' })
  }

  return chartBottom + Math.min(n, 8) * 2.5 + 6
}

function renderLineChart(
  doc: jsPDF,
  y: number,
  margin: number,
  cw: number,
  chart: { title?: string; labels: string[]; values: number[] }
): number {
  let yy = y
  if (chart.title?.trim()) {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...C.dark)
    doc.text(chart.title.trim().slice(0, 120), margin, yy)
    yy += 7
  }
  const values = chart.values
  const n = values.length
  const chartH = 30
  const padL = 14
  const chartTop = yy + 2
  const chartBottom = chartTop + chartH
  const plotW = cw - padL
  const minV = Math.min(...values)
  const maxV = Math.max(...values)
  const pad = maxV === minV ? 1 : (maxV - minV) * 0.08
  const lo = minV - pad
  const hi = maxV + pad
  const range = hi - lo || 1

  doc.setDrawColor(...C.muted)
  doc.setLineWidth(0.2)
  doc.line(margin + padL, chartBottom, margin + cw, chartBottom)
  doc.line(margin + padL, chartTop, margin + padL, chartBottom)

  doc.setFontSize(6)
  doc.setTextColor(...C.muted)
  doc.text(formatChartNumber(hi), margin + 2, chartTop + 2)
  doc.text(formatChartNumber(lo), margin + 2, chartBottom - 1)

  const pts: { x: number; y: number }[] = []
  for (let i = 0; i < n; i++) {
    const t = n <= 1 ? 0.5 : i / (n - 1)
    const px = margin + padL + t * plotW
    const py = chartBottom - ((values[i] - lo) / range) * chartH
    pts.push({ x: px, y: py })
  }

  doc.setDrawColor(...C.brand)
  doc.setLineWidth(0.6)
  for (let i = 0; i < pts.length - 1; i++) {
    doc.line(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y)
  }
  doc.setFillColor(...C.brand)
  for (const p of pts) {
    doc.circle(p.x, p.y, 0.9, 'F')
  }

  doc.setFontSize(6)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...C.muted)
  for (let i = 0; i < n; i++) {
    const t = n <= 1 ? 0.5 : i / (n - 1)
    const px = margin + padL + t * plotW
    const lbl = doc.splitTextToSize(chart.labels[i].slice(0, 32), plotW / n + 4)
    doc.text(lbl, px, chartBottom + 3.5, { align: 'center', maxWidth: plotW / n + 6 })
  }

  return chartBottom + 12
}

function renderPieChart(
  doc: jsPDF,
  y: number,
  margin: number,
  cw: number,
  chart: { title?: string; labels: string[]; values: number[] }
): number {
  let yy = y
  if (chart.title?.trim()) {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...C.dark)
    doc.text(chart.title.trim().slice(0, 120), margin, yy)
    yy += 7
  }
  const values = chart.values.map((v) => (v > 0 && Number.isFinite(v) ? v : 0))
  const total = values.reduce((a, b) => a + b, 0)
  if (total <= 0) {
    doc.setFontSize(9)
    doc.setTextColor(...C.muted)
    doc.text('No positive values to chart.', margin, yy + 8)
    return yy + 14
  }

  const r = 18
  const cx = margin + r + 4
  const cy = yy + r + 6
  let angle = -Math.PI / 2
  for (let i = 0; i < values.length; i++) {
    const frac = values[i] / total
    const slice = frac * 2 * Math.PI
    const a1 = angle + slice
    const color = CHART_COLORS[i % CHART_COLORS.length]
    if (slice > 0.001) drawPieSlice(doc, cx, cy, r, angle, a1, color)
    angle = a1
  }
  doc.setDrawColor(...C.dark)
  doc.setLineWidth(0.3)
  doc.circle(cx, cy, r, 'S')

  let lx = margin + 2 * r + 14
  let ly = yy + 4
  doc.setFontSize(7)
  for (let i = 0; i < chart.labels.length; i++) {
    const color = CHART_COLORS[i % CHART_COLORS.length]
    doc.setFillColor(...color)
    doc.rect(lx, ly - 2.5, 3, 3, 'F')
    doc.setTextColor(...C.text)
    const pct = ((values[i] / total) * 100).toFixed(1)
    const line = `${chart.labels[i].slice(0, 36)} (${pct}%)`
    doc.text(line, lx + 5, ly)
    ly += 4.2
    if (ly > yy + 38 && lx < margin + cw * 0.55) {
      lx = margin + cw * 0.52
      ly = yy + 4
    }
  }

  return Math.max(cy + r, ly) + 8
}

function renderChartBlock(
  doc: jsPDF,
  y: number,
  margin: number,
  cw: number,
  chart: BrandedCustomReportChart
): number {
  if (chart.type === 'bar') return renderBarChart(doc, y, margin, cw, chart)
  if (chart.type === 'line') return renderLineChart(doc, y, margin, cw, chart)
  return renderPieChart(doc, y, margin, cw, chart)
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

    const tables = sec.tables ?? []
    for (const t of tables) {
      if (!t.headers?.length) continue
      checkSpace(24)
      y = renderTableBlock(doc, y, margin, cw, t)
    }

    const charts = sec.charts ?? []
    for (const c of charts) {
      if (!c.labels?.length || !c.values?.length || c.labels.length !== c.values.length) continue
      checkSpace(estimateChartHeight(c))
      y = renderChartBlock(doc, y, margin, cw, c)
    }

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

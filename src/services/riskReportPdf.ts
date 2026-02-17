/**
 * Risk Analysis PDF Report Generator
 * Generates a professional multi-page risk report using jsPDF.
 * Includes company logo and detailed portfolio analysis.
 */
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { RiskAnalysisResult, Asset } from '../types'
import { assetCurrentValue, ASSET_TYPE_LABELS, SECTOR_LABELS } from '../types'

// ── Colors ──
const C = {
  brand: [99, 102, 241] as [number, number, number],
  dark: [15, 23, 42] as [number, number, number],
  text: [30, 41, 59] as [number, number, number],
  muted: [100, 116, 139] as [number, number, number],
  success: [16, 185, 129] as [number, number, number],
  warning: [245, 158, 11] as [number, number, number],
  error: [239, 68, 68] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  lightBg: [241, 245, 249] as [number, number, number],
}

const RISK_COLORS: Record<string, [number, number, number]> = {
  conservative: C.success,
  moderate: C.brand,
  growth: C.warning,
  aggressive: C.error,
}

const fmt = (n: number) => '$' + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function severityLabel(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Load an image from a URL and return as base64 data URL */
function loadImageAsBase64(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) { resolve(null); return }
      ctx.drawImage(img, 0, 0)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => resolve(null)
    img.src = url
  })
}

export interface DocumentInsight {
  documentKey: string
  documentName: string
  summary: string
  riskRelevantPoints: string[]
  recommendations: string[]
}

interface ReportOptions {
  risk: RiskAnalysisResult
  assets: Asset[]
  totalValue: number
  totalGainLossPercent: number
  portfolioName: string
  sectorAlloc: Record<string, number>
  countryAlloc: Record<string, number>
  typeAlloc: Record<string, number>
  /** AI-generated insights from user documents */
  documentInsights?: DocumentInsight[]
  /** When true, returns PDF as Uint8Array instead of triggering download */
  returnBlob?: boolean
}

export async function generateRiskReportPdf(opts: ReportOptions) {
  const { risk, assets, totalValue, totalGainLossPercent, portfolioName, sectorAlloc, countryAlloc, typeAlloc, documentInsights } = opts
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pw = doc.internal.pageSize.getWidth()
  const ph = doc.internal.pageSize.getHeight()
  const margin = 20
  const cw = pw - margin * 2
  let y = 0

  const riskColor = RISK_COLORS[risk.riskLevel] || C.brand

  // ── Load company logo ──
  let logoData: string | null = null
  try {
    logoData = await loadImageAsBase64('/images/finocurve-logo-transparent.png')
  } catch { /* ignore */ }

  // ────────────────────────────────────
  // Helper functions
  // ────────────────────────────────────
  function addFooter() {
    doc.setFontSize(8)
    doc.setTextColor(...C.muted)
    doc.text('FinoCurve Risk Report', margin, ph - 8)
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

  function sectionTitle(title: string) {
    checkSpace(16)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...C.dark)
    doc.text(title, margin, y)
    y += 2
    doc.setDrawColor(...C.brand)
    doc.setLineWidth(0.8)
    doc.line(margin, y, margin + 40, y)
    y += 8
  }

  function bodyText(text: string, maxW: number = cw) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...C.text)
    const lines = doc.splitTextToSize(text, maxW)
    doc.text(lines, margin, y)
    y += lines.length * 4
  }

  function drawProgressBar(x: number, yPos: number, width: number, pct: number, color: [number, number, number]) {
    const clampedPct = Math.min(Math.max(pct, 0), 100)
    doc.setFillColor(...C.lightBg)
    doc.roundedRect(x, yPos, width, 4, 2, 2, 'F')
    doc.setFillColor(...color)
    doc.roundedRect(x, yPos, Math.max(2, width * (clampedPct / 100)), 4, 2, 2, 'F')
  }

  // ────────────────────────────────────
  // PAGE 1: Cover
  // ────────────────────────────────────
  // Dark header
  doc.setFillColor(...C.dark)
  doc.rect(0, 0, pw, 80, 'F')

  // Accent line
  doc.setFillColor(...riskColor)
  doc.rect(0, 80, pw, 3, 'F')

  // Company logo (top-right of header)
  if (logoData) {
    try {
      doc.addImage(logoData, 'PNG', pw - margin - 36, 12, 36, 36)
    } catch { /* ignore if image fails */ }
  }

  // Title text
  doc.setFontSize(28)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...C.white)
  doc.text('Risk Analysis Report', margin, 36)

  doc.setFontSize(13)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(180, 190, 220)
  doc.text(portfolioName || 'Portfolio Risk Assessment', margin, 48)

  doc.setFontSize(10)
  doc.text(`Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, margin, 62)

  // Executive Summary Box
  y = 100

  doc.setFillColor(...C.lightBg)
  doc.roundedRect(margin, y - 4, cw, 60, 4, 4, 'F')

  // Logo watermark in summary box (small)
  if (logoData) {
    try {
      doc.setGState(new (doc as any).GState({ opacity: 0.06 }))
      doc.addImage(logoData, 'PNG', pw - margin - 52, y, 48, 48)
      doc.setGState(new (doc as any).GState({ opacity: 1 }))
    } catch { /* ignore */ }
  }

  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...C.dark)
  doc.text('Executive Summary', margin + 8, y + 6)

  y += 14
  const summaryItems = [
    ['Risk Score', `${risk.riskScore}/100`, riskColor],
    ['Risk Level', risk.riskLevel.charAt(0).toUpperCase() + risk.riskLevel.slice(1), riskColor],
    ['Portfolio Value', fmt(totalValue), C.text],
    ['Return', `${totalGainLossPercent >= 0 ? '+' : ''}${totalGainLossPercent.toFixed(2)}%`, totalGainLossPercent >= 0 ? C.success : C.error],
    ['Sharpe Ratio', `${risk.sharpeRatio}`, C.text],
    ['Max Drawdown', `-${risk.maxDrawdownPercent}%`, C.error],
  ]

  const colW = cw / 3
  summaryItems.forEach(([lbl, val, color], i) => {
    const col = i % 3
    const row = Math.floor(i / 3)
    const xOff = margin + 8 + col * colW
    const yOff = y + row * 16

    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...C.muted)
    doc.text(lbl as string, xOff, yOff)

    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...(color as [number, number, number]))
    doc.text(val as string, xOff, yOff + 6)
  })

  y = 172

  // Verdict
  doc.setFontSize(10)
  doc.setFont('helvetica', 'italic')
  doc.setTextColor(...C.muted)
  const verdictLines = doc.splitTextToSize(`Benchmark Verdict: ${risk.benchmarkComparison.verdict}`, cw)
  doc.text(verdictLines, margin, y)
  y += verdictLines.length * 5 + 8

  // Key warnings
  if (risk.concentrationWarnings.length > 0) {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...C.warning)
    doc.text('Key Warnings', margin, y)
    y += 6
    risk.concentrationWarnings.slice(0, 3).forEach(w => {
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...C.text)
      doc.text(`• ${w.message}`, margin + 4, y)
      y += 5
    })
  }

  addFooter()

  // ────────────────────────────────────
  // PAGE 2: Portfolio Composition
  // ────────────────────────────────────
  newPage()

  sectionTitle('Portfolio Composition')

  const holdingsHead = ['#', 'Asset', 'Type', 'Value', 'Weight', 'Gain/Loss']
  const holdingsBody = assets.sort((a, b) => assetCurrentValue(b) - assetCurrentValue(a)).map((a, i) => {
    const cv = assetCurrentValue(a)
    const gl = cv - (a.costBasis * a.quantity)
    const glPct = a.costBasis > 0 ? ((cv / (a.costBasis * a.quantity)) - 1) * 100 : 0
    return [
      `${i + 1}`,
      a.name,
      ASSET_TYPE_LABELS[a.type] || a.type,
      fmt(cv),
      `${(cv / totalValue * 100).toFixed(1)}%`,
      `${gl >= 0 ? '+' : ''}${fmt(gl)} (${glPct >= 0 ? '+' : ''}${glPct.toFixed(1)}%)`,
    ]
  })

  autoTable(doc, {
    startY: y,
    head: [holdingsHead],
    body: holdingsBody,
    margin: { left: margin, right: margin },
    theme: 'striped',
    headStyles: { fillColor: C.dark, textColor: C.white, fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8, textColor: C.text },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 0: { cellWidth: 8 }, 1: { cellWidth: 45 }, 5: { cellWidth: 40 } },
  })

  y = (doc as any).lastAutoTable.finalY + 12

  // ────────────────────────────────────
  // PAGE 3: Risk Metrics
  // ────────────────────────────────────
  newPage()

  sectionTitle('Risk Overview & Key Metrics')

  const metricsData = [
    ['Metric', 'Value', 'Assessment'],
    ['Risk Score', `${risk.riskScore}/100`, `${risk.riskLevel.charAt(0).toUpperCase() + risk.riskLevel.slice(1)}`],
    ['Annualized Volatility', `${risk.annualizedVolatility}%`, risk.volatilityLevel.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())],
    ['Sharpe Ratio', `${risk.sharpeRatio}`, risk.sharpeRating.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())],
    ['Max Drawdown', `-${risk.maxDrawdownPercent}%`, fmt(risk.maxDrawdown)],
    ['Diversification Score', `${risk.diversificationScore}/100`, risk.diversificationScore >= 70 ? 'Good' : risk.diversificationScore >= 40 ? 'Fair' : 'Poor'],
    ['Liquidity Score', `${risk.liquidityScore}/100`, risk.liquidityLevel.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())],
    ['Concentration Index (HHI)', risk.concentrationIndex.toFixed(4), risk.concentrationIndex > 0.25 ? 'Concentrated' : 'Diversified'],
  ]

  autoTable(doc, {
    startY: y,
    head: [metricsData[0]],
    body: metricsData.slice(1),
    margin: { left: margin, right: margin },
    theme: 'striped',
    headStyles: { fillColor: C.dark, textColor: C.white, fontSize: 9, fontStyle: 'bold' },
    bodyStyles: { fontSize: 9, textColor: C.text },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 55 }, 1: { cellWidth: 40 } },
  })

  y = (doc as any).lastAutoTable.finalY + 12

  sectionTitle('Risk Contribution by Asset Type')

  const contribEntries = Object.entries(risk.riskContributionByType).sort(([,a], [,b]) => b - a)
  contribEntries.forEach(([type, pct]) => {
    checkSpace(10)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...C.text)
    doc.text(type, margin, y)
    drawProgressBar(margin + 50, y - 3, 80, pct, C.brand)
    doc.setFont('helvetica', 'bold')
    doc.text(`${pct}%`, margin + 135, y)
    y += 7
  })

  y += 6

  checkSpace(40)
  sectionTitle('Benchmark Comparison — S&P 500')

  autoTable(doc, {
    startY: y,
    head: [['Metric', 'Your Portfolio', 'S&P 500', 'Difference']],
    body: [
      ['Return', `${risk.benchmarkComparison.portfolioReturn}%`, `${risk.benchmarkComparison.benchmarkReturn}%`, `${risk.benchmarkComparison.returnDiff > 0 ? '+' : ''}${risk.benchmarkComparison.returnDiff}%`],
      ['Volatility', `${risk.benchmarkComparison.portfolioVolatility}%`, `${risk.benchmarkComparison.benchmarkVolatility}%`, `${risk.benchmarkComparison.riskDiff > 0 ? '+' : ''}${risk.benchmarkComparison.riskDiff}%`],
      ['Sharpe Ratio', `${risk.benchmarkComparison.portfolioSharpe}`, `${risk.benchmarkComparison.benchmarkSharpe}`, `${(risk.benchmarkComparison.portfolioSharpe - risk.benchmarkComparison.benchmarkSharpe).toFixed(2)}`],
    ],
    margin: { left: margin, right: margin },
    theme: 'grid',
    headStyles: { fillColor: C.dark, textColor: C.white, fontSize: 9, fontStyle: 'bold' },
    bodyStyles: { fontSize: 9, textColor: C.text },
  })

  y = (doc as any).lastAutoTable.finalY + 6
  checkSpace(12)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'italic')
  doc.setTextColor(...C.muted)
  const vLines = doc.splitTextToSize(risk.benchmarkComparison.verdict, cw)
  doc.text(vLines, margin, y)
  y += vLines.length * 4 + 4

  // Top risk contributors
  checkSpace(30)
  sectionTitle('Top Risk Contributors')

  autoTable(doc, {
    startY: y,
    head: [['Rank', 'Asset', 'Type', 'Weight', 'Risk Contribution']],
    body: risk.topRiskContributors.map((c, i) => [
      `#${i + 1}`,
      c.assetName,
      ASSET_TYPE_LABELS[c.type] || c.type,
      `${c.portfolioWeight}%`,
      `${c.riskContribution}%`,
    ]),
    margin: { left: margin, right: margin },
    theme: 'striped',
    headStyles: { fillColor: C.dark, textColor: C.white, fontSize: 9, fontStyle: 'bold' },
    bodyStyles: { fontSize: 9, textColor: C.text },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  })

  y = (doc as any).lastAutoTable.finalY + 12

  // ────────────────────────────────────
  // PAGE 4: Exposure Analysis
  // ────────────────────────────────────
  newPage()

  sectionTitle('Sector Exposure')

  const sectorData = Object.entries(sectorAlloc).sort(([,a], [,b]) => b - a)
  sectorData.forEach(([sector, val]) => {
    checkSpace(10)
    const lbl = (SECTOR_LABELS as Record<string, string>)[sector] || sector
    const pct = totalValue > 0 ? (val / totalValue * 100) : 0
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...C.text)
    doc.text(lbl, margin, y)
    drawProgressBar(margin + 50, y - 3, 80, pct, C.brand)
    doc.setFont('helvetica', 'bold')
    doc.text(`${pct.toFixed(1)}%`, margin + 135, y)
    y += 7
  })

  y += 6
  sectionTitle('Geographic Exposure')

  const countryData = Object.entries(countryAlloc).sort(([,a], [,b]) => b - a)
  countryData.forEach(([country, val]) => {
    checkSpace(10)
    const pct = totalValue > 0 ? (val / totalValue * 100) : 0
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...C.text)
    doc.text(country, margin, y)
    drawProgressBar(margin + 50, y - 3, 80, pct, [6, 182, 212])
    doc.setFont('helvetica', 'bold')
    doc.text(`${pct.toFixed(1)}%`, margin + 135, y)
    y += 7
  })

  y += 6
  sectionTitle('Asset Type Breakdown')

  const typeData = Object.entries(typeAlloc).sort(([,a], [,b]) => b - a)
  typeData.forEach(([type, val]) => {
    checkSpace(10)
    const lbl = (ASSET_TYPE_LABELS as Record<string, string>)[type] || type
    const pct = totalValue > 0 ? (val / totalValue * 100) : 0
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...C.text)
    doc.text(lbl, margin, y)
    drawProgressBar(margin + 50, y - 3, 80, pct, [139, 92, 246])
    doc.setFont('helvetica', 'bold')
    doc.text(`${pct.toFixed(1)}%`, margin + 135, y)
    y += 7
  })

  // ────────────────────────────────────
  // PAGE 5: Stress Testing
  // ────────────────────────────────────
  newPage()

  sectionTitle('Stress Test Scenarios')

  bodyText('These scenarios model how your portfolio might react to different economic events, based on historical asset-class behavior and your current allocation.')
  y += 4

  autoTable(doc, {
    startY: y,
    head: [['Scenario', 'Severity', 'Impact %', 'Impact $']],
    body: risk.scenarioAnalysis.map(s => [
      s.name,
      severityLabel(s.severity),
      `${s.impactPercent >= 0 ? '+' : ''}${s.impactPercent}%`,
      `${s.impactAmount >= 0 ? '+' : '-'}${fmt(s.impactAmount)}`,
    ]),
    margin: { left: margin, right: margin },
    theme: 'striped',
    headStyles: { fillColor: C.dark, textColor: C.white, fontSize: 9, fontStyle: 'bold' },
    bodyStyles: { fontSize: 9, textColor: C.text },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    didParseCell: (data: any) => {
      if (data.section === 'body' && data.column.index === 2) {
        const val = parseFloat(data.cell.raw)
        data.cell.styles.textColor = val >= 0 ? C.success : C.error
        data.cell.styles.fontStyle = 'bold'
      }
    },
  })

  y = (doc as any).lastAutoTable.finalY + 14

  risk.scenarioAnalysis.forEach(s => {
    checkSpace(24)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...C.dark)
    doc.text(s.name, margin, y)

    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    const sevColor = s.severity === 'extreme' ? C.error : s.severity === 'severe' ? C.error : s.severity === 'moderate' ? C.warning : C.success
    doc.setTextColor(...sevColor)
    doc.text(severityLabel(s.severity).toUpperCase(), margin + 80, y)
    y += 5

    doc.setFontSize(9)
    doc.setTextColor(...C.muted)
    doc.text(s.description, margin, y)
    y += 5

    drawProgressBar(margin, y, 100, Math.min(Math.abs(s.impactPercent), 100), s.impactPercent >= 0 ? C.success : C.error)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...(s.impactPercent >= 0 ? C.success : C.error))
    doc.text(`${s.impactPercent >= 0 ? '+' : ''}${s.impactPercent}% (${s.impactAmount >= 0 ? '+' : '-'}${fmt(s.impactAmount)})`, margin + 105, y + 1)
    y += 10
  })

  // ────────────────────────────────────
  // PAGE 6: Recommendations
  // ────────────────────────────────────
  newPage()

  sectionTitle('Rebalancing Recommendations')

  if (risk.rebalancingSuggestions.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [['Action', 'Asset Type', 'Current %', 'Target %', 'Reason', 'Priority']],
      body: risk.rebalancingSuggestions.map(s => [
        s.action.toUpperCase(),
        s.assetType,
        `${s.currentPercent}%`,
        `${s.targetPercent}%`,
        s.reason,
        s.priority.charAt(0).toUpperCase() + s.priority.slice(1),
      ]),
      margin: { left: margin, right: margin },
      theme: 'striped',
      headStyles: { fillColor: C.dark, textColor: C.white, fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8, textColor: C.text },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: { 0: { cellWidth: 16, fontStyle: 'bold' }, 4: { cellWidth: 50 } },
      didParseCell: (data: any) => {
        if (data.section === 'body' && data.column.index === 0) {
          const action = (data.cell.raw as string).toLowerCase()
          data.cell.styles.textColor = action === 'buy' ? C.success : action === 'sell' ? C.error : C.brand
        }
      },
    })
    y = (doc as any).lastAutoTable.finalY + 12
  } else {
    bodyText('No rebalancing suggestions at this time. Your portfolio is well-balanced.')
    y += 8
  }

  if (risk.concentrationWarnings.length > 0) {
    checkSpace(20)
    sectionTitle('Concentration Warnings')

    risk.concentrationWarnings.forEach(w => {
      checkSpace(10)
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...(w.type === 'high' ? C.error : C.warning))
      doc.text(`[${w.type.toUpperCase()}]`, margin, y)
      doc.setTextColor(...C.text)
      doc.text(w.message, margin + 18, y)
      y += 6
    })
    y += 4
  }

  checkSpace(30)
  sectionTitle('Liquidity Analysis')

  const liqLabels: Record<string, string> = {
    immediate: 'Immediate (0-1 day)', short_term: 'Short-term (1-7 days)',
    medium_term: 'Medium-term (1-4 weeks)', long_term: 'Long-term (1+ months)',
  }

  Object.entries(risk.liquidityBreakdown).filter(([,v]) => v > 0).sort(([,a],[,b]) => b - a).forEach(([cat, pct]) => {
    checkSpace(10)
    const lbl = liqLabels[cat] || cat
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...C.text)
    doc.text(lbl, margin, y)
    drawProgressBar(margin + 55, y - 3, 70, pct, cat === 'immediate' ? C.success : cat === 'short_term' ? [6, 182, 212] : cat === 'medium_term' ? C.warning : C.error)
    doc.setFont('helvetica', 'bold')
    doc.text(`${pct.toFixed(1)}%`, margin + 130, y)
    y += 7
  })

  // ────────────────────────────────────
  // AI Document Insights (when available)
  // ────────────────────────────────────
  if (documentInsights && documentInsights.length > 0) {
    checkSpace(30)
    newPage()
    sectionTitle('AI Document Insights')

    bodyText('The following insights were generated by AI analysis of your uploaded documents (tax files, financial statements, etc.) and may inform your risk assessment.')
    y += 6

    documentInsights.forEach((insight) => {
      checkSpace(35)
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...C.dark)
      doc.text(insight.documentName, margin, y)
      y += 6

      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...C.text)
      const summaryLines = doc.splitTextToSize(insight.summary, cw)
      doc.text(summaryLines, margin, y)
      y += summaryLines.length * 4 + 4

      if (insight.riskRelevantPoints.length > 0) {
        doc.setFontSize(8)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(...C.warning)
        doc.text('Risk-relevant points:', margin, y)
        y += 5
        insight.riskRelevantPoints.slice(0, 5).forEach((pt) => {
          checkSpace(8)
          doc.setFont('helvetica', 'normal')
          doc.setTextColor(...C.text)
          const lines = doc.splitTextToSize(`• ${pt}`, cw - 4)
          doc.text(lines, margin + 4, y)
          y += lines.length * 3.5 + 2
        })
        y += 2
      }

      if (insight.recommendations.length > 0) {
        doc.setFontSize(8)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(...C.success)
        doc.text('Recommendations:', margin, y)
        y += 5
        insight.recommendations.slice(0, 3).forEach((rec) => {
          checkSpace(8)
          doc.setFont('helvetica', 'normal')
          doc.setTextColor(...C.text)
          const lines = doc.splitTextToSize(`• ${rec}`, cw - 4)
          doc.text(lines, margin + 4, y)
          y += lines.length * 3.5 + 2
        })
        y += 4
      }
    })
  }

  // ────────────────────────────────────
  // PAGE 7: Methodology & Disclaimers
  // ────────────────────────────────────
  newPage()

  // Logo at top of methodology page
  if (logoData) {
    try {
      doc.addImage(logoData, 'PNG', pw / 2 - 15, y, 30, 30)
      y += 34
    } catch { /* ignore */ }
  }

  sectionTitle('Methodology')

  const methodBlocks = [
    ['Risk Score', 'Calculated using a base score of 50 adjusted by asset-type risk weights, concentration penalties, and diversification bonuses. Ranges from 0 (lowest risk) to 100 (highest risk).'],
    ['Volatility', 'Weighted-average annualized volatility using historical asset-class volatility figures. Daily volatility derived using √252 trading days.'],
    ['Sharpe Ratio', 'Excess return (portfolio return minus 5% risk-free rate) divided by annualized volatility. Measures risk-adjusted return quality.'],
    ['Maximum Drawdown', 'Estimated worst-case loss based on weighted-average historical maximum drawdowns for each asset class.'],
    ['Concentration (HHI)', 'Herfindahl-Hirschman Index calculated from asset-type allocation percentages. Values closer to 0 indicate diversification; values closer to 1 indicate concentration.'],
    ['Scenario Analysis', 'Applies historical scenario-specific impact multipliers per asset type to calculate potential portfolio impact under various economic conditions.'],
    ['Benchmark', 'Compared against S&P 500 historical averages: 10% annual return, 16% annual volatility, 0.5 Sharpe ratio.'],
  ]

  methodBlocks.forEach(([title, desc]) => {
    checkSpace(20)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...C.dark)
    doc.text(title as string, margin, y)
    y += 5
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...C.muted)
    const lines = doc.splitTextToSize(desc as string, cw)
    doc.text(lines, margin, y)
    y += lines.length * 3.5 + 4
  })

  y += 8
  sectionTitle('Disclaimers')

  const disclaimers = [
    'This report is generated for informational purposes only and does not constitute financial, investment, or tax advice.',
    'Past performance is not indicative of future results. All metrics are based on historical data and simplified models.',
    'Risk metrics are estimates based on asset-class averages and may not reflect the actual risk profile of individual securities.',
    'You should consult a qualified financial advisor before making any investment decisions based on this report.',
    `Report generated on ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} by FinoCurve Desktop.`,
  ]

  disclaimers.forEach(d => {
    checkSpace(14)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...C.muted)
    const lines = doc.splitTextToSize(`• ${d}`, cw)
    doc.text(lines, margin, y)
    y += lines.length * 3.5 + 2
  })

  // ── Save or return ──
  const dateStr = new Date().toISOString().slice(0, 10)
  if (opts.returnBlob) {
    const arr = doc.output('arraybuffer')
    return new Uint8Array(arr)
  }
  doc.save(`FinoCurve_Risk_Report_${dateStr}.pdf`)
}

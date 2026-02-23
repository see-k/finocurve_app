import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Shield, AlertTriangle, TrendingUp, TrendingDown,
  Droplets, BarChart3, Target, ArrowUpRight, ArrowDownRight,
  Layers, Globe, PieChart as PieIcon, RefreshCw, Info, FileDown, MapPin, CloudUpload, HardDrive,
  ChevronDown, ChevronUp, BookOpen, History, BarChart2, X, FileText, FolderOpen, ExternalLink, Cloud,
} from 'lucide-react'
import {
  PieChart, Pie, Cell, ResponsiveContainer, AreaChart, Area,
  XAxis, YAxis, Tooltip, BarChart, Bar, RadarChart, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis, Radar, LineChart, Line, CartesianGrid,
} from 'recharts'
import GlassContainer from '../../components/glass/GlassContainer'
import GlassIconButton from '../../components/glass/GlassIconButton'
import { usePortfolio } from '../../store/usePortfolio'
import { getSharedDocumentInsights } from '../../store/useDocumentInsights'
import { useRiskSnapshots, computeChangeSummary, snapshotToMinimalRisk } from '../../store/useRiskSnapshots'
import { analyzePortfolio } from '../../services/riskAnalysis'
import { generateRiskReportPdf } from '../../services/riskReportPdf'
import WorldMap from '../../components/WorldMap'
import type { RiskAnalysisResult, Asset, ScenarioSeverity, SuggestionPriority, RiskSnapshot } from '../../types'
import {
  assetCurrentValue, SECTOR_LABELS, ASSET_TYPE_LABELS, isLoan,
} from '../../types'
import { RISK_LEVEL_META } from '../../constants/riskMeta'
import './DetailScreen.css'
import './RiskAnalysisScreen.css'

const DOCUMENTS_PREFIX = 'finocurve/documents/'
const REPORTS_PREFIX = 'finocurve/reports/'

interface LoadedAnalysis {
  source: 'saved' | 'snapshot'
  generatedAt: string
  risk: RiskAnalysisResult
  assets: Asset[]
  totalValue: number
  totalGainLossPercent: number
  portfolioName: string
  sectorAlloc: Record<string, number>
  countryAlloc: Record<string, number>
  typeAlloc: Record<string, number>
  advancedAnalysis?: { sections: { title: string; content: string }[] }
}
const RISK_BG = 'https://images.unsplash.com/photo-1515266591878-f93e32bc5937?q=80&w=1287&auto=format&fit=crop'
const CHART_COLORS = ['#6366f1', '#8b5cf6', '#a78bfa', '#c084fc', '#06b6d4', '#14b8a6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#64748b', '#84cc16']

const VOL_LEVEL_META: Record<string, { color: string; label: string }> = {
  low: { color: '#10b981', label: 'Low' }, moderate: { color: '#6366f1', label: 'Moderate' },
  high: { color: '#f59e0b', label: 'High' }, very_high: { color: '#ef4444', label: 'Very High' },
}

const SHARPE_META: Record<string, { color: string; label: string; desc: string }> = {
  poor:          { color: '#ef4444', label: 'Poor',          desc: 'Returns do not justify the risk taken' },
  below_average: { color: '#f59e0b', label: 'Below Average', desc: 'Below market average risk-adjusted returns' },
  average:       { color: '#6366f1', label: 'Average',       desc: 'Market average risk-adjusted returns' },
  good:          { color: '#06b6d4', label: 'Good',          desc: 'Good risk-adjusted returns' },
  excellent:     { color: '#10b981', label: 'Excellent',     desc: 'Excellent risk-adjusted returns' },
}

const LIQ_LABEL: Record<string, string> = {
  immediate: 'Immediate (0-1 day)', short_term: 'Short-term (1-7 days)',
  medium_term: 'Medium-term (1-4 wks)', long_term: 'Long-term (1+ months)',
}
const LIQ_COLOR: Record<string, string> = { immediate: '#10b981', short_term: '#06b6d4', medium_term: '#f59e0b', long_term: '#ef4444' }

const SEVERITY_META: Record<ScenarioSeverity, { color: string; bg: string }> = {
  mild:     { color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  moderate: { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  severe:   { color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  extreme:  { color: '#dc2626', bg: 'rgba(220,38,38,0.15)' },
}

const PRIORITY_META: Record<SuggestionPriority, { color: string; bg: string }> = {
  high:   { color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  medium: { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  low:    { color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
}

const fmt = (n: number) => '$' + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function generateVolHistory(score: number) {
  const data = []
  let v = score
  for (let i = 0; i < 52; i++) {
    v += (Math.random() - 0.48) * 4
    v = Math.max(5, Math.min(50, v))
    data.push({ week: `W${i + 1}`, vol: +v.toFixed(1) })
  }
  return data
}

// Country code → emoji flag
const COUNTRY_TO_ISO2: Record<string, string> = {
  US: 'US', USA: 'US', 'United States': 'US', UK: 'GB', 'United Kingdom': 'GB', GB: 'GB',
  Germany: 'DE', DE: 'DE', France: 'FR', FR: 'FR', Japan: 'JP', JP: 'JP',
  China: 'CN', CN: 'CN', India: 'IN', IN: 'IN', Australia: 'AU', AU: 'AU',
  Canada: 'CA', CA: 'CA', Brazil: 'BR', BR: 'BR', 'South Korea': 'KR', KR: 'KR',
  Switzerland: 'CH', CH: 'CH', Netherlands: 'NL', NL: 'NL', Italy: 'IT', IT: 'IT',
  Spain: 'ES', ES: 'ES', Sweden: 'SE', SE: 'SE', Norway: 'NO', NO: 'NO',
  Denmark: 'DK', DK: 'DK', Finland: 'FI', FI: 'FI', Ireland: 'IE', IE: 'IE',
  Taiwan: 'TW', TW: 'TW', Singapore: 'SG', SG: 'SG', 'Hong Kong': 'HK', HK: 'HK',
  'New Zealand': 'NZ', NZ: 'NZ', 'South Africa': 'ZA', ZA: 'ZA', Mexico: 'MX', MX: 'MX',
  Argentina: 'AR', AR: 'AR', 'Saudi Arabia': 'SA', SA: 'SA', UAE: 'AE', AE: 'AE',
  Israel: 'IL', IL: 'IL', Russia: 'RU', RU: 'RU', Poland: 'PL', PL: 'PL',
  Belgium: 'BE', BE: 'BE', Austria: 'AT', AT: 'AT', Global: 'UN',
}

function countryFlag(name: string): string {
  const iso2 = COUNTRY_TO_ISO2[name] || COUNTRY_TO_ISO2[name.toUpperCase()]
  if (!iso2) return '🌍'
  return iso2.split('').map(c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)).join('')
}

const CONFIDENCE_META: Record<string, { color: string; label: string }> = {
  high:   { color: '#10b981', label: 'High confidence' },
  medium: { color: '#f59e0b', label: 'Medium confidence' },
  low:    { color: '#64748b', label: 'Low confidence' },
}

export default function RiskAnalysisScreen() {
  const navigate = useNavigate()
  const { portfolio, totalValue, totalGainLossPercent } = usePortfolio()
  const { snapshots, lastSnapshot, addSnapshot } = useRiskSnapshots()
  const hasAutoRecordedRef = useRef(false)
  const [visible, setVisible] = useState(false)
  const [tab, setTab] = useState<'overview' | 'volatility' | 'scenarios' | 'exposure' | 'history'>('overview')
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [savingToCloud, setSavingToCloud] = useState(false)
  const [cloudMessage, setCloudMessage] = useState<string | null>(null)
  const [s3Connected, setS3Connected] = useState<boolean | null>(null)
  const [localConnected, setLocalConnected] = useState<boolean | null>(null)
  const [savingToDevice, setSavingToDevice] = useState(false)
  const [selectedCountry, setSelectedCountry] = useState<{ name: string; pct: number } | null>(null)
  const [expandedExplainable, setExpandedExplainable] = useState<string | null>(null)
  const [advancedAnalysisModal, setAdvancedAnalysisModal] = useState(false)
  const [advancedAnalysisDocs, setAdvancedAnalysisDocs] = useState<{ key: string; fileName: string; source: 'cloud' | 'local' }[]>([])
  const [advancedAnalysisSelectedDoc, setAdvancedAnalysisSelectedDoc] = useState<string | null>(null)
  const [advancedAnalysisRunning, setAdvancedAnalysisRunning] = useState(false)
  const [advancedAnalysisProgress, setAdvancedAnalysisProgress] = useState(0)
  const advancedAnalysisCancelRef = useRef(false)
  const [advancedAnalysis, setAdvancedAnalysis] = useState<{ sections: { title: string; content: string }[] } | null>(null)
  const [loadReportModal, setLoadReportModal] = useState(false)
  const [savedReports, setSavedReports] = useState<{ key: string; fileName: string; source: 'cloud' | 'local'; lastModified?: string }[]>([])
  const [loadReportsLoading, setLoadReportsLoading] = useState(false)
  const [loadedAnalysis, setLoadedAnalysis] = useState<LoadedAnalysis | null>(null)

  useEffect(() => { requestAnimationFrame(() => setVisible(true)) }, [])

  useEffect(() => {
    window.electronAPI?.s3HasCredentials?.().then(setS3Connected).catch(() => setS3Connected(false))
    window.electronAPI?.localStorageHasPath?.().then(setLocalConnected).catch(() => setLocalConnected(false))
  }, [])

  const loadDocumentsForAdvancedAnalysis = useCallback(async () => {
    const docs: { key: string; fileName: string; source: 'cloud' | 'local' }[] = []
    if (s3Connected && window.electronAPI?.s3List) {
      const res = await window.electronAPI.s3List({ prefix: DOCUMENTS_PREFIX })
      docs.push(...res.items.map((i) => ({ key: i.key, fileName: i.key.split('/').pop() || i.key, source: 'cloud' as const })))
    }
    if (localConnected && window.electronAPI?.localStorageList) {
      const res = await window.electronAPI.localStorageList({ prefix: DOCUMENTS_PREFIX })
      docs.push(...res.items.map((i) => ({ key: i.key, fileName: i.key.split('/').pop() || i.key, source: 'local' as const })))
    }
    setAdvancedAnalysisDocs(docs)
  }, [s3Connected, localConnected])

  useEffect(() => {
    if (advancedAnalysisModal) loadDocumentsForAdvancedAnalysis()
  }, [advancedAnalysisModal, loadDocumentsForAdvancedAnalysis])

  const loadSavedReports = useCallback(async () => {
    const reports: { key: string; fileName: string; source: 'cloud' | 'local'; lastModified?: string }[] = []
    if (s3Connected && window.electronAPI?.s3List) {
      const res = await window.electronAPI.s3List({ prefix: REPORTS_PREFIX })
      reports.push(...res.items
        .filter((i) => i.key.toLowerCase().endsWith('.json'))
        .map((i) => ({ key: i.key, fileName: i.key.split('/').pop() || i.key, source: 'cloud' as const, lastModified: i.lastModified })))
    }
    if (localConnected && window.electronAPI?.localStorageList) {
      const res = await window.electronAPI.localStorageList({ prefix: REPORTS_PREFIX })
      reports.push(...res.items
        .filter((i) => i.key.toLowerCase().endsWith('.json'))
        .map((i) => ({ key: i.key, fileName: i.key.split('/').pop() || i.key, source: 'local' as const, lastModified: i.lastModified })))
    }
    reports.sort((a, b) => (b.lastModified || '').localeCompare(a.lastModified || ''))
    setSavedReports(reports)
  }, [s3Connected, localConnected])

  useEffect(() => {
    if (loadReportModal) {
      setLoadReportsLoading(true)
      loadSavedReports().finally(() => setLoadReportsLoading(false))
    }
  }, [loadReportModal, loadSavedReports])

  const handleOpenReportPdf = useCallback(async (jsonKey: string, source: 'cloud' | 'local') => {
    const pdfKey = jsonKey.replace(/\.json$/i, '.pdf')
    try {
      if (source === 'cloud' && window.electronAPI?.s3GetDownloadUrl) {
        const { url } = await window.electronAPI.s3GetDownloadUrl({ key: pdfKey })
        window.open(url, '_blank')
      } else if (source === 'local' && window.electronAPI?.localStorageOpenFile) {
        await window.electronAPI.localStorageOpenFile({ key: pdfKey })
      }
      setLoadReportModal(false)
    } catch (e) {
      setCloudMessage(e instanceof Error ? e.message : 'PDF not found. Save a report first.')
      setTimeout(() => setCloudMessage(null), 5000)
    }
  }, [])

  const handleLoadAnalysis = useCallback(async (item: { key: string; source: 'cloud' | 'local' }) => {
    setLoadReportsLoading(true)
    setCloudMessage(null)
    try {
      let jsonStr: string
      if (item.source === 'cloud' && window.electronAPI?.s3GetFileBuffer) {
        const { buffer } = await window.electronAPI.s3GetFileBuffer({ key: item.key })
        jsonStr = new TextDecoder().decode(new Uint8Array(buffer))
      } else if (item.source === 'local' && window.electronAPI?.localStorageReadFile) {
        const { base64 } = await window.electronAPI.localStorageReadFile({ key: item.key })
        jsonStr = atob(base64)
      } else {
        throw new Error('Cannot read file')
      }
      const data = JSON.parse(jsonStr) as LoadedAnalysis
      if (!data.risk || !data.assets || typeof data.totalValue !== 'number') throw new Error('Invalid analysis file')
      setLoadedAnalysis({
        ...data,
        source: 'saved',
        assets: Array.isArray(data.assets) ? data.assets : [],
      })
      setLoadReportModal(false)
    } catch (e) {
      setCloudMessage(e instanceof Error ? e.message : 'Failed to load analysis')
      setTimeout(() => setCloudMessage(null), 5000)
    } finally {
      setLoadReportsLoading(false)
    }
  }, [])

  const handleLoadFromSnapshot = useCallback((snapshot: RiskSnapshot) => {
    const risk = snapshotToMinimalRisk(snapshot)
    const typeAlloc: Record<string, number> = {}
    for (const [k, v] of Object.entries(snapshot.allocationByType)) {
      typeAlloc[k] = (v / 100) * snapshot.portfolioValue
    }
    setLoadedAnalysis({
      source: 'snapshot',
      generatedAt: snapshot.timestamp,
      risk,
      assets: [],
      totalValue: snapshot.portfolioValue,
      totalGainLossPercent: 0,
      portfolioName: 'Historical snapshot',
      sectorAlloc: {},
      countryAlloc: {},
      typeAlloc,
      advancedAnalysis: undefined,
    })
    setLoadReportModal(false)
  }, [])

  const assets: Asset[] = portfolio?.assets ?? []
  const investableAssets = useMemo(() => assets.filter((a) => !isLoan(a)), [assets])
  const totalInvestableValue = useMemo(
    () => investableAssets.reduce((s, a) => s + assetCurrentValue(a), 0),
    [investableAssets]
  )
  const totalInvestableCost = useMemo(
    () => investableAssets.reduce((s, a) => s + a.costBasis, 0),
    [investableAssets]
  )
  const totalInvestableGainLossPercent = useMemo(
    () => (totalInvestableCost > 0 ? ((totalInvestableValue - totalInvestableCost) / totalInvestableCost) * 100 : 0),
    [totalInvestableValue, totalInvestableCost]
  )
  const riskBase = useMemo(
    () => (investableAssets.length > 0 && totalInvestableValue > 0)
      ? analyzePortfolio(investableAssets, totalInvestableValue, totalInvestableGainLossPercent)
      : null,
    [investableAssets, totalInvestableValue, totalInvestableGainLossPercent]
  )
  const changeSummary = useMemo(
    () => riskBase ? computeChangeSummary(riskBase, investableAssets, totalInvestableValue, lastSnapshot) : [],
    [riskBase, investableAssets, totalInvestableValue, lastSnapshot]
  )
  const risk = useMemo(() => {
    if (!riskBase) return null
    return { ...riskBase, changeSummary: changeSummary.length > 0 ? changeSummary : undefined }
  }, [riskBase, changeSummary])

  // Auto-record snapshot on each visit to build history for graphs (once per page load)
  useEffect(() => {
    if (hasAutoRecordedRef.current || !risk || investableAssets.length === 0) return
    hasAutoRecordedRef.current = true
    addSnapshot(risk, investableAssets, totalInvestableValue)
  }, [risk, investableAssets, totalInvestableValue, addSnapshot])

  const sectorAlloc = useMemo(() => {
    const alloc: Record<string, number> = {}
    for (const a of investableAssets) {
      const key = a.sector || 'other'
      alloc[key] = (alloc[key] || 0) + assetCurrentValue(a)
    }
    return alloc
  }, [investableAssets])
  const countryAlloc = useMemo(() => {
    const alloc: Record<string, number> = {}
    for (const a of investableAssets) {
      const key = a.country || 'Unknown'
      alloc[key] = (alloc[key] || 0) + assetCurrentValue(a)
    }
    return alloc
  }, [investableAssets])
  const typeAlloc = useMemo(() => {
    const alloc: Record<string, number> = {}
    for (const a of investableAssets) {
      alloc[a.type] = (alloc[a.type] || 0) + assetCurrentValue(a)
    }
    return alloc
  }, [investableAssets])
  const countryPct = useMemo(() => {
    const result: Record<string, number> = {}
    if (totalInvestableValue > 0) {
      for (const [k, v] of Object.entries(countryAlloc)) {
        result[k] = (v / totalInvestableValue) * 100
      }
    }
    return result
  }, [countryAlloc, totalInvestableValue])

  // When viewing a loaded analysis, use that data instead of live
  const effectiveRisk = loadedAnalysis ? loadedAnalysis.risk : risk
  const effectiveInvestableAssets = loadedAnalysis ? loadedAnalysis.assets : investableAssets
  const effectiveTotalValue = loadedAnalysis ? loadedAnalysis.totalValue : totalInvestableValue
  const effectiveGainLossPercent = loadedAnalysis ? loadedAnalysis.totalGainLossPercent : totalInvestableGainLossPercent
  const effectiveSectorAlloc = loadedAnalysis ? loadedAnalysis.sectorAlloc : sectorAlloc
  const effectiveCountryAlloc = loadedAnalysis ? loadedAnalysis.countryAlloc : countryAlloc
  const effectiveTypeAlloc = loadedAnalysis ? loadedAnalysis.typeAlloc : typeAlloc
  const effectiveCountryPct = useMemo(() => {
    const result: Record<string, number> = {}
    if (effectiveTotalValue > 0) {
      for (const [k, v] of Object.entries(effectiveCountryAlloc)) {
        result[k] = (v / effectiveTotalValue) * 100
      }
    }
    return result
  }, [effectiveCountryAlloc, effectiveTotalValue])

  const volHistory = useMemo(() => effectiveRisk ? generateVolHistory(effectiveRisk.annualizedVolatility) : [], [effectiveRisk])

  const handleExportPdf = async () => {
    if (!effectiveRisk) return
    setGeneratingPdf(true)
    if (!loadedAnalysis) addSnapshot(effectiveRisk, effectiveInvestableAssets, effectiveTotalValue)
    try {
      await generateRiskReportPdf({
        risk: effectiveRisk, assets: effectiveInvestableAssets, totalValue: effectiveTotalValue, totalGainLossPercent: effectiveGainLossPercent,
        portfolioName: loadedAnalysis?.portfolioName ?? portfolio?.name ?? 'My Portfolio',
        sectorAlloc: effectiveSectorAlloc, countryAlloc: effectiveCountryAlloc, typeAlloc: effectiveTypeAlloc,
        documentInsights: getSharedDocumentInsights(),
        advancedAnalysis: (loadedAnalysis?.advancedAnalysis ?? advancedAnalysis) ?? undefined,
      })
    } finally {
      setGeneratingPdf(false)
    }
  }

  const handleSaveToCloud = async () => {
    if (!effectiveRisk || !window.electronAPI?.s3Upload) return
    if (!loadedAnalysis && portfolio) addSnapshot(effectiveRisk, effectiveInvestableAssets, effectiveTotalValue)
    setCloudMessage(null)
    setSavingToCloud(true)
    try {
      const pdfBytes = await generateRiskReportPdf({
        risk: effectiveRisk, assets: effectiveInvestableAssets, totalValue: effectiveTotalValue, totalGainLossPercent: effectiveGainLossPercent,
        portfolioName: loadedAnalysis?.portfolioName ?? portfolio?.name ?? 'My Portfolio',
        sectorAlloc: effectiveSectorAlloc, countryAlloc: effectiveCountryAlloc, typeAlloc: effectiveTypeAlloc,
        documentInsights: getSharedDocumentInsights(),
        advancedAnalysis: (loadedAnalysis?.advancedAnalysis ?? advancedAnalysis) ?? undefined,
        returnBlob: true,
      })
      if (!pdfBytes) throw new Error('Failed to generate PDF')
      const dateStr = new Date().toISOString().slice(0, 10)
      const pdfKey = `finocurve/reports/FinoCurve_Risk_Report_${dateStr}.pdf`
      await window.electronAPI.s3Upload({
        key: pdfKey,
        buffer: Array.from(pdfBytes),
        contentType: 'application/pdf',
      })
      const analysisJson: LoadedAnalysis = {
        source: 'saved',
        generatedAt: new Date().toISOString(),
        risk: effectiveRisk,
        assets: effectiveInvestableAssets,
        totalValue: effectiveTotalValue,
        totalGainLossPercent: effectiveGainLossPercent,
        portfolioName: loadedAnalysis?.portfolioName ?? portfolio?.name ?? 'My Portfolio',
        sectorAlloc: effectiveSectorAlloc,
        countryAlloc: effectiveCountryAlloc,
        typeAlloc: effectiveTypeAlloc,
        advancedAnalysis: (loadedAnalysis?.advancedAnalysis ?? advancedAnalysis) ?? undefined,
      }
      const jsonKey = `finocurve/reports/FinoCurve_Risk_Report_${dateStr}.json`
      await window.electronAPI.s3Upload({
        key: jsonKey,
        buffer: Array.from(new TextEncoder().encode(JSON.stringify(analysisJson))),
        contentType: 'application/json',
      })
      setCloudMessage('Report saved to cloud')
      setTimeout(() => setCloudMessage(null), 4000)
    } catch (e) {
      setCloudMessage(e instanceof Error ? e.message : 'Failed to save to cloud')
    } finally {
      setSavingToCloud(false)
    }
  }

  const handleSaveToDevice = async () => {
    if (!effectiveRisk || !window.electronAPI?.localStorageSaveFile) return
    if (!loadedAnalysis && portfolio) addSnapshot(effectiveRisk, effectiveInvestableAssets, effectiveTotalValue)
    setCloudMessage(null)
    setSavingToDevice(true)
    try {
      const pdfBytes = await generateRiskReportPdf({
        risk: effectiveRisk, assets: effectiveInvestableAssets, totalValue: effectiveTotalValue, totalGainLossPercent: effectiveGainLossPercent,
        portfolioName: loadedAnalysis?.portfolioName ?? portfolio?.name ?? 'My Portfolio',
        sectorAlloc: effectiveSectorAlloc, countryAlloc: effectiveCountryAlloc, typeAlloc: effectiveTypeAlloc,
        documentInsights: getSharedDocumentInsights(),
        advancedAnalysis: (loadedAnalysis?.advancedAnalysis ?? advancedAnalysis) ?? undefined,
        returnBlob: true,
      })
      if (!pdfBytes) throw new Error('Failed to generate PDF')
      const dateStr = new Date().toISOString().slice(0, 10)
      const pdfKey = `finocurve/reports/FinoCurve_Risk_Report_${dateStr}.pdf`
      await window.electronAPI.localStorageSaveFile({
        key: pdfKey,
        buffer: Array.from(pdfBytes),
      })
      const analysisJson: LoadedAnalysis = {
        source: 'saved',
        generatedAt: new Date().toISOString(),
        risk: effectiveRisk,
        assets: effectiveInvestableAssets,
        totalValue: effectiveTotalValue,
        totalGainLossPercent: effectiveGainLossPercent,
        portfolioName: loadedAnalysis?.portfolioName ?? portfolio?.name ?? 'My Portfolio',
        sectorAlloc: effectiveSectorAlloc,
        countryAlloc: effectiveCountryAlloc,
        typeAlloc: effectiveTypeAlloc,
        advancedAnalysis: (loadedAnalysis?.advancedAnalysis ?? advancedAnalysis) ?? undefined,
      }
      const jsonKey = `finocurve/reports/FinoCurve_Risk_Report_${dateStr}.json`
      await window.electronAPI.localStorageSaveFile({
        key: jsonKey,
        buffer: Array.from(new TextEncoder().encode(JSON.stringify(analysisJson))),
      })
      setCloudMessage('Report saved to device')
      setTimeout(() => setCloudMessage(null), 4000)
    } catch (e) {
      setCloudMessage(e instanceof Error ? e.message : 'Failed to save to device')
    } finally {
      setSavingToDevice(false)
    }
  }

  const pieData = (alloc: Record<string, number>, labels: Record<string, string>) =>
    Object.entries(alloc).filter(([, v]) => v > 0).map(([k, v]) => ({ name: labels[k as keyof typeof labels] || k, value: +v.toFixed(2) })).sort((a, b) => b.value - a.value)

  // Radar data for overview
  const radarData = effectiveRisk ? [
    { metric: 'Diversification', value: effectiveRisk.diversificationScore },
    { metric: 'Liquidity', value: effectiveRisk.liquidityScore },
    { metric: 'Stability', value: Math.max(0, 100 - effectiveRisk.annualizedVolatility * 2) },
    { metric: 'Risk-Adj Return', value: Math.max(0, Math.min(100, (effectiveRisk.sharpeRatio + 1) * 25)) },
    { metric: 'Concentration', value: Math.max(0, 100 - effectiveRisk.concentrationIndex * 100) },
  ] : []

  const rlm = effectiveRisk ? RISK_LEVEL_META[effectiveRisk.riskLevel] : null

  const runAdvancedAnalysis = useCallback(async () => {
    if (!effectiveRisk || !window.electronAPI?.aiGenerateAdvancedAnalysis || !window.electronAPI?.aiCheckConnection) return
    const check = await window.electronAPI.aiCheckConnection()
    if (!check.ok) {
      setCloudMessage('Advanced analysis requires an AI provider configured in Settings.')
      setTimeout(() => setCloudMessage(null), 5000)
      return
    }
    setAdvancedAnalysisRunning(true)
    setAdvancedAnalysisProgress(0)
    advancedAnalysisCancelRef.current = false
    const progressInterval = setInterval(() => {
      setAdvancedAnalysisProgress((p) => (p >= 90 ? p : p + Math.random() * 8 + 2))
    }, 800)
    const selectedDoc = advancedAnalysisSelectedDoc
      ? advancedAnalysisDocs.find((d) => d.key === advancedAnalysisSelectedDoc)
      : undefined
    const riskSummary = `Risk Score: ${effectiveRisk.riskScore} (${effectiveRisk.riskLevel}). Sharpe: ${effectiveRisk.sharpeRatio}. Volatility: ${effectiveRisk.annualizedVolatility}%. Max Drawdown: ${effectiveRisk.maxDrawdownPercent}%. Diversification: ${effectiveRisk.diversificationScore}. Liquidity: ${effectiveRisk.liquidityScore}. Top contributors: ${effectiveRisk.topRiskContributors.slice(0, 3).map((c) => `${c.assetName} ${c.riskContribution}%`).join(', ')}. Rebalancing: ${effectiveRisk.rebalancingSuggestions.slice(0, 2).map((s) => `${s.action} ${s.assetType}`).join('; ')}.`
    const portfolioSummary = `Portfolio: ${loadedAnalysis?.portfolioName ?? portfolio?.name ?? 'Portfolio'}, $${effectiveTotalValue.toLocaleString()}, ${effectiveInvestableAssets.length} holdings. Gain/Loss: ${effectiveGainLossPercent.toFixed(1)}%. Assets: ${effectiveInvestableAssets.slice(0, 5).map((a) => `${a.name} (${a.type})`).join(', ')}.`
    try {
      const result = await window.electronAPI.aiGenerateAdvancedAnalysis({
        riskSummary,
        portfolioSummary,
        document: selectedDoc,
      })
      if (!advancedAnalysisCancelRef.current) {
        setAdvancedAnalysis(result)
        setAdvancedAnalysisModal(false)
        setCloudMessage('Advanced analysis complete. It will be included in your next report.')
        setTimeout(() => setCloudMessage(null), 4000)
      }
    } catch (e) {
      if (!advancedAnalysisCancelRef.current) {
        setCloudMessage(e instanceof Error ? e.message : 'Analysis failed')
        setTimeout(() => setCloudMessage(null), 5000)
      }
    } finally {
      clearInterval(progressInterval)
      setAdvancedAnalysisProgress(100)
      setAdvancedAnalysisRunning(false)
    }
  }, [effectiveRisk, loadedAnalysis, portfolio, effectiveTotalValue, effectiveGainLossPercent, effectiveInvestableAssets, advancedAnalysisSelectedDoc, advancedAnalysisDocs])

  if (!effectiveRisk) {
    return (
      <div className="risk-page">
        <div className="risk-bg">
          <img src={RISK_BG} alt="" className="risk-bg__img" />
          <div className="risk-bg__overlay" />
        </div>
        <div className="risk-page__inner risk-page__inner--visible">
        <div className="risk-page__header">
          <GlassIconButton icon={<ArrowLeft size={20} />} onClick={() => navigate(-1)} size={44} />
          <h1 className="risk-page__title"><Shield size={22} /> Risk Analysis</h1>
        </div>
        <GlassContainer padding="48px" borderRadius={20} className="risk-empty">
          <Shield size={48} style={{ color: 'var(--text-tertiary)' }} />
          <h2>No Portfolio Data</h2>
          <p>Add assets to see a comprehensive risk analysis.</p>
        </GlassContainer>
        </div>
      </div>
    )
  }

  return (
    <div className="risk-page">
      <div className="risk-bg">
        <img src={RISK_BG} alt="" className="risk-bg__img" />
        <div className="risk-bg__overlay" />
      </div>
      <div className={`risk-page__inner ${visible ? 'risk-page__inner--visible' : ''}`}>
        {/* Header */}
        <div className="risk-page__header">
          <GlassIconButton icon={<ArrowLeft size={20} />} onClick={() => navigate(-1)} size={44} />
          <h1 className="risk-page__title"><Shield size={22} /> Risk Analysis</h1>
          <div className="risk-page__header-right">
            {s3Connected && (
              <GlassIconButton
                icon={savingToCloud ? <RefreshCw size={18} className="spin" /> : <CloudUpload size={18} />}
                onClick={handleSaveToCloud}
                size={40}
                title={savingToCloud ? 'Saving...' : 'Save to cloud'}
                disabled={savingToCloud}
              />
            )}
            {localConnected && (
              <GlassIconButton
                icon={savingToDevice ? <RefreshCw size={18} className="spin" /> : <HardDrive size={18} />}
                onClick={handleSaveToDevice}
                size={40}
                title={savingToDevice ? 'Saving...' : 'Save to device'}
                disabled={savingToDevice}
              />
            )}
            <GlassIconButton
              icon={generatingPdf ? <RefreshCw size={18} className="spin" /> : <FileDown size={18} />}
              onClick={handleExportPdf}
              size={40}
              title={generatingPdf ? 'Generating...' : 'Export PDF'}
              disabled={generatingPdf}
            />
            <GlassIconButton
              icon={<BarChart2 size={18} />}
              onClick={() => setAdvancedAnalysisModal(true)}
              size={40}
              title="Advanced Analysis"
              disabled={advancedAnalysisRunning}
            />
            <GlassIconButton
              icon={<FolderOpen size={18} />}
              onClick={() => setLoadReportModal(true)}
              size={40}
              title="Load previous report"
            />
          </div>
        </div>

        {/* Load Report Modal - rendered via portal to avoid transform/scroll containment */}
        {loadReportModal && createPortal(
          <div className="risk-advanced-modal-overlay" onClick={() => setLoadReportModal(false)}>
            <div className="risk-advanced-modal risk-load-report-modal" onClick={(e) => e.stopPropagation()}>
              <div className="risk-advanced-modal__header">
                <FolderOpen size={20} />
                <h3>Previous Reports</h3>
                <button type="button" className="risk-advanced-modal__close" onClick={() => setLoadReportModal(false)} aria-label="Close">
                  <X size={18} />
                </button>
              </div>
              <p className="risk-advanced-modal__desc">Load a saved analysis into the UI or view from history.</p>
              <div className="risk-load-report-list">
                {loadReportsLoading ? (
                  <p className="risk-load-report-loading">Loading...</p>
                ) : (
                  <>
                    {savedReports.length > 0 && (
                      <div className="risk-load-report-section">
                        <div className="risk-load-report-section__title">Saved reports</div>
                        {savedReports.map((r) => (
                          <div key={`${r.source}-${r.key}`} className="risk-load-report-row">
                            <div className="risk-load-report-row__info">
                              <FileText size={16} className="risk-load-report-row__icon" />
                              <div>
                                <span className="risk-load-report-row__name">{r.fileName.replace(/\.json$/i, '')}</span>
                                <span className="risk-load-report-row__meta">
                                  {r.source === 'cloud' ? <Cloud size={12} /> : <HardDrive size={12} />}
                                  {r.source} · {r.lastModified ? new Date(r.lastModified).toLocaleDateString() : ''}
                                </span>
                              </div>
                            </div>
                            <div className="risk-load-report-row__actions">
                              <button type="button" className="risk-load-report-row__load" onClick={() => handleLoadAnalysis(r)} title="Load into UI">Load</button>
                              <button type="button" className="risk-load-report-row__open" onClick={() => handleOpenReportPdf(r.key, r.source)} title="Open PDF"><ExternalLink size={14} /></button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {snapshots.length > 0 && (
                      <div className="risk-load-report-section">
                        <div className="risk-load-report-section__title">From history</div>
                        {snapshots.slice(0, 10).map((s) => (
                          <div key={s.id} className="risk-load-report-row">
                            <div className="risk-load-report-row__info">
                              <History size={16} className="risk-load-report-row__icon" />
                              <div>
                                <span className="risk-load-report-row__name">Risk {s.riskScore} · {s.assetCount} assets</span>
                                <span className="risk-load-report-row__meta">{new Date(s.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                              </div>
                            </div>
                            <button type="button" className="risk-load-report-row__load" onClick={() => handleLoadFromSnapshot(s)} title="View snapshot">View</button>
                          </div>
                        ))}
                      </div>
                    )}
                    {savedReports.length === 0 && snapshots.length === 0 && (
                      <p className="risk-load-report-empty">No saved reports or history. Save a report to cloud or device, or visit this page to build history.</p>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}

        {/* Advanced Analysis Modal - rendered via portal to avoid transform/scroll containment */}
        {advancedAnalysisModal && !advancedAnalysisRunning && createPortal(
          <div className="risk-advanced-modal-overlay" onClick={() => setAdvancedAnalysisModal(false)}>
            <div className="risk-advanced-modal" onClick={(e) => e.stopPropagation()}>
              <div className="risk-advanced-modal__header">
                <BarChart2 size={20} />
                <h3>Advanced Analysis</h3>
                <button type="button" className="risk-advanced-modal__close" onClick={() => setAdvancedAnalysisModal(false)} aria-label="Close">
                  <X size={18} />
                </button>
              </div>
              <p className="risk-advanced-modal__desc">Add professional analysis across your risk report. Optionally include a document for context.</p>
              <div className="risk-advanced-modal__doc">
                <label>Include document (optional)</label>
                <select
                  value={advancedAnalysisSelectedDoc || ''}
                  onChange={(e) => setAdvancedAnalysisSelectedDoc(e.target.value || null)}
                  className="risk-advanced-modal__select"
                >
                  <option value="">No document</option>
                  {advancedAnalysisDocs.map((d) => (
                    <option key={d.key} value={d.key}>{d.fileName} ({d.source})</option>
                  ))}
                </select>
              </div>
              <div className="risk-advanced-modal__actions">
                <button type="button" className="risk-advanced-modal__cancel" onClick={() => setAdvancedAnalysisModal(false)}>Cancel</button>
                <button type="button" className="risk-advanced-modal__begin" onClick={runAdvancedAnalysis}>
                  Begin Analysis
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

        {/* Advanced Analysis Progress Overlay - rendered via portal to avoid transform/scroll containment */}
        {advancedAnalysisRunning && createPortal(
          <div className="risk-advanced-progress-overlay">
            <div className="risk-advanced-progress">
              <BarChart2 size={24} />
              <h4>Preparing analysis</h4>
              <div className="risk-advanced-progress__bar">
                <div className="risk-advanced-progress__fill" style={{ width: `${Math.min(100, advancedAnalysisProgress)}%` }} />
              </div>
              <button type="button" className="risk-advanced-progress__cancel" onClick={() => { advancedAnalysisCancelRef.current = true; setAdvancedAnalysisRunning(false); setAdvancedAnalysisModal(false); }}>
                Cancel
              </button>
            </div>
          </div>,
          document.body
        )}

        {loadedAnalysis && (
          <div className="risk-loaded-banner">
            <History size={16} />
            <span>Viewing {loadedAnalysis.source === 'snapshot' ? 'snapshot from' : 'report from'} {new Date(loadedAnalysis.generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
            <button type="button" className="risk-loaded-banner__close" onClick={() => setLoadedAnalysis(null)}>Back to current</button>
          </div>
        )}

        {cloudMessage && (
          <p style={{ fontSize: 13, marginTop: 8, marginBottom: -4, color: cloudMessage.startsWith('Report') ? 'var(--status-success)' : 'var(--status-error)' }}>
            {cloudMessage}
          </p>
        )}

        {/* Risk Score Hero */}
        <GlassContainer padding="32px" borderRadius={20} className="risk-hero">
          <div className="risk-hero__ring">
            <svg width="180" height="180" viewBox="0 0 180 180">
              <circle cx="90" cy="90" r="76" fill="none" stroke="var(--glass-border)" strokeWidth="10" />
              <circle cx="90" cy="90" r="76" fill="none" stroke={rlm!.color} strokeWidth="10" strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 76} strokeDashoffset={2 * Math.PI * 76 * (1 - effectiveRisk.riskScore / 100)}
                transform="rotate(-90 90 90)" style={{ transition: 'stroke-dashoffset 1.2s ease' }} />
            </svg>
            <div className="risk-hero__score">{effectiveRisk.riskScore}</div>
          </div>
          <div className="risk-hero__info">
            <span className="risk-hero__badge" style={{ background: rlm!.color }}>{rlm!.label}</span>
            <p className="risk-hero__desc">{rlm!.desc}</p>
            <div className="risk-hero__mini-stats">
              <div><span>Sharpe</span><strong>{effectiveRisk.sharpeRatio}</strong></div>
              <div><span>Volatility</span><strong>{effectiveRisk.annualizedVolatility}%</strong></div>
              <div><span>Max DD</span><strong>-{effectiveRisk.maxDrawdownPercent}%</strong></div>
            </div>
          </div>
        </GlassContainer>

        {/* Tabs */}
        <div className="risk-tabs">
          {(['overview', 'volatility', 'scenarios', 'exposure', 'history'] as const).map(t => (
            <button key={t} className={`risk-tab ${tab === t ? 'risk-tab--active' : ''}`} onClick={() => setTab(t)}>
              {t === 'overview' && <BarChart3 size={15} />}
              {t === 'volatility' && <TrendingUp size={15} />}
              {t === 'scenarios' && <AlertTriangle size={15} />}
              {t === 'exposure' && <Globe size={15} />}
              {t === 'history' && <History size={15} />}
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* ═══════ OVERVIEW TAB ═══════ */}
        {tab === 'overview' && (
          <div className="risk-tab-content">
            {/* Info banner */}
            <div className="risk-info-banner">
              <Info size={16} />
              <span>Risk metrics are calculated based on asset-class historical data and your portfolio composition. They are indicative and not investment advice.</span>
            </div>

            {/* Advanced Analysis (when available) */}
            {((loadedAnalysis?.advancedAnalysis ?? advancedAnalysis)?.sections?.length ?? 0) > 0 && (
              <GlassContainer padding="20px" borderRadius={16} className="risk-change-banner risk-advanced-display">
                <h3 className="risk-section-title"><BarChart2 size={16} /> Advanced Analysis</h3>
                {(loadedAnalysis?.advancedAnalysis ?? advancedAnalysis)!.sections.map((sec, i) => (
                  <div key={i} className="risk-advanced-section">
                    <div className="risk-advanced-section__title">{sec.title}</div>
                    <p className="risk-advanced-section__content">{sec.content}</p>
                  </div>
                ))}
              </GlassContainer>
            )}

            {/* What changed since last report — always visible */}
            <GlassContainer padding="16px 20px" borderRadius={16} className="risk-change-banner">
              <h3 className="risk-section-title"><RefreshCw size={16} /> What Changed Since Last Report</h3>
              {effectiveRisk.changeSummary && effectiveRisk.changeSummary.length > 0 ? (
                <ul className="risk-change-list">
                  {effectiveRisk.changeSummary.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              ) : lastSnapshot ? (
                <p className="risk-change-empty">No significant changes since your last snapshot ({new Date(lastSnapshot.timestamp).toLocaleDateString()}).</p>
              ) : (
                <p className="risk-change-empty">No previous snapshot to compare. Visit this page again or save a report to build history and enable change tracking. See the <strong>History</strong> tab for trend graphs.</p>
              )}
            </GlassContainer>

            {/* Key Metrics Grid (with explainability) */}
            <div className="risk-metrics-grid">
              {effectiveRisk.explainableMetrics?.filter(m => ['sharpeRatio', 'maxDrawdown', 'liquidityScore', 'diversificationScore'].includes(m.metricId)).map((m) => {
                const isExp = expandedExplainable === m.metricId
                const conf = CONFIDENCE_META[m.explainable.confidence] || CONFIDENCE_META.medium
                return (
                  <GlassContainer key={m.metricId} padding="20px" borderRadius={16} className="risk-metric-card risk-metric-card--explainable">
                    <div className="risk-metric-card__head">
                      <div className="risk-metric-card__icon" style={{ background: m.metricId === 'sharpeRatio' ? 'rgba(99,102,241,0.15)' : m.metricId === 'maxDrawdown' ? 'rgba(239,68,68,0.15)' : m.metricId === 'liquidityScore' ? 'rgba(6,182,212,0.15)' : 'rgba(16,185,129,0.15)', color: m.metricId === 'sharpeRatio' ? '#6366f1' : m.metricId === 'maxDrawdown' ? '#ef4444' : m.metricId === 'liquidityScore' ? '#06b6d4' : '#10b981' }}>
                        {m.metricId === 'sharpeRatio' ? <Target size={20} /> : m.metricId === 'maxDrawdown' ? <TrendingDown size={20} /> : m.metricId === 'liquidityScore' ? <Droplets size={20} /> : <Layers size={20} />}
                      </div>
                      <button type="button" className="risk-metric-card__explain-btn" onClick={() => setExpandedExplainable(isExp ? null : m.metricId)} title="Show source & assumptions">
                        <BookOpen size={14} />
                        {isExp ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                    </div>
                    <div className="risk-metric-card__label">{m.label}</div>
                    <div className="risk-metric-card__value">{typeof m.value === 'number' ? m.value : m.value}</div>
                    <div className="risk-metric-card__sub" style={{ color: m.metricId === 'sharpeRatio' ? SHARPE_META[effectiveRisk.sharpeRating]?.color : undefined }}>
                      {m.metricId === 'sharpeRatio' ? SHARPE_META[effectiveRisk.sharpeRating]?.label : m.metricId === 'maxDrawdown' ? fmt(effectiveRisk.maxDrawdown) : m.metricId === 'liquidityScore' ? effectiveRisk.liquidityLevel.replace('_', ' ') : `HHI (0-1): ${effectiveRisk.concentrationIndex.toFixed(2)}`}
                    </div>
                    {isExp && (
                      <div className="risk-metric-card__explain">
                        <div className="risk-explain__source"><strong>Source:</strong> {m.explainable.dataSource}</div>
                        <div className="risk-explain__assumptions"><strong>Assumptions:</strong><ul>{m.explainable.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul></div>
                        <span className="risk-explain__confidence" style={{ color: conf.color }}>{conf.label}</span>
                      </div>
                    )}
                  </GlassContainer>
                )
              }) ?? (
                <>
                  <GlassContainer padding="20px" borderRadius={16} className="risk-metric-card">
                    <div className="risk-metric-card__icon" style={{ background: 'rgba(99,102,241,0.15)', color: '#6366f1' }}><Target size={20} /></div>
                    <div className="risk-metric-card__label">Sharpe Ratio</div>
                    <div className="risk-metric-card__value">{effectiveRisk.sharpeRatio}</div>
                    <div className="risk-metric-card__sub" style={{ color: SHARPE_META[effectiveRisk.sharpeRating].color }}>{SHARPE_META[effectiveRisk.sharpeRating].label}</div>
                  </GlassContainer>
                  <GlassContainer padding="20px" borderRadius={16} className="risk-metric-card">
                    <div className="risk-metric-card__icon" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}><TrendingDown size={20} /></div>
                    <div className="risk-metric-card__label">Max Drawdown</div>
                    <div className="risk-metric-card__value">-{effectiveRisk.maxDrawdownPercent}%</div>
                    <div className="risk-metric-card__sub">{fmt(effectiveRisk.maxDrawdown)}</div>
                  </GlassContainer>
                  <GlassContainer padding="20px" borderRadius={16} className="risk-metric-card">
                    <div className="risk-metric-card__icon" style={{ background: 'rgba(6,182,212,0.15)', color: '#06b6d4' }}><Droplets size={20} /></div>
                    <div className="risk-metric-card__label">Liquidity Score</div>
                    <div className="risk-metric-card__value">{effectiveRisk.liquidityScore}/100</div>
                    <div className="risk-metric-card__sub">{effectiveRisk.liquidityLevel.replace('_', ' ')}</div>
                  </GlassContainer>
                  <GlassContainer padding="20px" borderRadius={16} className="risk-metric-card">
                    <div className="risk-metric-card__icon" style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981' }}><Layers size={20} /></div>
                    <div className="risk-metric-card__label">Diversification</div>
                    <div className="risk-metric-card__value">{effectiveRisk.diversificationScore}/100</div>
                    <div className="risk-metric-card__sub">HHI (0-1): {effectiveRisk.concentrationIndex.toFixed(2)}</div>
                  </GlassContainer>
                </>
              )}
            </div>

            {/* Concentration Warnings */}
            {effectiveRisk.concentrationWarnings.length > 0 && (
              <GlassContainer padding="20px" borderRadius={16}>
                <h3 className="risk-section-title"><AlertTriangle size={16} style={{ color: 'var(--status-warning)' }} /> Concentration Warnings</h3>
                <div className="risk-warnings">
                  {effectiveRisk.concentrationWarnings.map((w, i) => (
                    <div key={i} className={`risk-warning risk-warning--${w.type}`}>
                      <AlertTriangle size={14} />
                      <span>{w.message}</span>
                      {w.percentage > 0 && <span className="risk-warning__pct">{w.percentage.toFixed(0)}%</span>}
                    </div>
                  ))}
                </div>
              </GlassContainer>
            )}

            {/* Radar + Risk Contribution row */}
            <div className="risk-two-col">
              <GlassContainer padding="20px" borderRadius={16}>
                <h3 className="risk-section-title">Portfolio Health</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="var(--glass-border)" />
                    <PolarAngleAxis dataKey="metric" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                    <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                    <Radar dataKey="value" stroke="#6366f1" fill="#6366f1" fillOpacity={0.2} strokeWidth={2} />
                  </RadarChart>
                </ResponsiveContainer>
              </GlassContainer>

              <GlassContainer padding="20px" borderRadius={16}>
                <h3 className="risk-section-title">Risk Contribution by Type</h3>
                <div className="risk-contrib-list">
                  {Object.entries(effectiveRisk.riskContributionByType).sort(([,a],[,b]) => b - a).map(([type, pct], i) => (
                    <div key={type} className="risk-contrib-row">
                      <div className="risk-contrib-row__dot" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                      <span className="risk-contrib-row__label">{type}</span>
                      <div className="risk-contrib-row__bar-bg">
                        <div className="risk-contrib-row__bar" style={{ width: `${pct}%`, background: CHART_COLORS[i % CHART_COLORS.length] }} />
                      </div>
                      <span className="risk-contrib-row__pct">{pct}%</span>
                    </div>
                  ))}
                </div>
              </GlassContainer>
            </div>

            {/* Benchmark Comparison */}
            <GlassContainer padding="24px" borderRadius={16}>
              <h3 className="risk-section-title"><BarChart3 size={16} /> Benchmark Comparison — {effectiveRisk.benchmarkComparison.benchmarkName}</h3>
              <div className="bench-grid">
                <div className="bench-col">
                  <div className="bench-col__header">Your Portfolio</div>
                  <div className="bench-stat"><span>Return</span><strong style={{ color: effectiveRisk.benchmarkComparison.portfolioReturn >= 0 ? 'var(--status-success)' : 'var(--status-error)' }}>{effectiveRisk.benchmarkComparison.portfolioReturn >= 0 ? '+' : ''}{effectiveRisk.benchmarkComparison.portfolioReturn}%</strong></div>
                  <div className="bench-stat"><span>Volatility</span><strong>{effectiveRisk.benchmarkComparison.portfolioVolatility}%</strong></div>
                  <div className="bench-stat"><span>Sharpe</span><strong>{effectiveRisk.benchmarkComparison.portfolioSharpe}</strong></div>
                </div>
                <div className="bench-vs">VS</div>
                <div className="bench-col">
                  <div className="bench-col__header">{effectiveRisk.benchmarkComparison.benchmarkName}</div>
                  <div className="bench-stat"><span>Return</span><strong>+{effectiveRisk.benchmarkComparison.benchmarkReturn}%</strong></div>
                  <div className="bench-stat"><span>Volatility</span><strong>{effectiveRisk.benchmarkComparison.benchmarkVolatility}%</strong></div>
                  <div className="bench-stat"><span>Sharpe</span><strong>{effectiveRisk.benchmarkComparison.benchmarkSharpe}</strong></div>
                </div>
              </div>
              <div className="bench-verdict">{effectiveRisk.benchmarkComparison.verdict}</div>
            </GlassContainer>

            {/* Top Risk Contributors */}
            <GlassContainer padding="20px" borderRadius={16}>
              <h3 className="risk-section-title">Top Risk Contributors</h3>
              <div className="risk-top-list">
                {effectiveRisk.topRiskContributors.map((c, i) => (
                  <div key={i} className="risk-top-row">
                    <span className="risk-top-row__rank">#{i + 1}</span>
                    <div className="risk-top-row__info">
                      <span className="risk-top-row__name">{c.assetName}</span>
                      <span className="risk-top-row__sub">{c.symbol || c.type} &middot; {c.portfolioWeight}% weight</span>
                    </div>
                    <div className="risk-top-row__bar-bg">
                      <div className="risk-top-row__bar" style={{ width: `${c.riskContribution}%`, background: c.riskContribution > 30 ? '#ef4444' : c.riskContribution > 15 ? '#f59e0b' : '#6366f1' }} />
                    </div>
                    <span className="risk-top-row__pct">{c.riskContribution}%</span>
                  </div>
                ))}
              </div>
            </GlassContainer>

            {/* Rebalancing Suggestions (with explainability) */}
            {effectiveRisk.rebalancingSuggestions.length > 0 && (
              <GlassContainer padding="20px" borderRadius={16}>
                <h3 className="risk-section-title"><RefreshCw size={16} /> Rebalancing Suggestions</h3>
                <div className="risk-suggestions">
                  {effectiveRisk.rebalancingSuggestions.map((s, i) => {
                    const expKey = `suggestion-${i}`
                    const isExp = expandedExplainable === expKey
                    const conf = s.explainable ? (CONFIDENCE_META[s.explainable.confidence] ?? CONFIDENCE_META.medium) : null
                    return (
                      <div key={i} className="risk-suggestion risk-suggestion--explainable">
                        <div className="risk-suggestion__main">
                          <div className="risk-suggestion__action" style={{ background: s.action === 'buy' ? 'rgba(16,185,129,0.15)' : s.action === 'sell' ? 'rgba(239,68,68,0.15)' : 'rgba(99,102,241,0.15)', color: s.action === 'buy' ? '#10b981' : s.action === 'sell' ? '#ef4444' : '#6366f1' }}>
                            {s.action === 'buy' ? <ArrowUpRight size={14} /> : s.action === 'sell' ? <ArrowDownRight size={14} /> : <RefreshCw size={14} />}
                            {s.action.toUpperCase()}
                          </div>
                          <div className="risk-suggestion__info">
                            <strong>{s.assetType}</strong>
                            <span>{s.currentPercent}% → {s.targetPercent}%</span>
                          </div>
                          <div className="risk-suggestion__reason">{s.reason}</div>
                          <span className="risk-suggestion__badge" style={{ background: PRIORITY_META[s.priority].bg, color: PRIORITY_META[s.priority].color }}>{s.priority}</span>
                          {s.explainable && (
                            <button type="button" className="risk-suggestion__why-btn" onClick={() => setExpandedExplainable(isExp ? null : expKey)}>
                              <BookOpen size={12} /> Why? {isExp ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            </button>
                          )}
                        </div>
                        {s.explainable && isExp && (
                          <div className="risk-suggestion__explain">
                            <div className="risk-explain__source"><strong>Source:</strong> {s.explainable.dataSource}</div>
                            <div className="risk-explain__assumptions"><strong>Assumptions:</strong><ul>{s.explainable.assumptions.map((a, j) => <li key={j}>{a}</li>)}</ul></div>
                            {conf && <span className="risk-explain__confidence" style={{ color: conf.color }}>{conf.label}</span>}
                            {s.explainable.changeSinceLastReport && <div className="risk-explain__change">{s.explainable.changeSinceLastReport}</div>}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </GlassContainer>
            )}
          </div>
        )}

        {/* ═══════ VOLATILITY TAB ═══════ */}
        {tab === 'volatility' && (
          <div className="risk-tab-content">
            {/* Volatility Overview */}
            <GlassContainer padding="24px" borderRadius={16}>
              <h3 className="risk-section-title">Volatility Overview</h3>
              <div className="vol-hero">
                <div className="vol-gauge">
                  <svg width="140" height="140" viewBox="0 0 140 140">
                    <circle cx="70" cy="70" r="58" fill="none" stroke="var(--glass-border)" strokeWidth="8" />
                    <circle cx="70" cy="70" r="58" fill="none" stroke={VOL_LEVEL_META[effectiveRisk.volatilityLevel].color}
                      strokeWidth="8" strokeLinecap="round"
                      strokeDasharray={2 * Math.PI * 58} strokeDashoffset={2 * Math.PI * 58 * (1 - Math.min(effectiveRisk.annualizedVolatility / 60, 1))}
                      transform="rotate(-90 70 70)" style={{ transition: 'stroke-dashoffset 1s ease' }} />
                  </svg>
                  <div className="vol-gauge__val">{effectiveRisk.annualizedVolatility}%</div>
                  <div className="vol-gauge__label" style={{ color: VOL_LEVEL_META[effectiveRisk.volatilityLevel].color }}>{VOL_LEVEL_META[effectiveRisk.volatilityLevel].label}</div>
                </div>
                <div className="vol-stats">
                  <div className="vol-stat"><span>Daily Volatility</span><strong>{effectiveRisk.volatility}%</strong></div>
                  <div className="vol-stat"><span>Annualized</span><strong>{effectiveRisk.annualizedVolatility}%</strong></div>
                  <div className="vol-stat"><span>VIX Equivalent</span><strong>{(effectiveRisk.annualizedVolatility * 0.8).toFixed(1)}</strong></div>
                </div>
              </div>
            </GlassContainer>

            {/* Sharpe Ratio Scale */}
            <GlassContainer padding="24px" borderRadius={16}>
              <h3 className="risk-section-title">Sharpe Ratio — {effectiveRisk.sharpeRatio}</h3>
              <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 16 }}>{SHARPE_META[effectiveRisk.sharpeRating].desc}</p>
              <div className="sharpe-scale">
                {Object.entries(SHARPE_META).map(([key, meta]) => (
                  <div key={key} className={`sharpe-tier ${effectiveRisk.sharpeRating === key ? 'sharpe-tier--active' : ''}`} style={{ borderColor: effectiveRisk.sharpeRating === key ? meta.color : 'var(--glass-border)' }}>
                    <div className="sharpe-tier__dot" style={{ background: meta.color }} />
                    <span>{meta.label}</span>
                  </div>
                ))}
              </div>
            </GlassContainer>

            {/* Max Drawdown */}
            <GlassContainer padding="24px" borderRadius={16}>
              <h3 className="risk-section-title">Maximum Drawdown</h3>
              <div className="dd-row">
                <div className="dd-big" style={{ color: 'var(--status-error)' }}>-{effectiveRisk.maxDrawdownPercent}%</div>
                <div className="dd-amount">{fmt(effectiveRisk.maxDrawdown)}</div>
              </div>
              <div className="dd-bar-bg">
                <div className="dd-bar" style={{ width: `${Math.min(effectiveRisk.maxDrawdownPercent, 100)}%` }} />
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 8 }}>Estimated worst-case loss based on historical asset-class drawdowns</p>
            </GlassContainer>

            {/* Historical Volatility */}
            <GlassContainer padding="24px" borderRadius={16}>
              <h3 className="risk-section-title">Simulated Volatility (52 Weeks)</h3>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={volHistory}>
                  <XAxis dataKey="week" tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} interval={7} />
                  <YAxis hide />
                  <Tooltip contentStyle={{ background: 'var(--glass-bg-strong)', border: '1px solid var(--glass-border)', borderRadius: 10, fontSize: 12 }} formatter={(v: number) => [`${v}%`, 'Volatility']} />
                  <Area type="monotone" dataKey="vol" stroke="#f59e0b" fill="rgba(245,158,11,0.12)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </GlassContainer>

            {/* High Correlations */}
            {effectiveRisk.highCorrelations.length > 0 && (
              <GlassContainer padding="20px" borderRadius={16}>
                <h3 className="risk-section-title">High Correlations</h3>
                <div className="corr-list">
                  {effectiveRisk.highCorrelations.map((c, i) => (
                    <div key={i} className="corr-row">
                      <span>{c.asset1}</span>
                      <div className="corr-bar-bg"><div className="corr-bar" style={{ width: `${c.correlation * 100}%` }} /></div>
                      <span>{c.asset2}</span>
                      <strong>{(c.correlation * 100).toFixed(0)}%</strong>
                    </div>
                  ))}
                </div>
              </GlassContainer>
            )}

            {/* Liquidity Breakdown */}
            <GlassContainer padding="20px" borderRadius={16}>
              <h3 className="risk-section-title"><Droplets size={16} /> Liquidity Breakdown</h3>
              <div className="liq-list">
                {Object.entries(effectiveRisk.liquidityBreakdown).filter(([,v]) => v > 0).sort(([,a],[,b]) => b - a).map(([cat, pct]) => (
                  <div key={cat} className="liq-row">
                    <span className="liq-row__label">{LIQ_LABEL[cat] || cat}</span>
                    <div className="liq-row__bar-bg"><div className="liq-row__bar" style={{ width: `${pct}%`, background: LIQ_COLOR[cat] || '#6366f1' }} /></div>
                    <span className="liq-row__pct">{pct.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </GlassContainer>
          </div>
        )}

        {/* ═══════ SCENARIOS TAB ═══════ */}
        {tab === 'scenarios' && (
          <div className="risk-tab-content">
            <div className="risk-info-banner">
              <Info size={16} />
              <span>Stress tests model how your portfolio might react to different economic scenarios based on historical asset-class behavior. Positive impact (e.g. Market Crash showing green) can occur when bonds or cash dominate—they typically rally in risk-off environments. Negative impact in Crypto Winter reflects crypto exposure.</span>
            </div>

            {/* Bar Chart */}
            <GlassContainer padding="24px" borderRadius={16}>
              <h3 className="risk-section-title">Impact Overview</h3>
              <ResponsiveContainer width="100%" height={Math.max(180, effectiveRisk.scenarioAnalysis.length * 44)}>
                <BarChart data={effectiveRisk.scenarioAnalysis} layout="vertical">
                  <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v > 0 ? '+' : ''}${v}%`} />
                  <YAxis dataKey="name" type="category" width={130} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: 'var(--glass-bg-strong)', border: '1px solid var(--glass-border)', borderRadius: 10, fontSize: 12 }}
                    formatter={(v: number) => [`${v > 0 ? '+' : ''}${v}%`, 'Impact']} />
                  <Bar dataKey="impactPercent" radius={[0, 6, 6, 0]}>
                    {effectiveRisk.scenarioAnalysis.map((s, i) => (
                      <Cell key={i} fill={s.impactPercent >= 0 ? '#10b981' : '#ef4444'} opacity={0.8} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </GlassContainer>

            {/* Scenario Cards */}
            <div className="scenario-cards">
              {effectiveRisk.scenarioAnalysis.map((s, i) => (
                <GlassContainer key={i} padding="20px" borderRadius={16} className="scenario-card-v2">
                  <div className="scenario-card-v2__top">
                    <h4>{s.name}</h4>
                    <span className="scenario-severity" style={{ background: SEVERITY_META[s.severity].bg, color: SEVERITY_META[s.severity].color }}>{s.severity}</span>
                  </div>
                  <p className="scenario-card-v2__desc">{s.description}</p>
                  <div className="scenario-card-v2__impact" style={{ color: s.impactPercent >= 0 ? 'var(--status-success)' : 'var(--status-error)' }}>
                    {s.impactPercent >= 0 ? '+' : ''}{s.impactPercent}%
                    <span className="scenario-card-v2__amt">{s.impactAmount >= 0 ? '+' : '-'}{fmt(s.impactAmount)}</span>
                  </div>
                  <div className="scenario-bar-bg">
                    <div className="scenario-bar" style={{ width: `${Math.min(Math.abs(s.impactPercent), 100)}%`, background: s.impactPercent >= 0 ? '#10b981' : '#ef4444' }} />
                  </div>
                </GlassContainer>
              ))}
            </div>
          </div>
        )}

        {/* ═══════ EXPOSURE TAB ═══════ */}
        {tab === 'exposure' && (
          <div className="risk-tab-content">
            {/* Interactive World Map */}
            <GlassContainer padding="24px" borderRadius={16}>
              <h3 className="risk-section-title"><Globe size={16} /> Geographic Exposure</h3>
              <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 16 }}>
                Hover over countries to see your allocation. Click a highlighted country for details.
              </p>
              <WorldMap
                countryExposure={effectiveCountryPct}
                totalValue={effectiveTotalValue}
                onCountryClick={(name, pct) => setSelectedCountry({ name, pct })}
              />
              {selectedCountry && (
                <div className="map-country-detail">
                  <MapPin size={16} />
                  <strong>{selectedCountry.name}</strong>
                  <span>{selectedCountry.pct.toFixed(1)}% of portfolio</span>
                  <span className="map-country-detail__val">
                    {fmt((selectedCountry.pct / 100) * effectiveTotalValue)}
                  </span>
                  <button className="map-country-detail__close" onClick={() => setSelectedCountry(null)}>&times;</button>
                </div>
              )}
            </GlassContainer>

            {/* Country Breakdown List */}
            <GlassContainer padding="24px" borderRadius={16}>
              <h3 className="risk-section-title">Country Breakdown</h3>
              <div className="country-breakdown">
                {Object.entries(effectiveCountryPct).sort(([,a],[,b]) => b - a).map(([country, pct]) => (
                  <div key={country} className="country-row">
                    <span className="country-row__flag">{countryFlag(country)}</span>
                    <span className="country-row__name">{country}</span>
                    <div className="country-row__bar-bg">
                      <div className="country-row__bar" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="country-row__pct">{pct.toFixed(1)}%</span>
                    <span className="country-row__val">{fmt((pct / 100) * totalValue)}</span>
                  </div>
                ))}
              </div>
            </GlassContainer>

            {/* Sector + Type pie charts */}
            {[
              { title: 'Sector Exposure', icon: <PieIcon size={16} />, data: pieData(effectiveSectorAlloc, SECTOR_LABELS as Record<string, string>) },
              { title: 'Asset Type Breakdown', icon: <Layers size={16} />, data: pieData(effectiveTypeAlloc, ASSET_TYPE_LABELS as Record<string, string>) },
            ].map(({ title, icon, data }) => (
              <GlassContainer key={title} padding="24px" borderRadius={16}>
                <h3 className="risk-section-title">{icon} {title}</h3>
                <div className="exposure-row">
                  <div className="exposure-chart">
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={45}>
                          {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                        </Pie>
                        <Tooltip contentStyle={{ background: 'var(--glass-bg-strong)', border: '1px solid var(--glass-border)', borderRadius: 10, fontSize: 12 }}
                          formatter={(v: number) => [fmt(v), 'Value']} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="exposure-legend">
                    {data.map((d, i) => (
                      <div key={d.name} className="exposure-legend__item">
                        <div className="exposure-legend__dot" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                        <span className="exposure-legend__name">{d.name}</span>
                        <span className="exposure-legend__val">{fmt(d.value)}</span>
                        <span className="exposure-legend__pct">{totalValue > 0 ? ((d.value / totalValue) * 100).toFixed(1) : 0}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </GlassContainer>
            ))}
          </div>
        )}

        {/* ═══════ HISTORY TAB ═══════ */}
        {tab === 'history' && (
          <div className="risk-tab-content">
            <div className="risk-info-banner">
              <Info size={16} />
              <span>Risk metrics are recorded each time you visit this page or save a report. Up to 20 snapshots are kept for trend analysis.</span>
            </div>

            {snapshots.length < 2 ? (
              <GlassContainer padding="32px" borderRadius={16} className="risk-history-empty">
                <History size={40} style={{ color: 'var(--text-tertiary)', marginBottom: 16 }} />
                <h3 className="risk-section-title">Not enough history yet</h3>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  Visit this page again or save a report to build your risk history. Once you have 2+ snapshots, trend graphs will appear here.
                </p>
              </GlassContainer>
            ) : (
              <>
                {/* Chart data: oldest first for time axis */}
                {(() => {
                  const chartData = [...snapshots].reverse().map((s) => ({
                    date: new Date(s.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }),
                    riskScore: s.riskScore,
                    sharpe: s.sharpeRatio,
                    volatility: s.annualizedVolatility,
                    maxDD: s.maxDrawdownPercent,
                    diversification: s.diversificationScore,
                    liquidity: s.liquidityScore,
                    value: s.portfolioValue,
                  }))
                  return (
                    <>
                      <GlassContainer padding="24px" borderRadius={16}>
                        <h3 className="risk-section-title"><TrendingUp size={16} /> Risk Score Over Time</h3>
                        <ResponsiveContainer width="100%" height={220}>
                          <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" />
                            <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} />
                            <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} width={28} />
                            <Tooltip contentStyle={{ background: 'var(--glass-bg-strong)', border: '1px solid var(--glass-border)', borderRadius: 10, fontSize: 12 }} />
                            <Line type="monotone" dataKey="riskScore" stroke="#6366f1" strokeWidth={2} dot={{ r: 4, fill: '#6366f1' }} name="Risk Score" />
                          </LineChart>
                        </ResponsiveContainer>
                      </GlassContainer>

                      <div className="risk-history-grid">
                        <GlassContainer padding="24px" borderRadius={16}>
                          <h3 className="risk-section-title">Sharpe Ratio</h3>
                          <ResponsiveContainer width="100%" height={180}>
                            <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" />
                              <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} />
                              <YAxis tick={{ fontSize: 9, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} width={32} />
                              <Tooltip contentStyle={{ background: 'var(--glass-bg-strong)', border: '1px solid var(--glass-border)', borderRadius: 10, fontSize: 12 }} />
                              <Line type="monotone" dataKey="sharpe" stroke="#06b6d4" strokeWidth={2} dot={{ r: 3, fill: '#06b6d4' }} name="Sharpe" />
                            </LineChart>
                          </ResponsiveContainer>
                        </GlassContainer>
                        <GlassContainer padding="24px" borderRadius={16}>
                          <h3 className="risk-section-title">Volatility %</h3>
                          <ResponsiveContainer width="100%" height={180}>
                            <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" />
                              <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} />
                              <YAxis tick={{ fontSize: 9, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} width={32} />
                              <Tooltip contentStyle={{ background: 'var(--glass-bg-strong)', border: '1px solid var(--glass-border)', borderRadius: 10, fontSize: 12 }} />
                              <Line type="monotone" dataKey="volatility" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3, fill: '#f59e0b' }} name="Volatility %" />
                            </LineChart>
                          </ResponsiveContainer>
                        </GlassContainer>
                        <GlassContainer padding="24px" borderRadius={16}>
                          <h3 className="risk-section-title">Max Drawdown %</h3>
                          <ResponsiveContainer width="100%" height={180}>
                            <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" />
                              <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} />
                              <YAxis tick={{ fontSize: 9, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} width={32} tickFormatter={(v) => `-${v}%`} />
                              <Tooltip contentStyle={{ background: 'var(--glass-bg-strong)', border: '1px solid var(--glass-border)', borderRadius: 10, fontSize: 12 }} formatter={(v: number) => [`-${v}%`, 'Max DD']} />
                              <Line type="monotone" dataKey="maxDD" stroke="#ef4444" strokeWidth={2} dot={{ r: 3, fill: '#ef4444' }} name="Max DD %" />
                            </LineChart>
                          </ResponsiveContainer>
                        </GlassContainer>
                        <GlassContainer padding="24px" borderRadius={16}>
                          <h3 className="risk-section-title">Portfolio Value</h3>
                          <ResponsiveContainer width="100%" height={180}>
                            <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" />
                              <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} />
                              <YAxis tick={{ fontSize: 9, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                              <Tooltip contentStyle={{ background: 'var(--glass-bg-strong)', border: '1px solid var(--glass-border)', borderRadius: 10, fontSize: 12 }} formatter={(v: number) => [fmt(v), 'Value']} />
                              <Line type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2} dot={{ r: 3, fill: '#10b981' }} name="Portfolio Value" />
                            </LineChart>
                          </ResponsiveContainer>
                        </GlassContainer>
                      </div>
                    </>
                  )
                })()}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Shield, AlertTriangle, TrendingUp, BarChart3, Globe,
  RefreshCw, FileDown, CloudUpload, HardDrive, History, BarChart2,
  X, FileText, FolderOpen, ExternalLink, Cloud,
} from 'lucide-react'
import GlassContainer from '../../components/glass/GlassContainer'
import GlassIconButton from '../../components/glass/GlassIconButton'
import ValuationDisclosure from '../../components/financial/ValuationDisclosure'
import { usePortfolio } from '../../store/usePortfolio'
import { getSharedDocumentInsights } from '../../store/useDocumentInsights'
import { useRiskSnapshots, computeChangeSummary, snapshotToMinimalRisk } from '../../store/useRiskSnapshots'
import { analyzePortfolio } from '../../services/riskAnalysis'
import { generateRiskReportPdf } from '../../services/riskReportPdf'
import type { Asset, RiskSnapshot } from '../../types'
import { assetCurrentValue, isLoan } from '../../types'
import { RISK_LEVEL_META } from '../../constants/riskMeta'
import {
  aggregateAssetValueProvenance,
  createFinancialProvenance,
  deriveCalculatedProvenance,
  toFinancialAuditContext,
} from '../../lib/financialProvenance'
import OverviewTab from './risk/OverviewTab'
import VolatilityTab from './risk/VolatilityTab'
import ScenariosTab from './risk/ScenariosTab'
import ExposureTab from './risk/ExposureTab'
import HistoryTab from './risk/HistoryTab'
import { DOCUMENTS_PREFIX, REPORTS_PREFIX, RISK_BG, generateVolHistory, type LoadedAnalysis } from './risk/riskConstants'
import './DetailScreen.css'
import './RiskAnalysisScreen.css'


interface RiskAnalysisScreenProps {
  /** When true, rendered inside MainShell: hide back control (shell nav is used instead). */
  embeddedInShell?: boolean
}

export default function RiskAnalysisScreen({ embeddedInShell = false }: RiskAnalysisScreenProps) {
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
  const riskValuation = useMemo(() => {
    if (loadedAnalysis?.valuationProvenance) return loadedAnalysis.valuationProvenance
    if (loadedAnalysis) {
      return createFinancialProvenance({
        sourceKind: 'historical',
        sourceName: loadedAnalysis.source === 'snapshot' ? 'FinoCurve risk snapshot' : 'Saved FinoCurve risk report',
        valuationMethod: 'risk_model',
        asOf: loadedAnalysis.generatedAt,
        recordedAt: loadedAnalysis.generatedAt,
      }, loadedAnalysis.generatedAt)
    }
    return deriveCalculatedProvenance(
      aggregateAssetValueProvenance(effectiveInvestableAssets),
      'FinoCurve risk engine',
      'risk_model'
    )
  }, [effectiveInvestableAssets, loadedAnalysis])
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
        valuationProvenance: riskValuation,
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
        valuationProvenance: riskValuation,
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
        valuationProvenance: riskValuation,
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
        valuationProvenance: riskValuation,
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
        valuationProvenance: riskValuation,
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
    const valuationAudit = toFinancialAuditContext(riskValuation)
    const portfolioSummary = `Portfolio: ${loadedAnalysis?.portfolioName ?? portfolio?.name ?? 'Portfolio'}, $${effectiveTotalValue.toLocaleString()}, ${effectiveInvestableAssets.length} holdings. Gain/Loss: ${effectiveGainLossPercent.toFixed(1)}%. Assets: ${effectiveInvestableAssets.slice(0, 5).map((a) => `${a.name} (${a.type})`).join(', ')}. Valuation source: ${valuationAudit.source}; as of ${valuationAudit.asOf}; method: ${valuationAudit.valuationMethod}; freshness: ${valuationAudit.freshness}${valuationAudit.estimated ? '; estimated' : ''}.`
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
  }, [effectiveRisk, loadedAnalysis, portfolio, effectiveTotalValue, effectiveGainLossPercent, effectiveInvestableAssets, advancedAnalysisSelectedDoc, advancedAnalysisDocs, riskValuation])

  if (!effectiveRisk) {
    return (
      <div className="risk-page">
        <div className="risk-bg">
          <img src={RISK_BG} alt="" className="risk-bg__img" />
          <div className="risk-bg__overlay" />
        </div>
        <div className="risk-page__inner risk-page__inner--visible">
        <div className="risk-page__header">
          {!embeddedInShell && (
            <GlassIconButton icon={<ArrowLeft size={20} />} onClick={() => navigate(-1)} size={44} />
          )}
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
          {!embeddedInShell && (
            <GlassIconButton icon={<ArrowLeft size={20} />} onClick={() => navigate(-1)} size={44} />
          )}
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
        <ValuationDisclosure provenance={riskValuation} label="Risk analysis inputs" />

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
          <OverviewTab
            effectiveRisk={effectiveRisk}
            loadedAnalysis={loadedAnalysis}
            advancedAnalysis={advancedAnalysis}
            lastSnapshot={lastSnapshot}
            expandedExplainable={expandedExplainable}
            setExpandedExplainable={setExpandedExplainable}
            radarData={radarData}
          />
        )}

        {/* ═══════ VOLATILITY TAB ═══════ */}
        {tab === 'volatility' && <VolatilityTab effectiveRisk={effectiveRisk} volHistory={volHistory} />}

        {/* ═══════ SCENARIOS TAB ═══════ */}
        {tab === 'scenarios' && <ScenariosTab effectiveRisk={effectiveRisk} />}

        {/* ═══════ EXPOSURE TAB ═══════ */}
        {tab === 'exposure' && (
          <ExposureTab
            effectiveCountryPct={effectiveCountryPct}
            effectiveTotalValue={effectiveTotalValue}
            totalValue={totalValue}
            selectedCountry={selectedCountry}
            setSelectedCountry={setSelectedCountry}
            effectiveSectorAlloc={effectiveSectorAlloc}
            effectiveTypeAlloc={effectiveTypeAlloc}
          />
        )}

        {/* ═══════ HISTORY TAB ═══════ */}
        {tab === 'history' && <HistoryTab snapshots={snapshots} />}
      </div>
    </div>
  )
}

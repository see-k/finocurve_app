import { useState, useMemo, useEffect } from 'react'
import {
  Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line,
  ComposedChart,
} from 'recharts'
import { Target, Plus, Trash2, TrendingUp, Wallet, Pencil, X, ChevronDown } from 'lucide-react'
import GlassContainer from '../../components/glass/GlassContainer'
import GlassButton from '../../components/glass/GlassButton'
import GlassTextField from '../../components/glass/GlassTextField'
import { useTracker } from '../../hooks/useTracker'
import { useHistoricalPrices } from '../../hooks/useHistoricalPrices'
import { usePreferences } from '../../store/usePreferences'
import { usePortfolio } from '../../store/usePortfolio'
import { usePortfolioValueHistory } from '../../store/usePortfolioValueHistory'
import { useRiskSnapshots } from '../../store/useRiskSnapshots'
import { getPerformanceChartData } from '../../utils/performanceChartData'
import type { NetWorthEntry, TrackerGoal, TrackerGoalProgressSource, PerformancePeriod } from '../../types'
import {
  currentValueForGoalSource,
  currentRiskScore,
  goalProgressPercent,
  naturalBaselineForGoalSource,
  portfolioHoldingsValue,
} from '../../lib/trackerGoalMetrics'
import { augmentSeriesWithLinearTrend } from '../../lib/chartTrendForecast'
import './TrackerScreen.css'

/** Same hero image treatment as Dashboard */
const TRACKER_BG = 'https://images.unsplash.com/photo-1515266591878-f93e32bc5937?q=80&w=1287&auto=format&fit=crop'

/** Matches Dashboard default — same `getPerformanceChartData` window + API priority */
const TRACKER_PORTFOLIO_CHART_PERIOD: PerformancePeriod = '1M'

const GOAL_EXPAND_OVERRIDES_KEY = 'finocurve-tracker-goal-expanded-overrides'

function loadGoalExpandOverrides(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(GOAL_EXPAND_OVERRIDES_KEY)
    if (raw) {
      const o = JSON.parse(raw) as Record<string, boolean>
      if (o && typeof o === 'object' && !Array.isArray(o)) return o
    }
  } catch {
    /* ignore */
  }
  return {}
}

function saveGoalExpandOverrides(map: Record<string, boolean>) {
  try {
    localStorage.setItem(GOAL_EXPAND_OVERRIDES_KEY, JSON.stringify(map))
  } catch {
    /* ignore */
  }
}

type TrackerTab = 'netWorth' | 'goals'

const GOAL_SOURCE_OPTIONS: { value: TrackerGoalProgressSource; label: string }[] = [
  { value: 'net_worth', label: 'Net worth (logged)' },
  { value: 'portfolio_balance', label: 'Portfolio holdings' },
  { value: 'debt_loans', label: 'Debt / loans' },
  { value: 'risk_score', label: 'Risk analysis score' },
]

function goalSourceLabel(s: TrackerGoalProgressSource): string {
  return GOAL_SOURCE_OPTIONS.find((o) => o.value === s)?.label ?? s
}

function fmtMoney(n: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)
  } catch {
    return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
  }
}

function fmtGoalMetric(n: number, currency: string, source: TrackerGoalProgressSource): string {
  if (source === 'risk_score') {
    return `${Math.round(n)} / 100`
  }
  return fmtMoney(n, currency)
}

function isValidGoalTargetAmount(amount: number, source: TrackerGoalProgressSource): boolean {
  if (!Number.isFinite(amount)) return false
  if (source === 'risk_score') return amount >= 0 && amount <= 100
  return amount > 0
}

function formatChartLabel(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function TrackerScreen() {
  const { prefs, updatePreferences } = usePreferences()
  const cur = prefs.defaultCurrency || 'USD'
  const { portfolio, totalValue: portfolioTotalValue } = usePortfolio()
  const {
    netWorthEntries,
    goals,
    latestNetWorth,
    loading,
    error,
    refresh,
  } = useTracker()

  const hasPortfolioAssets = !!portfolio?.assets?.length
  const portfolioHoldingsOnly = useMemo(() => portfolioHoldingsValue(portfolio), [portfolio])
  const { history: portfolioValueHistory } = usePortfolioValueHistory(
    portfolioTotalValue,
    portfolioHoldingsOnly,
    hasPortfolioAssets
  )
  const { snapshots: riskSnapshots } = useRiskSnapshots()

  const portfolioPerfApiEnabled =
    hasPortfolioAssets && typeof window !== 'undefined' && !!window.electronAPI?.priceHistorical
  const { data: portfolioHistoricalApiData } = useHistoricalPrices(
    portfolio?.assets ?? [],
    TRACKER_PORTFOLIO_CHART_PERIOD,
    portfolioTotalValue,
    portfolioPerfApiEnabled
  )

  const portfolioPerformanceMiniSeries = useMemo(() => {
    const { data } = getPerformanceChartData(
      portfolioValueHistory,
      portfolioTotalValue,
      TRACKER_PORTFOLIO_CHART_PERIOD,
      portfolioHistoricalApiData.length >= 2 ? portfolioHistoricalApiData : undefined
    )
    return data.map((p) => ({ dateLabel: p.dateLabel, value: p.value }))
  }, [portfolioValueHistory, portfolioTotalValue, portfolioHistoricalApiData])

  const liveRiskScore = useMemo(() => currentRiskScore(portfolio), [portfolio])

  const [amountDraft, setAmountDraft] = useState('')
  const [noteDraft, setNoteDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [goalTitle, setGoalTitle] = useState('')
  const [goalTarget, setGoalTarget] = useState('')
  const [goalDate, setGoalDate] = useState('')
  const [goalProgressSource, setGoalProgressSource] = useState<TrackerGoalProgressSource>('net_worth')
  const [tab, setTab] = useState<TrackerTab>('netWorth')
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [editNote, setEditNote] = useState('')
  const [editRecordedAtLocal, setEditRecordedAtLocal] = useState('')
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null)
  const [editGoalTitle, setEditGoalTitle] = useState('')
  const [editGoalTarget, setEditGoalTarget] = useState('')
  const [editGoalDate, setEditGoalDate] = useState('')
  const [editGoalSource, setEditGoalSource] = useState<TrackerGoalProgressSource>('net_worth')
  const [goalExpandOverrides, setGoalExpandOverrides] = useState<Record<string, boolean>>(loadGoalExpandOverrides)

  useEffect(() => {
    saveGoalExpandOverrides(goalExpandOverrides)
  }, [goalExpandOverrides])

  useEffect(() => {
    const ids = new Set(goals.map((x) => x.id))
    setGoalExpandOverrides((prev) => {
      const next = { ...prev }
      let changed = false
      for (const k of Object.keys(next)) {
        if (!ids.has(k)) {
          delete next[k]
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [goals])

  const goalCardExpanded = (id: string) => {
    const o = goalExpandOverrides[id]
    if (o !== undefined) return o
    return !(prefs.trackerGoalsCollapsedByDefault ?? false)
  }

  const toggleGoalCardExpanded = (id: string) => {
    const cur = goalCardExpanded(id)
    setGoalExpandOverrides((prev) => ({ ...prev, [id]: !cur }))
  }

  useEffect(() => {
    if (tab !== 'netWorth') setEditingEntryId(null)
    if (tab !== 'goals') setEditingGoalId(null)
  }, [tab])

  const chartData = useMemo(
    () =>
      netWorthEntries.map((e) => ({
        dateLabel: formatChartLabel(e.recordedAt),
        value: e.amount,
        recordedAt: e.recordedAt,
      })),
    [netWorthEntries]
  )

  const netWorthChartWithTrend = useMemo(
    () =>
      augmentSeriesWithLinearTrend(chartData, {
        forecastSteps: 2,
        minPoints: 3,
        extrapolationPaddingFraction: 0.22,
      }),
    [chartData]
  )

  /** Y scale from logged net worth only so trend/projection can't blow up the axis. */
  const netWorthYDomain = useMemo((): [number, number] | undefined => {
    const vals = chartData.map((d) => d.value).filter((v) => Number.isFinite(v))
    if (vals.length === 0) return undefined
    const lo = Math.min(...vals)
    const hi = Math.max(...vals)
    const span = hi - lo || Math.max(Math.abs(hi) * 0.08, 1)
    const pad = Math.max(span * 0.12, Math.abs(hi) * 0.03, 1)
    return [lo - pad, hi + pad]
  }, [chartData])

  const newGoalLiveValue = useMemo(
    () => currentValueForGoalSource(goalProgressSource, latestNetWorth, portfolio, liveRiskScore),
    [goalProgressSource, latestNetWorth, portfolio, liveRiskScore]
  )
  const newGoalStoredBaseline = useMemo(
    () => naturalBaselineForGoalSource(goalProgressSource, newGoalLiveValue),
    [goalProgressSource, newGoalLiveValue]
  )

  const newGoalTargetNum = parseFloat(goalTarget.replace(/,/g, ''))
  const newGoalTargetInvalid =
    goalTarget.trim() !== '' && !isValidGoalTargetAmount(newGoalTargetNum, goalProgressSource)
  const newGoalInvalidSpan =
    goalTarget.trim() !== '' &&
    Number.isFinite(newGoalTargetNum) &&
    !newGoalTargetInvalid &&
    Math.abs(newGoalTargetNum - newGoalStoredBaseline) < 1e-6

  const editingGoal = editingGoalId ? goals.find((x) => x.id === editingGoalId) : undefined
  const editBaselinePreview: number | undefined = editingGoal
    ? editGoalSource !== editingGoal.progressSource
      ? naturalBaselineForGoalSource(
          editGoalSource,
          currentValueForGoalSource(editGoalSource, latestNetWorth, portfolio, liveRiskScore)
        )
      : editingGoal.baselineAmount
    : undefined
  const editTargetNum = parseFloat(editGoalTarget.replace(/,/g, ''))
  const editGoalTargetInvalid =
    !!editingGoal && editGoalTarget.trim() !== '' && !isValidGoalTargetAmount(editTargetNum, editGoalSource)
  const editGoalInvalidSpan =
    !!editingGoal &&
    editGoalTarget.trim() !== '' &&
    !editGoalTargetInvalid &&
    Number.isFinite(editTargetNum) &&
    editBaselinePreview !== undefined &&
    Math.abs(editTargetNum - editBaselinePreview) < 1e-6

  const hasElectron = typeof window !== 'undefined' && !!window.electronAPI?.trackerGetState

  const addEntry = async () => {
    const amount = parseFloat(amountDraft.replace(/,/g, ''))
    if (!Number.isFinite(amount) || amount <= 0 || !window.electronAPI?.trackerAppendNetWorth) return
    setSaving(true)
    try {
      await window.electronAPI.trackerAppendNetWorth({
        amount,
        note: noteDraft.trim() || null,
        source: 'manual',
      })
      setAmountDraft('')
      setNoteDraft('')
      await refresh()
    } finally {
      setSaving(false)
    }
  }

  const removeEntry = async (id: string) => {
    if (!window.electronAPI?.trackerDeleteNetWorth) return
    if (editingEntryId === id) setEditingEntryId(null)
    await window.electronAPI.trackerDeleteNetWorth(id)
    await refresh()
  }

  const startEditEntry = (e: NetWorthEntry) => {
    setEditingEntryId(e.id)
    setEditAmount(String(e.amount))
    setEditNote(e.note ?? '')
    setEditRecordedAtLocal(toDatetimeLocalValue(e.recordedAt))
  }

  const cancelEditEntry = () => {
    setEditingEntryId(null)
    setEditAmount('')
    setEditNote('')
    setEditRecordedAtLocal('')
  }

  const saveEditEntry = async () => {
    if (!editingEntryId || !window.electronAPI?.trackerUpdateNetWorth) return
    const amount = parseFloat(editAmount.replace(/,/g, ''))
    if (!Number.isFinite(amount) || amount <= 0) return
    const d = new Date(editRecordedAtLocal)
    if (Number.isNaN(d.getTime())) return
    setSaving(true)
    try {
      const { entry } = await window.electronAPI.trackerUpdateNetWorth({
        id: editingEntryId,
        amount,
        note: editNote.trim() || null,
        recordedAt: d.toISOString(),
      })
      if (entry) {
        cancelEditEntry()
        await refresh()
      }
    } finally {
      setSaving(false)
    }
  }

  const addGoal = async () => {
    const targetAmount = parseFloat(goalTarget.replace(/,/g, ''))
    if (!goalTitle.trim() || !isValidGoalTargetAmount(targetAmount, goalProgressSource)) return
    if (!window.electronAPI?.trackerCreateGoal) return
    const liveValue = currentValueForGoalSource(goalProgressSource, latestNetWorth, portfolio, liveRiskScore)
    const baselineAmount = naturalBaselineForGoalSource(goalProgressSource, liveValue)
    if (Math.abs(targetAmount - baselineAmount) < 1e-6) return
    setSaving(true)
    try {
      await window.electronAPI.trackerCreateGoal({
        title: goalTitle.trim(),
        targetAmount,
        targetDate: goalDate.trim() || null,
        progressSource: goalProgressSource,
        baselineAmount,
      })
      setGoalTitle('')
      setGoalTarget('')
      setGoalDate('')
      setGoalProgressSource('net_worth')
      await refresh()
    } finally {
      setSaving(false)
    }
  }

  const removeGoal = async (id: string) => {
    if (!window.electronAPI?.trackerDeleteGoal) return
    if (editingGoalId === id) setEditingGoalId(null)
    await window.electronAPI.trackerDeleteGoal(id)
    await refresh()
  }

  const startEditGoal = (g: TrackerGoal) => {
    setEditingGoalId(g.id)
    setEditGoalTitle(g.title)
    setEditGoalTarget(String(g.targetAmount))
    setEditGoalDate(g.targetDate ?? '')
    setEditGoalSource(g.progressSource)
  }

  const cancelEditGoal = () => {
    setEditingGoalId(null)
    setEditGoalTitle('')
    setEditGoalTarget('')
    setEditGoalDate('')
    setEditGoalSource('net_worth')
  }

  const saveEditGoal = async () => {
    if (!editingGoalId || !window.electronAPI?.trackerUpdateGoal) return
    const existing = goals.find((x) => x.id === editingGoalId)
    if (!existing) return
    const targetAmount = parseFloat(editGoalTarget.replace(/,/g, ''))
    if (!editGoalTitle.trim() || !isValidGoalTargetAmount(targetAmount, editGoalSource)) return
    const sourceChanged = editGoalSource !== existing.progressSource
    const baselineAmount = sourceChanged
      ? naturalBaselineForGoalSource(
          editGoalSource,
          currentValueForGoalSource(editGoalSource, latestNetWorth, portfolio, liveRiskScore)
        )
      : existing.baselineAmount
    if (Math.abs(targetAmount - baselineAmount) < 1e-6) return
    setSaving(true)
    try {
      const { goal } = await window.electronAPI.trackerUpdateGoal({
        id: editingGoalId,
        title: editGoalTitle.trim(),
        targetAmount,
        targetDate: editGoalDate.trim() || null,
        progressSource: editGoalSource,
        baselineAmount,
      })
      if (goal) {
        cancelEditGoal()
        await refresh()
      }
    } finally {
      setSaving(false)
    }
  }

  /**
   * Build mini-chart data per goal source:
   * - net_worth: full logged NW series
   * - portfolio_balance: same pipeline as Dashboard — `getPerformanceChartData` + `useHistoricalPrices` (1M)
   * - risk_score: risk snapshots store
   * - debt_loans: two-point Start → Now
   */
  const goalChartData = (goal: TrackerGoal, currentMetric: number) => {
    if (goal.progressSource === 'net_worth') {
      return netWorthEntries.map((e) => ({
        dateLabel: formatChartLabel(e.recordedAt),
        value: e.amount,
      }))
    }
    if (goal.progressSource === 'portfolio_balance' && portfolioPerformanceMiniSeries.length >= 2) {
      return portfolioPerformanceMiniSeries
    }
    if (goal.progressSource === 'risk_score' && riskSnapshots.length >= 2) {
      // Snapshots are newest-first; reverse for chronological display
      return [...riskSnapshots]
        .reverse()
        .map((s) => ({
          dateLabel: formatChartLabel(s.timestamp),
          value: s.riskScore,
        }))
    }
    return [
      { dateLabel: 'Start', value: goal.baselineAmount },
      { dateLabel: 'Now', value: currentMetric },
    ]
  }

  if (!hasElectron) {
    return (
      <div className="tracker">
        <div className="tracker-bg">
          <img src={TRACKER_BG} alt="" className="tracker-bg__img" />
          <div className="tracker-bg__overlay" />
        </div>
        <div className="tracker-body">
          <h1 className="tracker-title">Tracker</h1>
          <p className="tracker-subtitle">Open FinoCurve in the desktop app to log net worth and goals.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="tracker">
      <div className="tracker-bg">
        <img src={TRACKER_BG} alt="" className="tracker-bg__img" />
        <div className="tracker-bg__overlay" />
      </div>
      <div className="tracker-body">
        <header className="tracker-header">
          <div className="tracker-header__titles">
            <h1 className="tracker-title">
              <Target size={26} className="tracker-title__icon" aria-hidden />
              Tracker
            </h1>
            <p className="tracker-subtitle">
              {tab === 'netWorth'
                ? 'Log your true net worth (separate from portfolio holdings). Optional S3 backup in Settings → Tracker backup.'
                : 'Track progress using logged net worth, portfolio holdings, loan balances, or the Risk analysis score (0–100).'}
            </p>
          </div>
        </header>

        <div className="tracker-tabs">
          <button
            type="button"
            className={`tracker-tab ${tab === 'netWorth' ? 'tracker-tab--active' : ''}`}
            onClick={() => setTab('netWorth')}
          >
            <Wallet size={16} aria-hidden /> Net worth
          </button>
          <button
            type="button"
            className={`tracker-tab ${tab === 'goals' ? 'tracker-tab--active' : ''}`}
            onClick={() => setTab('goals')}
          >
            <Target size={16} aria-hidden /> Goals
          </button>
        </div>

        {loading && <p className="tracker-muted">Loading…</p>}
        {error && <p className="tracker-error">{error}</p>}

        {tab === 'netWorth' && (
        <div className="tracker-networth-layout">
        <div className="tracker-networth-top">
        <GlassContainer padding="24px" borderRadius={20} className="tracker-card tracker-networth-chart-card">
          <div className="tracker-nw-head">
            <div>
              <p className="tracker-label">Latest logged net worth</p>
              <p className="tracker-hero">
                {latestNetWorth != null ? fmtMoney(latestNetWorth, cur) : '—'}
              </p>
            </div>
            <TrendingUp size={40} className="tracker-hero__icon" aria-hidden />
          </div>

          {chartData.length >= 2 ? (
            <div className="tracker-chart tracker-nw-chart">
              <div className="tracker-nw-chart__plot">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={netWorthChartWithTrend} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                    <defs>
                      <linearGradient id="trackerGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--brand-primary)" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="var(--brand-primary)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="dateLabel"
                      tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      domain={netWorthYDomain ?? ['auto', 'auto']}
                      allowDataOverflow={netWorthYDomain != null}
                      tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => fmtMoney(Number(v), cur)}
                      width={80}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--glass-bg)',
                        border: '1px solid var(--glass-border)',
                        borderRadius: 12,
                      }}
                      formatter={(value: number | string, name: string) => {
                        if (value == null || typeof value !== 'number' || Number.isNaN(value)) return ['—', name]
                        return [fmtMoney(value, cur), name]
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke="var(--brand-primary)"
                      strokeWidth={2}
                      fill="url(#trackerGrad)"
                      connectNulls={false}
                      name="Net worth"
                    />
                    <Line
                      type="monotone"
                      dataKey="histTrend"
                      stroke="var(--text-tertiary)"
                      strokeWidth={1.5}
                      dot={false}
                      name="Linear trend"
                      connectNulls
                    />
                    <Line
                      type="monotone"
                      dataKey="futTrend"
                      stroke="#f59e0b"
                      strokeWidth={1.5}
                      strokeDasharray="5 4"
                      dot={false}
                      name="Projection"
                      connectNulls
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <p className="tracker-muted tracker-chart-hint">
              Add at least two dated entries to see your net worth trend.
            </p>
          )}
        </GlassContainer>
        </div>

        <div className="tracker-networth-bottom">
        <GlassContainer padding="24px" borderRadius={20} blur={0} className="tracker-card tracker-networth-log-card">
          <h2 className="tracker-section-title tracker-section-title--sm">Log entry</h2>
          <div className="tracker-form-grid tracker-form-grid--single">
            <div className="tracker-field">
              <span className="tracker-field__label">Amount</span>
              <GlassTextField value={amountDraft} onChange={setAmountDraft} placeholder="e.g. 125000" />
            </div>
            <div className="tracker-field">
              <span className="tracker-field__label">Note (optional)</span>
              <GlassTextField value={noteDraft} onChange={setNoteDraft} placeholder="e.g. Q1 check-in" />
            </div>
          </div>
          <p className="tracker-muted tracker-log-time-hint">
            Each entry is saved with the current date and time when you tap Log net worth.
          </p>
          <GlassButton
            text={saving ? 'Saving…' : 'Log net worth'}
            icon={<Plus size={18} />}
            onClick={() => void addEntry()}
            disabled={saving || !amountDraft.trim()}
          />
        </GlassContainer>

        <GlassContainer
          padding="20px 24px"
          borderRadius={20}
          blur={0}
          className="tracker-card tracker-entries-card tracker-networth-entries-card"
        >
          <h2 className="tracker-section-title">Recent entries</h2>
          {netWorthEntries.length === 0 ? (
            <p className="tracker-muted">No entries yet. You can also ask the AI assistant to log a figure for you.</p>
          ) : (
            <ul className="tracker-entry-list">
              {[...netWorthEntries].reverse().map((e: NetWorthEntry) => (
                <li key={e.id} className={`tracker-entry-row ${editingEntryId === e.id ? 'tracker-entry-row--editing' : ''}`}>
                  {editingEntryId === e.id ? (
                    <div className="tracker-entry-edit">
                      <div className="tracker-form-grid tracker-form-grid--single">
                        <div className="tracker-field">
                          <span className="tracker-field__label">Amount</span>
                          <GlassTextField value={editAmount} onChange={setEditAmount} placeholder="Amount" />
                        </div>
                        <div className="tracker-field">
                          <span className="tracker-field__label">Note</span>
                          <GlassTextField value={editNote} onChange={setEditNote} placeholder="Optional" />
                        </div>
                        <div className="tracker-field">
                          <span className="tracker-field__label">Date &amp; time</span>
                          <GlassTextField
                            type="datetime-local"
                            value={editRecordedAtLocal}
                            onChange={setEditRecordedAtLocal}
                          />
                        </div>
                      </div>
                      <div className="tracker-entry-edit__actions">
                        <GlassButton
                          text={saving ? 'Saving…' : 'Save'}
                          onClick={() => void saveEditEntry()}
                          disabled={saving || !editAmount.trim()}
                        />
                        <button type="button" className="tracker-text-btn" onClick={cancelEditEntry} disabled={saving}>
                          <X size={16} aria-hidden /> Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                  <div className="tracker-entry-row__body">
                    <span className="tracker-entry-amount">{fmtMoney(e.amount, cur)}</span>
                    <span className="tracker-entry-meta">
                      {new Date(e.recordedAt).toLocaleString()} · {e.source}
                      {e.note ? ` · ${e.note}` : ''}
                    </span>
                  </div>
                  <div className="tracker-entry-actions">
                    <button
                      type="button"
                      className="tracker-icon-btn tracker-icon-btn--edit"
                      title="Edit entry"
                      onClick={() => startEditEntry(e)}
                    >
                      <Pencil size={18} />
                    </button>
                    <button
                      type="button"
                      className="tracker-icon-btn tracker-icon-btn--delete"
                      title="Delete entry"
                      onClick={() => void removeEntry(e.id)}
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </GlassContainer>
        </div>
        </div>
        )}

        {tab === 'goals' && (
        <div className="tracker-goals-layout">
        <GlassContainer padding="24px" borderRadius={20} blur={0} className="tracker-card tracker-goals-form-card">
          <h2 className="tracker-section-title">New goal</h2>
          <p className="tracker-muted tracker-goals-intro">
            Choose what to track. We store your starting value when you add the goal (or when you change the source while editing).
          </p>
          <div className="tracker-form-grid tracker-goal-form">
            <div className="tracker-field">
              <span className="tracker-field__label">Goal title</span>
              <GlassTextField value={goalTitle} onChange={setGoalTitle} placeholder="e.g. Reach $500k" />
            </div>
            <div className="tracker-field">
              <span className="tracker-field__label">Progress source</span>
              <select
                className="tracker-select"
                value={goalProgressSource}
                onChange={(e) => setGoalProgressSource(e.target.value as TrackerGoalProgressSource)}
                aria-label="Progress source"
              >
                {GOAL_SOURCE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="tracker-field">
              <span className="tracker-field__label">
                {goalProgressSource === 'risk_score' ? 'Target risk score (0–100)' : 'Target amount'}
              </span>
              <GlassTextField
                value={goalTarget}
                onChange={setGoalTarget}
                placeholder={goalProgressSource === 'risk_score' ? 'e.g. 45' : '500000'}
              />
            </div>
            <div className="tracker-field tracker-field--full">
              <span className="tracker-field__label">Target date (optional)</span>
              <GlassTextField value={goalDate} onChange={setGoalDate} placeholder="2030-12-31" />
            </div>
          </div>
          <p className="tracker-muted tracker-log-time-hint">
            Current {goalSourceLabel(goalProgressSource).toLowerCase()}:{' '}
            {fmtGoalMetric(newGoalLiveValue, cur, goalProgressSource)}.
            {goalProgressSource === 'portfolio_balance'
              ? ' Progress tracks from $0 → target, so the bar fills immediately based on your current holdings.'
              : goalProgressSource === 'risk_score'
                ? ' Progress tracks from 100 (max risk) → target. Bar fills right away based on your current score.'
                : goalProgressSource === 'debt_loans'
                  ? " Target is usually lower than today's balance. Bar fills as debt is paid off."
                  : ''}
          </p>
          {newGoalTargetInvalid && (
            <p className="tracker-error tracker-goal-form-error">
              {goalProgressSource === 'risk_score'
                ? 'Risk score targets must be between 0 and 100.'
                : 'Enter a valid target amount.'}
            </p>
          )}
          {newGoalInvalidSpan && (
            <p className="tracker-error tracker-goal-form-error">Target must differ from your current value.</p>
          )}
          <GlassButton
            text="Add goal"
            icon={<Plus size={18} />}
            onClick={() => void addGoal()}
            disabled={
              saving || !goalTitle.trim() || !goalTarget.trim() || newGoalTargetInvalid || newGoalInvalidSpan
            }
          />
        </GlassContainer>

        <GlassContainer padding="20px 24px" borderRadius={20} blur={0} className="tracker-card tracker-goals-panel-card">
          <div className="tracker-goals-panel-head">
            <h2 className="tracker-section-title tracker-goals-panel-head__title">Your goals</h2>
            <label className="tracker-goals-collapse-default">
              <input
                type="checkbox"
                checked={prefs.trackerGoalsCollapsedByDefault ?? false}
                onChange={(e) => updatePreferences({ trackerGoalsCollapsedByDefault: e.target.checked })}
              />
              <span>Collapse by default</span>
            </label>
          </div>
          {goals.length === 0 ? (
            <p className="tracker-muted">
              No goals yet. Add one above—portfolio, debt, and risk score come from the Portfolio and Risk tabs; net worth comes from logged entries.
            </p>
          ) : (
          <div className="tracker-goals-list">
            {goals.map((g) => {
              const currentMetric = currentValueForGoalSource(
                g.progressSource,
                latestNetWorth,
                portfolio,
                liveRiskScore
              )
              const pct = goalProgressPercent(g, currentMetric)
              const mini = goalChartData(g, currentMetric)
              const miniWithTrend = augmentSeriesWithLinearTrend(mini, {
                forecastSteps: 2,
                minPoints: 2,
                ...(g.progressSource === 'risk_score' ? { valueClamp: [0, 100] as const } : {}),
              })
              const atBaseline =
                g.progressSource === 'risk_score'
                  ? Math.round(currentMetric) === Math.round(g.baselineAmount)
                  : Math.abs(currentMetric - g.baselineAmount) < 0.01
              const reducingGoal = g.baselineAmount > g.targetAmount
              const editing = editingGoalId === g.id
              const expanded = editing || goalCardExpanded(g.id)
              return (
                <div
                  key={g.id}
                  className={`tracker-goal-card ${!expanded ? 'tracker-goal-card--collapsed' : ''}`}
                >
                  {editing ? (
                    <div className="tracker-goal-edit">
                      <div className="tracker-form-grid tracker-goal-form tracker-form-grid--single">
                        <div className="tracker-field">
                          <span className="tracker-field__label">Goal title</span>
                          <GlassTextField value={editGoalTitle} onChange={setEditGoalTitle} placeholder="Title" />
                        </div>
                        <div className="tracker-field">
                          <span className="tracker-field__label">Progress source</span>
                          <select
                            className="tracker-select"
                            value={editGoalSource}
                            onChange={(e) => setEditGoalSource(e.target.value as TrackerGoalProgressSource)}
                            aria-label="Progress source"
                          >
                            {GOAL_SOURCE_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                          <p className="tracker-muted tracker-goal-edit-hint">
                            Changing source resets the starting value to the current reading for that source.
                          </p>
                        </div>
                        <div className="tracker-field">
                          <span className="tracker-field__label">
                            {editGoalSource === 'risk_score' ? 'Target risk score (0–100)' : 'Target amount'}
                          </span>
                          <GlassTextField
                            value={editGoalTarget}
                            onChange={setEditGoalTarget}
                            placeholder={editGoalSource === 'risk_score' ? 'e.g. 45' : 'Target'}
                          />
                        </div>
                        <div className="tracker-field tracker-field--full">
                          <span className="tracker-field__label">Target date (optional)</span>
                          <GlassTextField value={editGoalDate} onChange={setEditGoalDate} placeholder="2030-12-31" />
                        </div>
                      </div>
                      {editGoalTargetInvalid && (
                        <p className="tracker-error tracker-goal-form-error">
                          {editGoalSource === 'risk_score'
                            ? 'Risk score targets must be between 0 and 100.'
                            : 'Enter a valid target amount.'}
                        </p>
                      )}
                      {editGoalInvalidSpan && (
                        <p className="tracker-error tracker-goal-form-error">Target must differ from your starting value.</p>
                      )}
                      <div className="tracker-entry-edit__actions">
                        <GlassButton
                          text={saving ? 'Saving…' : 'Save'}
                          onClick={() => void saveEditGoal()}
                          disabled={
                            saving ||
                            !editGoalTitle.trim() ||
                            !editGoalTarget.trim() ||
                            editGoalTargetInvalid ||
                            editGoalInvalidSpan
                          }
                        />
                        <button type="button" className="tracker-text-btn" onClick={cancelEditGoal} disabled={saving}>
                          <X size={16} aria-hidden /> Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                  <div className="tracker-goal-card__head">
                    <button
                      type="button"
                      className="tracker-goal-card__toggle"
                      aria-expanded={expanded}
                      aria-label={expanded ? 'Collapse goal details' : 'Expand goal details'}
                      onClick={() => toggleGoalCardExpanded(g.id)}
                    >
                      <ChevronDown
                        size={22}
                        className={expanded ? 'tracker-goal-card__chevron tracker-goal-card__chevron--open' : 'tracker-goal-card__chevron'}
                        aria-hidden
                      />
                    </button>
                    <div className="tracker-goal-card__head-main">
                      <h3 className="tracker-goal-title">{g.title}</h3>
                      {expanded ? (
                        <>
                          <p className="tracker-goal-meta">
                            {goalSourceLabel(g.progressSource)} · Target{' '}
                            {fmtGoalMetric(g.targetAmount, cur, g.progressSource)}
                            {g.targetDate ? ` by ${g.targetDate}` : ''}
                          </p>
                          <p className="tracker-goal-current">
                            Now {fmtGoalMetric(currentMetric, cur, g.progressSource)}
                            <span className="tracker-goal-baseline-hint">
                              {' '}
                              (from {fmtGoalMetric(g.baselineAmount, cur, g.progressSource)} at start)
                            </span>
                          </p>
                        </>
                      ) : null}
                    </div>
                    <div className="tracker-entry-actions">
                      <button
                        type="button"
                        className="tracker-icon-btn tracker-icon-btn--edit"
                        title="Edit goal"
                        onClick={() => startEditGoal(g)}
                      >
                        <Pencil size={18} />
                      </button>
                      <button
                        type="button"
                        className="tracker-icon-btn tracker-icon-btn--delete"
                        title="Delete goal"
                        onClick={() => void removeGoal(g.id)}
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                  {pct != null ? (
                    <>
                      <div className="tracker-progress-bar">
                        <div className="tracker-progress-bar__fill" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="tracker-progress-label">{pct.toFixed(1)}% toward target</p>
                      {expanded && pct === 0 && atBaseline ? (
                        <p className="tracker-muted tracker-progress-zero-hint">
                          {reducingGoal
                            ? 'Fill increases as this measure moves down toward your target.'
                            : 'Fill increases as this measure moves up toward your target.'}
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <p className="tracker-muted">Target must differ from your starting value.</p>
                  )}
                  {expanded && mini.length >= 2 ? (
                    <div className="tracker-mini-chart">
                      <ResponsiveContainer width="100%" height={100}>
                        <LineChart data={miniWithTrend} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                          <XAxis dataKey="dateLabel" hide />
                          <YAxis
                            hide
                            domain={
                              g.progressSource === 'risk_score'
                                ? [0, 100]
                                : ['auto', 'auto']
                            }
                          />
                          <Tooltip
                            formatter={(v: number | string, name: string) => {
                              if (v == null || typeof v !== 'number' || Number.isNaN(v)) return ['—', name]
                              return [
                                fmtGoalMetric(v, cur, g.progressSource),
                                name === 'Linear trend'
                                  ? 'Trend'
                                  : name === 'Projection'
                                    ? 'Proj.'
                                    : g.progressSource === 'risk_score'
                                      ? 'Score'
                                      : 'Value',
                              ]
                            }}
                          />
                          <Line
                            type="monotone"
                            dataKey="value"
                            stroke="var(--brand-primary)"
                            strokeWidth={2}
                            dot={mini.length <= 2 ? { r: 3, fill: 'var(--brand-primary)' } : false}
                            name="Actual"
                            connectNulls={false}
                          />
                          <Line
                            type="monotone"
                            dataKey="histTrend"
                            stroke="var(--text-tertiary)"
                            strokeWidth={1}
                            dot={false}
                            name="Linear trend"
                            connectNulls
                          />
                          <Line
                            type="monotone"
                            dataKey="futTrend"
                            stroke="#f59e0b"
                            strokeWidth={1}
                            strokeDasharray="3 2"
                            dot={false}
                            name="Projection"
                            connectNulls
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : expanded && g.progressSource === 'net_worth' ? (
                    <p className="tracker-muted tracker-mini-chart-hint">
                      Add another net worth log entry to see the trend chart.
                    </p>
                  ) : null}
                    </>
                  )}
                </div>
              )
            })}
          </div>
          )}
        </GlassContainer>
        </div>
        )}
      </div>
    </div>
  )
}


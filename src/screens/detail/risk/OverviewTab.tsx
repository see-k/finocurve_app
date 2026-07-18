import {
  AlertTriangle, ArrowUpRight, ArrowDownRight, BarChart2, BarChart3, BookOpen,
  ChevronDown, ChevronUp, Droplets, Info, Layers, RefreshCw, Target, TrendingDown,
} from 'lucide-react'
import {
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from 'recharts'
import GlassContainer from '../../../components/glass/GlassContainer'
import type { RiskAnalysisResult } from '../../../types'
import { CHART_COLORS, CONFIDENCE_META, PRIORITY_META, SHARPE_META, fmt, type LoadedAnalysis } from './riskConstants'

interface OverviewTabProps {
  effectiveRisk: RiskAnalysisResult
  loadedAnalysis: LoadedAnalysis | null
  advancedAnalysis: { sections: { title: string; content: string }[] } | null
  lastSnapshot: { timestamp: string } | null | undefined
  expandedExplainable: string | null
  setExpandedExplainable: (value: string | null) => void
  radarData: { metric: string; value: number }[]
}

export default function OverviewTab({
  effectiveRisk,
  loadedAnalysis,
  advancedAnalysis,
  lastSnapshot,
  expandedExplainable,
  setExpandedExplainable,
  radarData,
}: OverviewTabProps) {
  return (
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
  )
}

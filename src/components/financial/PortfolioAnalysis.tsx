import { useEffect, useState } from 'react'
import Panel from './Panel'
import Segmented from './Segmented'
import DataSourceSelect from './DataSourceSelect'
import ValuationDisclosure from './ValuationDisclosure'
import Delta from './Delta'
import ContributionChart from './ContributionChart'
import CostValueChart from './CostValueChart'
import ValueOverTimeChart from './ValueOverTimeChart'
import { PERFORMANCE_PERIODS, type PerformanceSeries } from '../../hooks/usePerformanceSeries'
import type { Asset, PerformancePeriod } from '../../types'

export type AnalysisView = 'contribution' | 'costValue' | 'overTime'

const VIEWS: readonly AnalysisView[] = ['contribution', 'costValue', 'overTime'] as const

const VIEW_LABELS: Record<AnalysisView, string> = {
  contribution: 'Contribution',
  costValue: 'Cost vs value',
  overTime: 'Value over time',
}

const VIEW_NOTES: Record<AnalysisView, string> = {
  contribution: 'Unrealized gain or loss each position contributes, from stored cost basis and current marks.',
  costValue: 'Capital deployed against what each position is worth now.',
  overTime: 'Observed portfolio value across the selected window.',
}

interface PortfolioAnalysisProps {
  holdings: Asset[]
  grossAssets: number
  performance: PerformanceSeries
  onSelectAsset?: (asset: Asset) => void
  /** ISO currency for every money figure in the analysis views. */
  currency?: string
  /** Rows before smaller positions are grouped into "Other". */
  maxRows?: number
  height?: number
  title?: string
}

/**
 * The account's analysis panel.
 *
 * Defaults to a view computed from stored positions, which is always available
 * and always accurate. The time series is offered alongside it and enabled only
 * when a real observed series exists.
 */
export default function PortfolioAnalysis({
  holdings,
  grossAssets,
  performance,
  onSelectAsset,
  currency = 'USD',
  maxRows = 10,
  height = 280,
  title = 'Analysis',
}: PortfolioAnalysisProps) {
  const [view, setView] = useState<AnalysisView>('contribution')
  const [showTrend, setShowTrend] = useState(false)

  // The trend overlay only describes a plotted series; drop it when the series goes away.
  useEffect(() => {
    if ((!performance.hasRealData || performance.data.length < 3) && showTrend) setShowTrend(false)
  }, [performance.hasRealData, performance.data.length, showTrend])

  const isOverTime = view === 'overTime'
  const trendAvailable = performance.hasRealData && performance.data.length >= 3
  const activeSource = performance.sources.find((s) => s.id === performance.dataSource)

  const note = isOverTime && performance.hasRealData
    ? (
      <span className="fin-chart-note">
        {activeSource?.label}
        {activeSource && activeSource.pointCount > 0 && (
          <>
            <span className="fin-masthead__sep"> · </span>
            <span className="fin-num">{activeSource.pointCount}</span> observations
          </>
        )}
        {performance.periodChange && (
          <>
            <span className="fin-masthead__sep"> · </span>
            {performance.period} change <Delta value={performance.periodChange.amount} currency={currency} size="sm" />
          </>
        )}
      </span>
    )
    : VIEW_NOTES[view]

  return (
    <Panel
      title={title}
      note={note}
      actions={
        <>
          {isOverTime && trendAvailable && (
            <button
              type="button"
              className={`fin-btn fin-chart-trend-toggle ${showTrend ? 'fin-chart-trend-toggle--on' : ''}`.trim()}
              aria-pressed={showTrend}
              onClick={() => setShowTrend((on) => !on)}
              title="Overlay a least-squares fit and extend it forward. Illustrative only."
            >
              Trend fit
            </button>
          )}
          {isOverTime && (
            <DataSourceSelect
              sources={performance.sources}
              value={performance.sourcePreference}
              onChange={performance.setSourcePreference}
              resolved={performance.dataSource}
              fellBack={performance.fellBack}
              loading={performance.loading}
            />
          )}
          {isOverTime && (
            <Segmented
              options={PERFORMANCE_PERIODS}
              value={performance.period}
              onChange={(p: PerformancePeriod) => performance.setPeriod(p)}
              ariaLabel="Performance period"
            />
          )}
          <Segmented
            options={VIEWS}
            value={view}
            onChange={setView}
            labelFor={(v) => VIEW_LABELS[v]}
            ariaLabel="Analysis view"
          />
        </>
      }
      footer={
        isOverTime
          ? (performance.provenance && (
            <ValuationDisclosure provenance={performance.provenance} label="Performance series" compact />
          ))
          : (
            <ValuationDisclosure
              provenance={performance.portfolioProvenance}
              label="Position valuations"
              compact
            />
          )
      }
    >
      {view === 'contribution' && (
        <ContributionChart
          holdings={holdings}
          grossAssets={grossAssets}
          maxRows={maxRows}
          onSelect={onSelectAsset}
          currency={currency}
        />
      )}
      {view === 'costValue' && (
        <CostValueChart holdings={holdings} maxRows={maxRows} onSelect={onSelectAsset} currency={currency} />
      )}
      {view === 'overTime' && (
        <ValueOverTimeChart performance={performance} showTrend={showTrend} height={height} currency={currency} />
      )}
    </Panel>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Layer, Rectangle, ResponsiveContainer, Sankey, Tooltip } from 'recharts'
import {
  BriefcaseBusiness, FileText, GitBranch, Landmark, PieChart as PieIcon, Plus, Search, X,
} from 'lucide-react'
import PageGround from '../../components/financial/PageGround'
import Panel from '../../components/financial/Panel'
import KeyFigures from '../../components/financial/KeyFigures'
import Delta from '../../components/financial/Delta'
import Segmented from '../../components/financial/Segmented'
import PortfolioAnalysis from '../../components/financial/PortfolioAnalysis'
import AllocationBreakdown from '../../components/financial/AllocationBreakdown'
import HoldingsTable from '../../components/financial/HoldingsTable'
import LiabilitiesTable from '../../components/financial/LiabilitiesTable'
import ValuationDisclosure from '../../components/financial/ValuationDisclosure'
import { usePortfolio } from '../../store/usePortfolio'
import { usePerformanceSeries } from '../../hooks/usePerformanceSeries'
import { deriveAccountTotals } from '../../lib/accountTotals'
import { formatProvenanceAsOf } from '../../lib/financialProvenance'
import { formatCurrency, formatPercentSigned, formatWeight, splitCurrency } from '../../lib/formatMoney'
import type { Asset } from '../../types'
import {
  ASSET_TYPE_LABELS, SECTOR_LABELS, assetCurrentValue, isLoan, loanBalance,
} from '../../types'
import './PortfolioScreen.css'

type AllocationView = 'type' | 'sector' | 'country'

const ALLOCATION_VIEWS: readonly AllocationView[] = ['type', 'sector', 'country'] as const
const ALLOCATION_VIEW_LABELS: Record<AllocationView, string> = {
  type: 'Asset class',
  sector: 'Sector',
  country: 'Geography',
}

/** Individually named nodes in the flow diagram before the tail is grouped. */
const FLOW_NAMED_HOLDINGS = 6

/**
 * Fixed categorical order, matching the allocation donut. Slot 8 is deliberately
 * omitted: it is a red step, and red is reserved here for liabilities.
 */
const FLOW_COLORS = [
  'var(--fin-cat-1)', 'var(--fin-cat-2)', 'var(--fin-cat-3)', 'var(--fin-cat-4)',
  'var(--fin-cat-5)', 'var(--fin-cat-6)', 'var(--fin-cat-7)',
]

export default function PortfolioScreen() {
  const navigate = useNavigate()
  const { portfolio, totalValue, loadDemo } = usePortfolio()

  const [allocView, setAllocView] = useState<AllocationView>('type')
  const [showAddModal, setShowAddModal] = useState(false)
  const [selectedFlowNode, setSelectedFlowNode] = useState<number | null>(null)

  const assets = useMemo(() => portfolio?.assets ?? [], [portfolio?.assets])
  const hasAssets = assets.length > 0

  // Cost, gain and return are reported over investable holdings; liabilities are
  // stated separately so a mortgage's negative basis cannot distort the rate.
  const totals = useMemo(() => deriveAccountTotals(assets), [assets])
  const { holdings, loans, grossAssets, totalLiabilities, investedCost, unrealizedGain, totalReturnPercent } = totals

  const performance = usePerformanceSeries(assets, totalValue, grossAssets, hasAssets, {
    withTrend: true,
  })

  // Allocation is always measured over investable holdings, so the denominator
  // stays gross assets and no slice can be negative.
  const allocation = useMemo(() => {
    const groups = new Map<string, number>()
    for (const asset of holdings) {
      let key: string
      if (allocView === 'type') key = ASSET_TYPE_LABELS[asset.type] ?? asset.type
      else if (allocView === 'sector') key = SECTOR_LABELS[asset.sector ?? 'other'] ?? 'Other'
      else key = asset.country || 'Unspecified'
      groups.set(key, (groups.get(key) ?? 0) + assetCurrentValue(asset))
    }
    return Array.from(groups, ([name, value]) => ({ name, value }))
  }, [holdings, allocView])

  const flow = useMemo(() => buildFlowGraph(holdings, loans), [holdings, loans])

  if (!hasAssets) {
    return (
      <div className="portfolio-empty">
        <BriefcaseBusiness size={36} aria-hidden />
        <h2>No positions on file</h2>
        <p>Add holdings and liabilities, or load a demonstration portfolio to explore the reports.</p>
        <div className="portfolio-empty__actions">
          <button type="button" className="fin-btn fin-btn--accent" onClick={() => navigate('/add-asset/search')}>
            <Plus size={14} aria-hidden /> Add position
          </button>
          <button type="button" className="fin-btn" onClick={loadDemo}>Load demo portfolio</button>
        </div>
      </div>
    )
  }

  const gainPositive = unrealizedGain >= 0
  const hero = splitCurrency(totalValue, portfolio!.currency)
  const asOf = formatProvenanceAsOf(performance.portfolioProvenance.asOf)

  function openAsset(asset: Asset) {
    navigate(isLoan(asset) ? `/main/loan/${asset.id}` : `/asset/${asset.id}`)
  }

  return (
    <div className="fin-page portfolio">
      <PageGround />

      <header className="fin-masthead">
        <div className="fin-masthead__id">
          <div className="fin-masthead__eyebrow">
            <strong>{portfolio!.name}</strong>
            <span className="fin-masthead__sep">/</span>
            <span>{portfolio!.currency}</span>
            <span className="fin-masthead__sep">/</span>
            <span>{assets.length} {assets.length === 1 ? 'line item' : 'line items'}</span>
          </div>

          <div className="fin-masthead__value">
            <span className="fin-masthead__amount">
              {hero.whole}<span className="fin-masthead__cents">{hero.cents}</span>
            </span>
            <Delta value={unrealizedGain} currency={portfolio!.currency} pill />
            <Delta value={totalReturnPercent} kind="percent" pill />
          </div>

          <div className="fin-masthead__sub">
            <span>Net worth, assets less liabilities</span>
            <span>Change shown on invested capital</span>
            <span>As of {asOf}</span>
          </div>
        </div>

        <div className="fin-masthead__actions">
          <button type="button" className="fin-btn fin-btn--accent" onClick={() => setShowAddModal(true)}>
            <Plus size={14} aria-hidden /> Add position
          </button>
        </div>
      </header>

      <div className="fin-stack portfolio__stack">
        <KeyFigures
          figures={[
            {
              label: 'Gross assets',
              value: formatCurrency(grossAssets, portfolio!.currency),
              meta: `${holdings.length} ${holdings.length === 1 ? 'position' : 'positions'}`,
            },
            {
              label: 'Liabilities',
              value: totalLiabilities > 0 ? formatCurrency(totalLiabilities, portfolio!.currency) : '—',
              meta: loans.length > 0
                ? `${loans.length} ${loans.length === 1 ? 'obligation' : 'obligations'}`
                : 'None on file',
            },
            {
              label: 'Invested cost',
              value: formatCurrency(investedCost, portfolio!.currency),
              meta: 'Capital deployed in holdings',
            },
            {
              label: 'Unrealized gain/loss',
              value: formatCurrency(unrealizedGain, portfolio!.currency),
              meta: 'Holdings against invested cost',
              tone: gainPositive ? 'positive' : 'negative',
            },
            {
              label: 'Total return',
              value: formatPercentSigned(totalReturnPercent),
              meta: 'On invested cost',
              tone: gainPositive ? 'positive' : 'negative',
            },
          ]}
        />

        <PortfolioAnalysis
          holdings={holdings}
          grossAssets={grossAssets}
          performance={performance}
          onSelectAsset={openAsset}
          currency={portfolio!.currency}
          maxRows={12}
          height={260}
        />

        <Panel
          title="Allocation"
          icon={<PieIcon size={14} aria-hidden />}
          note={`By ${ALLOCATION_VIEW_LABELS[allocView].toLowerCase()}, as a share of gross assets.`}
          actions={
            <Segmented
              options={ALLOCATION_VIEWS}
              value={allocView}
              onChange={setAllocView}
              labelFor={(view) => ALLOCATION_VIEW_LABELS[view]}
              ariaLabel="Allocation breakdown"
            />
          }
          footer={
            <ValuationDisclosure
              provenance={performance.portfolioProvenance}
              label="Allocation basis"
              compact
            />
          }
        >
          <AllocationBreakdown data={allocation} total={grossAssets} size={190} currency={portfolio!.currency} />
        </Panel>

        {flow && (
          <Panel
            title="Capital flow"
            icon={<GitBranch size={14} aria-hidden />}
            note="Positions into asset classes into gross assets. Liabilities are shown separately, not netted."
            actions={
              selectedFlowNode != null ? (
                <button type="button" className="fin-btn" onClick={() => setSelectedFlowNode(null)}>
                  <X size={13} aria-hidden /> Clear selection
                </button>
              ) : (
                <span className="fin-label">Select a node to isolate it</span>
              )
            }
          >
            <div className="portfolio-flow" onClick={() => setSelectedFlowNode(null)}>
              <ResponsiveContainer width="100%" height={Math.max(300, flow.data.nodes.length * 30 + 50)}>
                <Sankey
                  data={flow.data}
                  nodeWidth={12}
                  nodePadding={16}
                  linkCurvature={0.5}
                  margin={{ top: 8, right: 132, bottom: 8, left: 8 }}
                  node={
                    <FlowNode
                      selected={selectedFlowNode}
                      onSelect={setSelectedFlowNode}
                      meta={flow.meta}
                      currency={portfolio!.currency}
                    />
                  }
                  link={<FlowLink selected={selectedFlowNode} linkMeta={flow.linkMeta} />}
                >
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const value = payload[0]?.value
                      if (typeof value !== 'number') return null
                      return (
                        <div className="fin-chart-tip">
                          <div className="fin-chart-tip__label">Flow</div>
                          <div className="fin-chart-tip__row">
                            <span className="fin-chart-tip__key" style={{ paddingLeft: 0 }}>Value</span>
                            <span className="fin-chart-tip__value fin-num">
                              {formatCurrency(value, portfolio!.currency)}
                            </span>
                          </div>
                        </div>
                      )
                    }}
                  />
                </Sankey>
              </ResponsiveContainer>
            </div>

            {selectedFlowNode != null && flow.meta[selectedFlowNode] && (
              <div className="portfolio-flow__detail">
                <span
                  className="portfolio-flow__detail-swatch"
                  style={{ background: nodeColor(selectedFlowNode, flow.meta) }}
                  aria-hidden
                />
                <span className="portfolio-flow__detail-name">{flow.meta[selectedFlowNode].fullName}</span>
                <span className="fin-tag">{flow.meta[selectedFlowNode].kind}</span>
                <span className="portfolio-flow__detail-value fin-num">
                  {formatCurrency(flow.meta[selectedFlowNode].value, portfolio!.currency)}
                </span>
                {flow.meta[selectedFlowNode].percent != null && (
                  <span className="portfolio-flow__detail-pct fin-num">
                    {formatWeight(flow.meta[selectedFlowNode].percent!)}
                  </span>
                )}
              </div>
            )}
          </Panel>
        )}

        <Panel
          title="Positions"
          count={`${holdings.length}`}
          note="Sortable. Each row carries the source and as-of date behind its valuation."
          flushBody
        >
          <HoldingsTable assets={holdings} totalValue={grossAssets} onSelect={openAsset} currency={portfolio!.currency} />
        </Panel>

        <Panel
          title="Liabilities"
          count={loans.length > 0 ? `${loans.length}` : undefined}
          icon={<Landmark size={14} aria-hidden />}
          note="Outstanding balances, shown against original principal."
          flushBody={loans.length > 0}
        >
          <LiabilitiesTable loans={loans} onSelect={openAsset} currency={portfolio!.currency} />
        </Panel>
      </div>

      {showAddModal && (
        <AddPositionDialog
          onClose={() => setShowAddModal(false)}
          onPick={(path) => {
            setShowAddModal(false)
            navigate(path)
          }}
        />
      )}
    </div>
  )
}

/* ── Add position dialog ─────────────────────────────────────────────────── */

const ADD_OPTIONS = [
  {
    path: '/add-asset/search',
    icon: <Search size={16} aria-hidden />,
    title: 'Listed security',
    body: 'Search stocks, ETFs and crypto. Prices and history come from the market data provider.',
  },
  {
    path: '/add-asset/manual',
    icon: <FileText size={16} aria-hidden />,
    title: 'Private or manual holding',
    body: 'Property, private equity, collectibles and anything you mark yourself.',
  },
  {
    path: '/add-asset/loan',
    icon: <Landmark size={16} aria-hidden />,
    title: 'Loan or liability',
    body: 'Mortgages, credit lines and term debt, tracked against original principal.',
  },
]

function AddPositionDialog({
  onClose, onPick,
}: {
  onClose: () => void
  onPick: (path: string) => void
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)

  useEffect(() => {
    previouslyFocused.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const root = dialogRef.current
    const focusables = () =>
      Array.from(root?.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])') ?? [])
        .filter((el) => !el.hasAttribute('disabled'))

    focusables()[0]?.focus()

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previouslyFocused.current?.focus()
    }
  }, [onClose])

  return (
    <div className="portfolio-dialog__scrim" onClick={onClose} role="presentation">
      <div
        ref={dialogRef}
        className="portfolio-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-position-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="portfolio-dialog__head">
          <h2 id="add-position-title" className="fin-panel__title">Add position</h2>
          <button type="button" className="fin-btn fin-btn--icon" onClick={onClose} aria-label="Close">
            <X size={15} aria-hidden />
          </button>
        </header>
        <div className="portfolio-dialog__body">
          {ADD_OPTIONS.map((option) => (
            <button
              key={option.path}
              type="button"
              className="portfolio-dialog__option"
              onClick={() => onPick(option.path)}
            >
              <span className="fin-mark">{option.icon}</span>
              <span className="portfolio-dialog__option-text">
                <span className="portfolio-dialog__option-title">{option.title}</span>
                <span className="portfolio-dialog__option-body">{option.body}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── Capital flow graph ──────────────────────────────────────────────────── */

interface FlowMeta {
  fullName: string
  value: number
  percent?: number
  kind: 'position' | 'class' | 'total' | 'liability' | 'loan'
  /** Resolved at build time so colour follows the entity, never the node index. */
  color: string
}

/**
 * Per-link metadata, parallel to `data.links`.
 *
 * Recharts resolves `payload.source`/`payload.target` to node objects rather than
 * indices, so the link renderer reads endpoints from here — keyed by the link
 * index it is handed — instead of digging them out of the payload.
 */
interface FlowLinkMeta {
  sourceIndex: number
  targetIndex: number
  color: string
}

interface FlowGraph {
  data: { nodes: { name: string }[]; links: { source: number; target: number; value: number }[] }
  meta: FlowMeta[]
  linkMeta: FlowLinkMeta[]
}

function buildFlowGraph(holdings: Asset[], loans: Asset[]): FlowGraph | null {
  if (holdings.length === 0) return null

  const sorted = [...holdings]
    .map((asset) => ({ asset, value: assetCurrentValue(asset) }))
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value)
  const gross = sorted.reduce((sum, row) => sum + row.value, 0)
  if (gross <= 0) return null

  const classTotals = new Map<string, number>()
  for (const { asset, value } of sorted) {
    const label = ASSET_TYPE_LABELS[asset.type] ?? asset.type
    classTotals.set(label, (classTotals.get(label) ?? 0) + value)
  }
  // Classes rank by weight so the hues line up with the allocation donut, and a
  // position inherits its class's hue — a ribbon keeps one colour end to end.
  const classes = Array.from(classTotals.keys())
    .filter((label) => (classTotals.get(label) ?? 0) > 0)
    .sort((a, b) => classTotals.get(b)! - classTotals.get(a)!)
  const classColors = new Map(
    classes.map((label, i) => [label, FLOW_COLORS[i] ?? 'var(--fin-cat-other)'])
  )
  const colorFor = (label: string) => classColors.get(label) ?? 'var(--fin-cat-other)'

  const nodes: { name: string }[] = []
  const links: { source: number; target: number; value: number }[] = []
  const meta: FlowMeta[] = []

  const named = sorted.slice(0, FLOW_NAMED_HOLDINGS)
  const tail = sorted.slice(FLOW_NAMED_HOLDINGS)

  // Positions past the named cap are grouped by class rather than each taking a node.
  const tailByClass = new Map<string, number>()
  for (const { asset, value } of tail) {
    const label = ASSET_TYPE_LABELS[asset.type] ?? asset.type
    tailByClass.set(label, (tailByClass.get(label) ?? 0) + value)
  }

  for (const { asset, value } of named) {
    nodes.push({ name: asset.symbol || asset.name })
    meta.push({
      fullName: asset.name,
      value,
      percent: (value / gross) * 100,
      kind: 'position',
      color: colorFor(ASSET_TYPE_LABELS[asset.type] ?? asset.type),
    })
  }

  const tailKeys = Array.from(tailByClass.keys()).filter((k) => (tailByClass.get(k) ?? 0) > 0)
  for (const key of tailKeys) {
    const value = tailByClass.get(key)!
    nodes.push({ name: `Other ${key}` })
    meta.push({
      fullName: `Other ${key}`,
      value,
      percent: (value / gross) * 100,
      kind: 'position',
      color: colorFor(key),
    })
  }

  const classStart = nodes.length
  for (const label of classes) {
    const value = classTotals.get(label)!
    nodes.push({ name: label })
    meta.push({
      fullName: label,
      value,
      percent: (value / gross) * 100,
      kind: 'class',
      color: colorFor(label),
    })
  }

  const totalIndex = nodes.length
  nodes.push({ name: 'Gross assets' })
  meta.push({ fullName: 'Gross assets', value: gross, kind: 'total', color: 'var(--brand-primary)' })

  named.forEach(({ asset, value }, i) => {
    const label = ASSET_TYPE_LABELS[asset.type] ?? asset.type
    links.push({
      source: i,
      target: classStart + classes.indexOf(label),
      value,
    })
  })
  tailKeys.forEach((key, i) => {
    links.push({
      source: named.length + i,
      target: classStart + classes.indexOf(key),
      value: tailByClass.get(key)!,
    })
  })
  classes.forEach((label, i) => {
    links.push({ source: classStart + i, target: totalIndex, value: classTotals.get(label)! })
  })

  const activeLoans = loans
    .map((loan) => ({ loan, balance: loanBalance(loan) }))
    .filter((row) => row.balance > 0)
  if (activeLoans.length > 0) {
    const totalDebt = activeLoans.reduce((sum, row) => sum + row.balance, 0)
    const liabilityIndex = nodes.length
    nodes.push({ name: 'Liabilities' })
    meta.push({
      fullName: 'Total liabilities', value: totalDebt, kind: 'liability', color: 'var(--fin-neg)',
    })
    for (const { loan, balance } of activeLoans) {
      const index = nodes.length
      nodes.push({ name: loan.name })
      meta.push({
        fullName: loan.name,
        value: balance,
        percent: totalDebt > 0 ? (balance / totalDebt) * 100 : 0,
        kind: 'loan',
        color: 'var(--fin-neg)',
      })
      links.push({ source: index, target: liabilityIndex, value: balance })
    }
  }

  const linkMeta: FlowLinkMeta[] = links.map((link) => ({
    sourceIndex: link.source,
    targetIndex: link.target,
    color: meta[link.source]?.color ?? 'var(--fin-cat-other)',
  }))

  return { data: { nodes, links }, meta, linkMeta }
}

function nodeColor(index: number, meta: FlowMeta[]): string {
  return meta[index]?.color ?? 'var(--fin-cat-other)'
}

interface FlowNodeProps {
  x?: number
  y?: number
  width?: number
  height?: number
  index?: number
  payload?: { name?: string }
  selected: number | null
  onSelect: (index: number | null) => void
  meta: FlowMeta[]
  currency: string
}

function FlowNode({
  x, y, width, height, index = 0, payload, selected, onSelect, meta, currency,
}: FlowNodeProps) {
  if (x == null || y == null || width == null || height == null) return null

  const fill = nodeColor(index, meta)
  const name = payload?.name ?? ''
  const label = name.length > 16 ? `${name.slice(0, 15)}…` : name
  const isSelected = selected === index
  const isDimmed = selected != null && !isSelected
  const entry = meta[index]

  function select(e: { stopPropagation: () => void }) {
    e.stopPropagation()
    onSelect(isSelected ? null : index)
  }

  return (
    <Layer key={`node-${index}`}>
      <g
        role="button"
        tabIndex={0}
        aria-pressed={isSelected}
        aria-label={
          entry
            ? `${entry.fullName}, ${formatCurrency(entry.value, currency)}. Select for details.`
            : `${name}. Select for details.`
        }
        style={{ cursor: 'pointer' }}
        onClick={select}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            select(event)
          }
        }}
      >
      <Rectangle
        x={x}
        y={y}
        width={width}
        height={height}
        fill={fill}
        fillOpacity={isDimmed ? 0.28 : 1}
        radius={2}
      />
      <text
        x={x + width + 8}
        y={y + height / 2}
        textAnchor="start"
        dominantBaseline="central"
        style={{
          fontSize: 11,
          fontWeight: isSelected ? 700 : 600,
          fill: isDimmed ? 'var(--text-tertiary)' : 'var(--text-secondary)',
        }}
      >
        {label}
        {isSelected && entry ? ` · ${formatCurrency(entry.value, currency)}` : ''}
      </text>
      </g>
    </Layer>
  )
}

interface FlowLinkProps {
  sourceX?: number
  sourceY?: number
  sourceControlX?: number
  targetX?: number
  targetY?: number
  targetControlX?: number
  linkWidth?: number
  index?: number
  selected: number | null
  linkMeta: FlowLinkMeta[]
}

function FlowLink({
  sourceX, sourceY, sourceControlX, targetX, targetY, targetControlX,
  linkWidth, index, selected, linkMeta,
}: FlowLinkProps) {
  if (sourceX == null || targetX == null) return null

  const link = index == null ? undefined : linkMeta[index]
  const isHighlighted = selected != null && link != null
    && (link.sourceIndex === selected || link.targetIndex === selected)
  const isDimmed = selected != null && !isHighlighted

  return (
    <Layer key={`link-${index}`}>
      <path
        d={`M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`}
        fill="none"
        // The ribbon carries its source's colour, so a flow is one hue end to end.
        stroke={link?.color ?? 'var(--fin-cat-other)'}
        strokeWidth={linkWidth}
        strokeOpacity={isDimmed ? 0.06 : isHighlighted ? 0.55 : 0.26}
      />
    </Layer>
  )
}

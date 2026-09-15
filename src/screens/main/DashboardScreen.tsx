import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bell, BriefcaseBusiness, ChevronRight, Landmark, Newspaper, PieChart as PieIcon,
  Shield, TrendingDown, TrendingUp,
} from 'lucide-react'
import { analyzePortfolio } from '../../services/riskAnalysis'
import { RISK_LEVEL_META } from '../../constants/riskMeta'
import AssetLogo from '../../components/AssetLogo'
import UserAvatar, { getInitials } from '../../components/UserAvatar'
import EnterpriseSection from '../../components/financial/EnterpriseSection'
import PageGround from '../../components/financial/PageGround'
import Panel from '../../components/financial/Panel'
import KeyFigures from '../../components/financial/KeyFigures'
import Delta from '../../components/financial/Delta'
import PortfolioAnalysis from '../../components/financial/PortfolioAnalysis'
import AllocationBreakdown from '../../components/financial/AllocationBreakdown'
import HoldingsTable from '../../components/financial/HoldingsTable'
import LiabilitiesTable from '../../components/financial/LiabilitiesTable'
import ValuationDisclosure from '../../components/financial/ValuationDisclosure'
import { usePortfolio } from '../../store/usePortfolio'
import { usePreferences } from '../../store/usePreferences'
import { useNotifications } from '../../store/useNotifications'
import { usePerformanceSeries } from '../../hooks/usePerformanceSeries'
import { useEnterpriseMode } from '../../hooks/useEnterpriseMode'
import { deriveAccountTotals } from '../../lib/accountTotals'
import { deriveCalculatedProvenance, formatProvenanceAsOf } from '../../lib/financialProvenance'
import {
  formatCurrency, formatPercentSigned, formatWeight, splitCurrency,
} from '../../lib/formatMoney'
import type { Asset } from '../../types'
import { ASSET_TYPE_LABELS, assetCurrentValue, assetGainLossPercent, isLoan } from '../../types'
import './DashboardScreen.css'

/** Positions listed inline before the reader is sent to the full holdings screen. */
const DASHBOARD_HOLDINGS_LIMIT = 6
/** Movers shown per side of the leaders/laggards split. */
const MOVERS_PER_SIDE = 5

export default function DashboardScreen() {
  const navigate = useNavigate()
  const { portfolio, totalValue, loadDemo } = usePortfolio()
  const { prefs } = usePreferences()
  const { unreadCount } = useNotifications()
  const { isEnterprise } = useEnterpriseMode()

  const userName = prefs.userName || prefs.userEmail?.split('@')[0] || 'Investor'

  const assets = useMemo(() => portfolio?.assets ?? [], [portfolio?.assets])
  const hasAssets = assets.length > 0

  // Cost, gain and return are reported over investable holdings; liabilities are
  // stated separately so a mortgage's negative basis cannot distort the rate.
  const totals = useMemo(() => deriveAccountTotals(assets), [assets])
  const { holdings, loans, grossAssets, totalLiabilities, investedCost, unrealizedGain, totalReturnPercent } = totals

  const performance = usePerformanceSeries(assets, totalValue, grossAssets, hasAssets, {
    withTrend: true,
  })

  const allocation = useMemo(() => {
    const groups = new Map<string, number>()
    for (const asset of holdings) {
      const label = ASSET_TYPE_LABELS[asset.type] ?? asset.type
      groups.set(label, (groups.get(label) ?? 0) + assetCurrentValue(asset))
    }
    return Array.from(groups, ([name, value]) => ({ name, value }))
  }, [holdings])

  const movers = useMemo(() => {
    const scored = holdings
      .map((asset) => ({ asset, pct: assetGainLossPercent(asset) }))
      .filter((row) => Number.isFinite(row.pct) && row.pct !== 0)
      .sort((a, b) => b.pct - a.pct)
    return {
      leaders: scored.filter((r) => r.pct > 0).slice(0, MOVERS_PER_SIDE),
      laggards: scored.filter((r) => r.pct < 0).reverse().slice(0, MOVERS_PER_SIDE),
    }
  }, [holdings])

  // Risk is measured on investable assets only; including liabilities produces
  // negative weights once debt outweighs holdings.
  const riskResult = useMemo(
    () => (holdings.length > 0 && grossAssets > 0
      ? analyzePortfolio(holdings, grossAssets, totalReturnPercent)
      : null),
    [holdings, grossAssets, totalReturnPercent]
  )
  const riskMeta = riskResult ? RISK_LEVEL_META[riskResult.riskLevel] : null

  const riskProvenance = useMemo(
    () => deriveCalculatedProvenance(performance.portfolioProvenance, 'FinoCurve risk engine', 'risk_model'),
    [performance.portfolioProvenance]
  )

  if (!hasAssets) {
    return (
      <div className="dashboard-empty">
        <BriefcaseBusiness size={36} aria-hidden />
        <h2>No holdings on file</h2>
        <p>
          Add positions, or load a demonstration portfolio to see how balances, allocation and
          risk are reported.
        </p>
        <button type="button" className="fin-btn fin-btn--accent" onClick={loadDemo}>
          Load demo portfolio
        </button>
      </div>
    )
  }

  const gainPositive = unrealizedGain >= 0
  const currency = portfolio!.currency
  const hero = splitCurrency(totalValue, currency)
  const asOf = formatProvenanceAsOf(performance.portfolioProvenance.asOf)

  function openAsset(asset: Asset) {
    navigate(isLoan(asset) ? `/main/loan/${asset.id}` : `/asset/${asset.id}`)
  }

  return (
    <div className="fin-page dashboard">
      <PageGround />

      {/* ── Masthead: whose account, worth how much, as of when ── */}
      <header className="fin-masthead">
        <div className="fin-masthead__id">
          <div className="fin-masthead__eyebrow">
            <UserAvatar
              src={prefs.profilePicturePath}
              initials={getInitials(userName)}
              size={22}
              className="dash-avatar"
              showEnterpriseIndicator
            />
            <strong>{userName}</strong>
            <span className="fin-masthead__sep">/</span>
            <span>{portfolio!.name}</span>
            <span className="fin-masthead__sep">/</span>
            <span>{portfolio!.currency}</span>
          </div>

          <div className="fin-masthead__value">
            <span className="fin-masthead__amount">
              {hero.whole}<span className="fin-masthead__cents">{hero.cents}</span>
            </span>
            <Delta value={unrealizedGain} currency={currency} pill />
            <Delta value={totalReturnPercent} kind="percent" pill />
          </div>

          <div className="fin-masthead__sub">
            <span>Net worth, assets less liabilities</span>
            <span>Change shown on invested capital</span>
            <span>As of {asOf}</span>
          </div>
        </div>

        <div className="fin-masthead__actions">
          <button
            type="button"
            className="fin-btn fin-btn--icon"
            onClick={() => navigate('/main?tab=news')}
            title="News"
            aria-label="News"
          >
            <Newspaper size={16} aria-hidden />
          </button>
          <button
            type="button"
            className="fin-btn fin-btn--icon"
            onClick={() => navigate('/notifications')}
            title="Notifications"
            aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
          >
            <Bell size={16} aria-hidden />
            {unreadCount > 0 && (
              <span className="dash-notif-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
            )}
          </button>
        </div>
      </header>

      <div className="fin-stack dashboard__stack">
        {/* ── The figures a reader checks first ── */}
        <KeyFigures
          figures={[
            {
              label: 'Gross assets',
              value: formatCurrency(grossAssets, currency),
              meta: `${holdings.length} ${holdings.length === 1 ? 'position' : 'positions'}`,
            },
            {
              label: 'Liabilities',
              value: totalLiabilities > 0 ? formatCurrency(totalLiabilities, currency) : '—',
              meta: loans.length > 0
                ? `${loans.length} ${loans.length === 1 ? 'obligation' : 'obligations'}`
                : 'None on file',
            },
            {
              label: 'Invested cost',
              value: formatCurrency(investedCost, currency),
              meta: 'Capital deployed in holdings',
            },
            {
              label: 'Unrealized gain/loss',
              value: formatCurrency(unrealizedGain, currency),
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

        {/* ── Enterprise: consolidated custody, subscribers only ── */}
        <EnterpriseSection
          enabled={isEnterprise}
          onOpenEnterprise={() => navigate('/main?tab=enterprise')}
        />

        <PortfolioAnalysis
          holdings={holdings}
          grossAssets={grossAssets}
          performance={performance}
          onSelectAsset={openAsset}
          currency={currency}
          maxRows={8}
          title="Portfolio analysis"
        />

        <div className="fin-row-2">
          {/* ── Risk ── */}
          <Panel
            title="Risk profile"
            icon={<Shield size={14} aria-hidden />}
            note={riskMeta ? riskMeta.desc : 'Measured on investable assets, excluding liabilities.'}
            actions={
              <span className="fin-btn" aria-hidden>
                Full analysis <ChevronRight size={13} />
              </span>
            }
            onClick={() => navigate('/risk-analysis')}
            footer={<ValuationDisclosure provenance={riskProvenance} label="Risk metrics" compact />}
          >
            {riskResult && riskMeta ? (
              <div className="dash-risk">
                <div className="dash-risk__score">
                  <span className="dash-risk__number fin-num">{riskResult.riskScore}</span>
                  <span className="fin-label">of 100</span>
                  <span
                    className="dash-risk__band"
                    style={{ color: riskMeta.color, borderColor: riskMeta.color }}
                  >
                    {riskMeta.label}
                  </span>
                </div>
                <dl className="dash-risk__metrics">
                  <div>
                    <dt className="fin-label">Sharpe ratio</dt>
                    <dd className="fin-num">{riskResult.sharpeRatio}</dd>
                  </div>
                  <div>
                    <dt className="fin-label">Ann. volatility</dt>
                    <dd className="fin-num">{formatWeight(riskResult.annualizedVolatility)}</dd>
                  </div>
                  <div>
                    <dt className="fin-label">Max drawdown</dt>
                    <dd className="fin-num fin-neg">−{formatWeight(riskResult.maxDrawdownPercent)}</dd>
                  </div>
                </dl>
              </div>
            ) : (
              <div className="fin-empty">
                <span className="fin-empty__title">Not enough data</span>
                <span className="fin-empty__body">Risk is computed once investable holdings are on file.</span>
              </div>
            )}
          </Panel>

          {/* ── Allocation ── */}
          <Panel
            title="Asset allocation"
            icon={<PieIcon size={14} aria-hidden />}
            note="By asset class, as a share of gross assets."
          >
            <AllocationBreakdown data={allocation} total={grossAssets} currency={currency} />
          </Panel>
        </div>

        {/* ── Movers, split by direction rather than scrolled past ── */}
        <div className="fin-row-2">
          <MoversPanel
            title="Leaders"
            icon={<TrendingUp size={14} aria-hidden />}
            rows={movers.leaders}
            emptyText="No positions are up against cost basis."
            currency={currency}
            onSelect={openAsset}
          />
          <MoversPanel
            title="Laggards"
            icon={<TrendingDown size={14} aria-hidden />}
            rows={movers.laggards}
            emptyText="No positions are down against cost basis."
            currency={currency}
            onSelect={openAsset}
          />
        </div>

        {/* ── Positions ── */}
        <Panel
          title="Positions"
          count={`${holdings.length}`}
          note="Ranked by market value. Each row carries its valuation source."
          flushBody
          actions={
            holdings.length > DASHBOARD_HOLDINGS_LIMIT ? (
              <button
                type="button"
                className="fin-btn"
                onClick={() => navigate('/main?tab=portfolio')}
              >
                All positions <ChevronRight size={13} aria-hidden />
              </button>
            ) : undefined
          }
        >
          <HoldingsTable
            assets={holdings}
            totalValue={grossAssets}
            onSelect={openAsset}
            currency={currency}
            limit={DASHBOARD_HOLDINGS_LIMIT}
          />
        </Panel>

        {/* ── Liabilities ── */}
        <Panel
          title="Liabilities"
          count={loans.length > 0 ? `${loans.length}` : undefined}
          icon={<Landmark size={14} aria-hidden />}
          note="Outstanding balances netted against gross assets in the figure above."
          flushBody={loans.length > 0}
        >
          <LiabilitiesTable loans={loans} onSelect={openAsset} currency={currency} />
        </Panel>

      </div>
    </div>
  )
}

/* ── Movers ──────────────────────────────────────────────────────────────── */

interface MoverRow {
  asset: Asset
  pct: number
}

function MoversPanel({
  title, icon, rows, emptyText, currency, onSelect,
}: {
  title: string
  icon: React.ReactNode
  rows: MoverRow[]
  emptyText: string
  currency: string
  onSelect: (asset: Asset) => void
}) {
  return (
    <Panel title={title} icon={icon} note="Return against cost basis." flushBody={rows.length > 0}>
      {rows.length === 0 ? (
        <div className="fin-empty"><span className="fin-empty__body">{emptyText}</span></div>
      ) : (
        <table className="fin-table dash-movers">
          <thead className="fin-sr-only">
            <tr>
              <th scope="col">Holding</th>
              <th scope="col">Market value</th>
              <th scope="col">Return</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ asset, pct }) => (
              <tr
                key={asset.id}
                className="fin-table__row--link"
                onClick={() => onSelect(asset)}
              >
                <td>
                  <button type="button" className="fin-table__row-action">
                    <div className="fin-table__identity">
                      <AssetLogo symbol={asset.symbol} name={asset.name} type={asset.type} size={26} borderRadius={5} />
                      <div className="fin-table__identity-text">
                        <span className="fin-table__primary">{asset.symbol || asset.name}</span>
                        <span className="fin-table__secondary">{asset.name}</span>
                      </div>
                    </div>
                  </button>
                </td>
                <td className="fin-table__num fin-table__value">{formatCurrency(assetCurrentValue(asset), currency)}</td>
                <td className="fin-table__num"><Delta value={pct} kind="percent" size="sm" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  )
}

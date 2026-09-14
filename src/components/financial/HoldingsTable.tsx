import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import AssetLogo from '../AssetLogo'
import ProvenanceTag from './ProvenanceTag'
import Delta from './Delta'
import { deriveAssetValueProvenance } from '../../lib/financialProvenance'
import { formatCurrency, formatQuantity, formatWeight } from '../../lib/formatMoney'
import type { Asset } from '../../types'
import {
  ASSET_TYPE_LABELS, assetCurrentValue, assetGainLoss, assetGainLossPercent,
} from '../../types'
import './HoldingsTable.css'

export type HoldingsSortKey = 'name' | 'value' | 'weight' | 'gain' | 'return'

interface HoldingsTableProps {
  assets: Asset[]
  /** Denominator for the weight column — gross investable value. */
  totalValue: number
  onSelect: (asset: Asset) => void
  /** `compact` drops quantity, last price and the provenance column. */
  density?: 'compact' | 'full'
  /** Caps visible rows; the remainder is summarised in the footer. */
  limit?: number
}

interface Column {
  key: HoldingsSortKey | 'source'
  label: string
  numeric: boolean
  sortable: boolean
  /** Hidden in compact density. */
  wide?: boolean
}

const COLUMNS: Column[] = [
  { key: 'name', label: 'Holding', numeric: false, sortable: true },
  { key: 'weight', label: 'Qty', numeric: true, sortable: false, wide: true },
  { key: 'value', label: 'Market value', numeric: true, sortable: true },
  { key: 'weight', label: 'Weight', numeric: true, sortable: true },
  { key: 'gain', label: 'Unrealized', numeric: true, sortable: true },
  { key: 'return', label: 'Return', numeric: true, sortable: true },
  { key: 'source', label: 'Source', numeric: false, sortable: false, wide: true },
]

/**
 * Positions as a statement table: one row per holding, figures right-aligned on
 * a shared decimal convention, and each row's valuation traceable to its source.
 */
export default function HoldingsTable({
  assets,
  totalValue,
  onSelect,
  density = 'full',
  limit,
}: HoldingsTableProps) {
  const [sortKey, setSortKey] = useState<HoldingsSortKey>('value')
  const [descending, setDescending] = useState(true)

  const sorted = useMemo(() => {
    const withMetrics = assets.map((asset) => ({
      asset,
      value: assetCurrentValue(asset),
      gain: assetGainLoss(asset),
      return: assetGainLossPercent(asset),
    }))
    withMetrics.sort((a, b) => {
      if (sortKey === 'name') return a.asset.name.localeCompare(b.asset.name)
      // Weight is a monotone transform of value, so they share an ordering.
      if (sortKey === 'weight' || sortKey === 'value') return a.value - b.value
      return a[sortKey] - b[sortKey]
    })
    return descending ? withMetrics.reverse() : withMetrics
  }, [assets, sortKey, descending])

  const visible = limit ? sorted.slice(0, limit) : sorted
  const hidden = sorted.length - visible.length
  const hiddenValue = sorted.slice(visible.length).reduce((sum, row) => sum + row.value, 0)

  function toggleSort(key: HoldingsSortKey) {
    if (key === sortKey) {
      setDescending((d) => !d)
    } else {
      setSortKey(key)
      setDescending(key !== 'name')
    }
  }

  const columns = density === 'compact' ? COLUMNS.filter((c) => !c.wide) : COLUMNS

  if (assets.length === 0) {
    return (
      <div className="fin-empty">
        <span className="fin-empty__title">No positions</span>
        <span className="fin-empty__body">Holdings you add will be listed here with their valuation source.</span>
      </div>
    )
  }

  return (
    <div className="fin-table-wrap">
      <table className="fin-table fin-holdings">
        <thead>
          <tr>
            {columns.map((column, index) => (
              <th
                key={`${column.key}-${index}`}
                scope="col"
                className={column.numeric ? 'fin-table__num' : undefined}
                aria-sort={
                  column.sortable && column.key === sortKey
                    ? (descending ? 'descending' : 'ascending')
                    : undefined
                }
              >
                {column.sortable ? (
                  <button
                    type="button"
                    className={`fin-table__sort ${column.key === sortKey ? 'fin-table__sort--active' : ''}`.trim()}
                    onClick={() => toggleSort(column.key as HoldingsSortKey)}
                  >
                    {column.label}
                    {column.key === sortKey && (
                      descending ? <ChevronDown size={11} aria-hidden /> : <ChevronUp size={11} aria-hidden />
                    )}
                  </button>
                ) : column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visible.map(({ asset, value, gain, return: pct }) => {
            const weight = totalValue > 0 ? (value / totalValue) * 100 : 0
            return (
              <tr
                key={asset.id}
                className="fin-table__row--link"
                tabIndex={0}
                onClick={() => onSelect(asset)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSelect(asset)
                  }
                }}
              >
                <td>
                  <div className="fin-table__identity">
                    <AssetLogo symbol={asset.symbol} name={asset.name} type={asset.type} size={30} borderRadius={6} />
                    <div className="fin-table__identity-text">
                      <span className="fin-table__primary">{asset.name}</span>
                      <span className="fin-table__secondary">
                        {asset.symbol ? `${asset.symbol} · ` : ''}{ASSET_TYPE_LABELS[asset.type] ?? asset.type}
                      </span>
                    </div>
                  </div>
                </td>
                {density === 'full' && (
                  <td className="fin-table__num fin-holdings__muted">
                    {formatQuantity(asset.quantity)}
                    <span className="fin-holdings__at">@ {formatCurrency(asset.currentPrice)}</span>
                  </td>
                )}
                <td className="fin-table__num fin-table__value">{formatCurrency(value)}</td>
                <td className="fin-table__num">
                  <div className="fin-holdings__weight">
                    <span className="fin-holdings__weight-figure">{formatWeight(weight)}</span>
                    <span className="fin-meter" aria-hidden>
                      <span className="fin-meter__fill" style={{ width: `${Math.min(100, weight)}%` }} />
                    </span>
                  </div>
                </td>
                <td className="fin-table__num"><Delta value={gain} size="sm" /></td>
                <td className="fin-table__num"><Delta value={pct} kind="percent" size="sm" /></td>
                {density === 'full' && (
                  <td>
                    <ProvenanceTag
                      provenance={deriveAssetValueProvenance(asset)}
                      label={`${asset.name} market value`}
                    />
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
        {hidden > 0 && (
          <tfoot>
            <tr>
              <td colSpan={columns.length - 4}>{hidden} further {hidden === 1 ? 'position' : 'positions'}</td>
              <td className="fin-table__num">{formatCurrency(hiddenValue)}</td>
              <td className="fin-table__num">
                {formatWeight(totalValue > 0 ? (hiddenValue / totalValue) * 100 : 0)}
              </td>
              <td colSpan={density === 'full' ? 3 : 2} />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

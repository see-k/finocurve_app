import { useMemo } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { formatCurrency, formatWeight } from '../../lib/formatMoney'
import './AllocationBreakdown.css'

export interface AllocationSlice {
  name: string
  value: number
}

interface AllocationBreakdownProps {
  data: AllocationSlice[]
  /** Denominator for the weight column. Usually gross investable value. */
  total: number
  /** ISO currency for slice values and the centre total. */
  currency?: string
  /** Slices beyond this fold into "Other" rather than taking a generated hue. */
  maxSlices?: number
  size?: number
}

/** Fixed categorical order — assigned in sequence, never cycled. */
const SERIES_VARS = [
  'var(--fin-cat-1)', 'var(--fin-cat-2)', 'var(--fin-cat-3)', 'var(--fin-cat-4)',
  'var(--fin-cat-5)', 'var(--fin-cat-6)', 'var(--fin-cat-7)', 'var(--fin-cat-8)',
]
const OTHER_VAR = 'var(--fin-cat-other)'

function sliceColor(index: number, isOther: boolean): string {
  if (isOther) return OTHER_VAR
  return SERIES_VARS[index] ?? OTHER_VAR
}

/**
 * Share-of-portfolio breakdown: a donut for the shape, and a table beside it
 * carrying the name, dollar amount and weight for every slice. The table is the
 * relief channel — no slice depends on its colour to be read.
 */
export default function AllocationBreakdown({
  data,
  total,
  currency = 'USD',
  maxSlices = 7,
  size = 168,
}: AllocationBreakdownProps) {
  const slices = useMemo(() => {
    const sorted = [...data].filter((d) => d.value > 0).sort((a, b) => b.value - a.value)
    if (sorted.length <= maxSlices) {
      return sorted.map((slice, i) => ({ ...slice, color: sliceColor(i, false), isOther: false }))
    }
    const head = sorted.slice(0, maxSlices - 1)
    const tail = sorted.slice(maxSlices - 1)
    const otherValue = tail.reduce((sum, d) => sum + d.value, 0)
    return [
      ...head.map((slice, i) => ({ ...slice, color: sliceColor(i, false), isOther: false })),
      { name: `Other (${tail.length})`, value: otherValue, color: OTHER_VAR, isOther: true },
    ]
  }, [data, maxSlices])

  const denominator = total > 0 ? total : slices.reduce((sum, s) => sum + s.value, 0)

  if (slices.length === 0) {
    return (
      <div className="fin-empty">
        <span className="fin-empty__title">Nothing to allocate</span>
        <span className="fin-empty__body">Add a holding to see how your capital is distributed.</span>
      </div>
    )
  }

  return (
    <div className="fin-alloc">
      <div className="fin-alloc__chart" style={{ width: size, height: size }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={slices}
              cx="50%"
              cy="50%"
              innerRadius="62%"
              outerRadius="94%"
              dataKey="value"
              // A 2px surface gap keeps adjacent segments from bleeding together.
              paddingAngle={1}
              stroke="var(--fin-surface)"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {slices.map((slice) => (
                <Cell key={slice.name} fill={slice.color} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const row = payload[0].payload as AllocationSlice
                return (
                  <div className="fin-chart-tip">
                    <div className="fin-chart-tip__label">{row.name}</div>
                    <div className="fin-chart-tip__row">
                      <span className="fin-chart-tip__key" style={{ paddingLeft: 0 }}>Value</span>
                      <span className="fin-chart-tip__value fin-num">{formatCurrency(row.value, currency)}</span>
                    </div>
                    <div className="fin-chart-tip__row">
                      <span className="fin-chart-tip__key" style={{ paddingLeft: 0 }}>Weight</span>
                      <span className="fin-chart-tip__value fin-num">
                        {formatWeight(denominator > 0 ? (row.value / denominator) * 100 : 0)}
                      </span>
                    </div>
                  </div>
                )
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="fin-alloc__center">
          <span className="fin-label">Total</span>
          <span className="fin-alloc__center-value fin-num">{formatCurrency(denominator, currency)}</span>
        </div>
      </div>

      <table className="fin-alloc__table">
        {/* Fixed layout so long category names truncate instead of pushing the
            weight column past the panel edge. */}
        <colgroup>
          <col className="fin-alloc__col-name" />
          <col className="fin-alloc__col-value" />
          <col className="fin-alloc__col-weight" />
        </colgroup>
        <thead className="fin-sr-only">
          <tr>
            <th scope="col">Category</th>
            <th scope="col">Value</th>
            <th scope="col">Weight</th>
          </tr>
        </thead>
        <tbody>
          {slices.map((slice) => {
            const weight = denominator > 0 ? (slice.value / denominator) * 100 : 0
            return (
              <tr key={slice.name}>
                <td className="fin-alloc__name-cell">
                  <span className="fin-alloc__name-inner">
                    <span className="fin-alloc__dot" style={{ background: slice.color }} aria-hidden />
                    <span className="fin-alloc__name">{slice.name}</span>
                  </span>
                </td>
                <td className="fin-alloc__value fin-num">{formatCurrency(slice.value, currency)}</td>
                <td className="fin-alloc__weight fin-num">{formatWeight(weight)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

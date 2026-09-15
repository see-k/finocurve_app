import { Landmark } from 'lucide-react'
import ProvenanceTag from './ProvenanceTag'
import { deriveAssetValueProvenance } from '../../lib/financialProvenance'
import { formatCurrency, formatWeight } from '../../lib/formatMoney'
import type { Asset } from '../../types'
import { loanBalance, loanPrincipal } from '../../types'
import './HoldingsTable.css'

interface LiabilitiesTableProps {
  loans: Asset[]
  onSelect: (asset: Asset) => void
  /** ISO currency used for principal and outstanding balances. */
  currency?: string
  /** `compact` drops the paid-down and provenance columns. */
  density?: 'compact' | 'full'
}

/** Outstanding debt, shown against original principal so progress is legible. */
export default function LiabilitiesTable({
  loans,
  onSelect,
  currency = 'USD',
  density = 'full',
}: LiabilitiesTableProps) {
  if (loans.length === 0) {
    return (
      <div className="fin-empty">
        <Landmark size={22} aria-hidden />
        <span className="fin-empty__title">No liabilities tracked</span>
        <span className="fin-empty__body">
          Adding mortgages, loans or lines of credit lets net worth be reported against gross assets.
        </span>
      </div>
    )
  }

  const sorted = [...loans].sort((a, b) => loanBalance(b) - loanBalance(a))

  return (
    <div className="fin-table-wrap">
      <table className="fin-table fin-liabilities">
        <thead>
          <tr>
            <th scope="col">Liability</th>
            <th scope="col" className="fin-table__num">Balance</th>
            {density === 'full' && <th scope="col" className="fin-table__num">Paid down</th>}
            {density === 'full' && <th scope="col">Source</th>}
          </tr>
        </thead>
        <tbody>
          {sorted.map((loan) => {
            const balance = loanBalance(loan)
            const principal = loanPrincipal(loan)
            const paidPercent = principal > 0 ? ((principal - balance) / principal) * 100 : 0
            return (
              <tr
                key={loan.id}
                className="fin-table__row--link"
                onClick={() => onSelect(loan)}
              >
                <td>
                  <button type="button" className="fin-table__row-action">
                    <div className="fin-table__identity">
                      <span className="fin-mark"><Landmark aria-hidden /></span>
                      <div className="fin-table__identity-text">
                        <span className="fin-table__primary">{loan.name}</span>
                        <span className="fin-liabilities__terms">
                          {loan.loanType && <span>{loan.loanType.replace(/_/g, ' ')}</span>}
                          {loan.interestRate != null && <span>{loan.interestRate}% APR</span>}
                          {principal > 0 && <span>of {formatCurrency(principal, currency)}</span>}
                        </span>
                      </div>
                    </div>
                  </button>
                </td>
                <td className="fin-table__num fin-liabilities__balance">{formatCurrency(balance, currency)}</td>
                {density === 'full' && (
                  <td className="fin-table__num">
                    <div className="fin-holdings__weight">
                      <span className="fin-holdings__weight-figure">
                        {principal > 0 ? formatWeight(Math.max(0, paidPercent)) : '—'}
                      </span>
                      {principal > 0 && (
                        <span className="fin-meter" aria-hidden>
                          <span
                            className="fin-meter__fill"
                            style={{
                              width: `${Math.min(100, Math.max(0, paidPercent))}%`,
                              background: 'var(--fin-pos)',
                            }}
                          />
                        </span>
                      )}
                    </div>
                  </td>
                )}
                {density === 'full' && (
                  <td>
                    <ProvenanceTag
                      provenance={deriveAssetValueProvenance(loan)}
                      label={`${loan.name} outstanding balance`}
                    />
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

import { describe, expect, it } from 'vitest'
import {
  allocateByClass, readAlpacaPositions, readKalshiPositions, readSchwabPositions, totalPositions,
} from '../src/lib/enterprisePositions'

describe('readAlpacaPositions', () => {
  it('reads string figures and converts the fractional return to percent', () => {
    const [row] = readAlpacaPositions([{
      asset_id: 'a1', symbol: 'AAPL', qty: '10', side: 'long', asset_class: 'us_equity',
      market_value: '1900.50', cost_basis: '1500', unrealized_pl: '400.50', unrealized_plpc: '0.267',
    }])
    expect(row).toMatchObject({
      venue: 'alpaca', symbol: 'AAPL', quantity: 10, marketValue: 1900.5,
      costBasis: 1500, unrealizedPl: 400.5, assetClass: 'equity', valuedAtCost: false,
    })
    expect(row.unrealizedPlPercent).toBeCloseTo(26.7)
  })

  it('signs short quantities and drops rows without a market value', () => {
    const rows = readAlpacaPositions([
      { symbol: 'TSLA', qty: '5', side: 'short', market_value: '-1000', asset_class: 'us_equity' },
      { symbol: 'BAD', qty: '1' },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].quantity).toBe(-5)
  })

  it('returns nothing for a non-array error body', () => {
    expect(readAlpacaPositions({ code: 40110000, message: 'unauthorized' })).toEqual([])
  })
})

describe('readKalshiPositions', () => {
  it('values open contracts at cost and skips closed ones', () => {
    const rows = readKalshiPositions({
      market_positions: [
        { ticker: 'FED-25DEC', position: 20, market_exposure: 1240 },
        { ticker: 'CPI-25NOV', position: -4, market_exposure_dollars: '2.6000' },
        { ticker: 'CLOSED', position: 0, market_exposure: 0 },
      ],
    })
    expect(rows.map((r) => r.symbol)).toEqual(['FED-25DEC', 'CPI-25NOV'])
    expect(rows[0]).toMatchObject({ marketValue: 12.4, valuedAtCost: true, unrealizedPl: null, name: 'Yes contracts' })
    expect(rows[1]).toMatchObject({ marketValue: 2.6, quantity: -4, name: 'No contracts' })
  })
})

describe('readSchwabPositions', () => {
  it('derives cost from open P/L and classifies instruments', () => {
    const rows = readSchwabPositions([{
      securitiesAccount: {
        accountNumber: '12345678',
        positions: [
          {
            instrument: { symbol: 'VTI', description: 'Vanguard Total Stock', assetType: 'COLLECTIVE_INVESTMENT', cusip: '922908769' },
            longQuantity: 10, shortQuantity: 0, marketValue: 2800, averagePrice: 250, longOpenProfitLoss: 300,
          },
          {
            instrument: { symbol: 'MSFT', assetType: 'EQUITY' },
            longQuantity: 2, shortQuantity: 0, marketValue: 900, averagePrice: 400,
          },
        ],
      },
    }])
    expect(rows[0]).toMatchObject({ assetClass: 'fund', costBasis: 2500, unrealizedPl: 300, name: 'Vanguard Total Stock' })
    expect(rows[0].unrealizedPlPercent).toBeCloseTo(12)
    expect(rows[0].key).toBe('schwab:5678:922908769')
    expect(rows[1]).toMatchObject({ assetClass: 'equity', costBasis: 800, unrealizedPl: 100 })
  })
})

describe('totalPositions', () => {
  it('measures P/L only over positions with a cost basis and a mark', () => {
    const positions = [
      ...readAlpacaPositions([{ symbol: 'A', qty: '1', market_value: '110', cost_basis: '100', unrealized_pl: '10', asset_class: 'us_equity' }]),
      ...readKalshiPositions({ market_positions: [{ ticker: 'K', position: 1, market_exposure: 5000 }] }),
    ]
    const totals = totalPositions(positions)
    expect(totals.marketValue).toBe(160)
    expect(totals.costBasis).toBe(100)
    expect(totals.unrealizedPl).toBe(10)
    expect(totals.unrealizedPlPercent).toBeCloseTo(10)
    expect(totals.measured).toBe(1)
  })

  it('reports no rate when nothing is measurable', () => {
    expect(totalPositions([]).unrealizedPlPercent).toBeNull()
  })
})

describe('allocateByClass', () => {
  it('groups by asset class, largest first', () => {
    const positions = readAlpacaPositions([
      { symbol: 'BTCUSD', qty: '1', market_value: '50', asset_class: 'crypto' },
      { symbol: 'AAPL', qty: '1', market_value: '200', asset_class: 'us_equity' },
      { symbol: 'MSFT', qty: '1', market_value: '100', asset_class: 'us_equity' },
    ])
    expect(allocateByClass(positions)).toEqual([
      { name: 'Equities', value: 300 },
      { name: 'Crypto', value: 50 },
    ])
  })
})

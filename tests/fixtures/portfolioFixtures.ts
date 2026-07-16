import type { Asset, Portfolio } from '../../src/types'

function asset(input: Partial<Asset> & Pick<Asset, 'id' | 'name' | 'type'>): Asset {
  return {
    category: 'public',
    quantity: 1,
    costBasis: 0,
    currentPrice: 0,
    currency: 'USD',
    tags: [],
    ...input,
  }
}

export const balancedAssets: Asset[] = [
  asset({ id: 'stock', name: 'Public equities', type: 'stock', currentPrice: 40_000, costBasis: 32_000 }),
  asset({ id: 'etf', name: 'Index funds', type: 'etf', currentPrice: 20_000, costBasis: 17_000 }),
  asset({ id: 'bond', name: 'Treasuries', type: 'bond', currentPrice: 20_000, costBasis: 19_000 }),
  asset({ id: 'property', name: 'Rental property', type: 'real_estate', category: 'manual', currentPrice: 10_000, costBasis: 9_000 }),
  asset({ id: 'cash', name: 'Cash reserve', type: 'cash', category: 'manual', currentPrice: 10_000, costBasis: 10_000 }),
]

export const concentratedCryptoAssets: Asset[] = [
  asset({ id: 'btc', name: 'Bitcoin', symbol: 'BTC', type: 'crypto', currentPrice: 80_000, costBasis: 50_000 }),
  asset({ id: 'eth', name: 'Ethereum', symbol: 'ETH', type: 'crypto', currentPrice: 20_000, costBasis: 15_000 }),
]

export const cashOnlyAssets: Asset[] = [
  asset({ id: 'cash-only', name: 'Cash', type: 'cash', category: 'manual', currentPrice: 10_000, costBasis: 10_000 }),
]

export const loanAsset: Asset = asset({
  id: 'loan',
  name: 'Mortgage',
  type: 'real_estate',
  category: 'loan',
  costBasis: -350_000,
  currentPrice: -280_000,
  loanType: 'mortgage',
})

export function portfolio(assets: Asset[]): Portfolio {
  return {
    id: 'fixture-portfolio',
    name: 'Fixture Portfolio',
    currency: 'USD',
    assets,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

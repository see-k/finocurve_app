import { useState, useEffect, useCallback, useMemo } from 'react'
import type { Portfolio, Asset } from '../types'
import {
  portfolioTotalValue, portfolioTotalCost,
  portfolioTotalGainLoss, portfolioTotalGainLossPercent,
  assetCurrentValue,
} from '../types'

const STORAGE_KEY = 'finocurve-portfolio'

function loadPortfolio(): Portfolio | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return JSON.parse(stored)
  } catch { /* ignore */ }
  return null
}

function savePortfolio(portfolio: Portfolio | null) {
  try {
    if (portfolio) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(portfolio))
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  } catch { /* ignore */ }
}

function createDemoPortfolio(): Portfolio {
  const now = new Date().toISOString()
  return {
    id: 'demo',
    name: 'Demo Portfolio',
    currency: 'USD',
    createdAt: now,
    updatedAt: now,
    assets: [
      {
        id: '1', name: 'Apple Inc.', symbol: 'AAPL', type: 'stock', category: 'public',
        quantity: 50, costBasis: 7500, currentPrice: 227.63, currency: 'USD',
        tags: [], sector: 'technology', country: 'US', brokerage: 'Fidelity',
      },
      {
        id: '2', name: 'Vanguard S&P 500', symbol: 'VOO', type: 'etf', category: 'public',
        quantity: 25, costBasis: 9000, currentPrice: 478.35, currency: 'USD',
        tags: [], sector: 'diversified', country: 'US', brokerage: 'Vanguard',
      },
      {
        id: '3', name: 'Bitcoin', symbol: 'BTC', type: 'crypto', category: 'public',
        quantity: 0.5, costBasis: 15000, currentPrice: 97450.00, currency: 'USD',
        tags: [], sector: 'crypto',
      },
      {
        id: '4', name: 'Rental Property', type: 'real_estate', category: 'manual',
        quantity: 1, costBasis: 280000, currentPrice: 350000, currency: 'USD',
        tags: ['investment'], sector: 'real_estate', country: 'US',
      },
      {
        id: '5', name: 'Emergency Fund', type: 'cash', category: 'manual',
        quantity: 1, costBasis: 25000, currentPrice: 25000, currency: 'USD',
        tags: [],
      },
      {
        id: '6', name: 'Tesla Inc.', symbol: 'TSLA', type: 'stock', category: 'public',
        quantity: 20, costBasis: 4800, currentPrice: 352.80, currency: 'USD',
        tags: [], sector: 'consumer_discretionary', country: 'US', brokerage: 'Robinhood',
      },
      {
        id: '7', name: 'Ethereum', symbol: 'ETH', type: 'crypto', category: 'public',
        quantity: 3, costBasis: 4500, currentPrice: 3280.50, currency: 'USD',
        tags: [], sector: 'crypto',
      },
      {
        id: '8', name: 'Microsoft Corp.', symbol: 'MSFT', type: 'stock', category: 'public',
        quantity: 10, costBasis: 3400, currentPrice: 415.20, currency: 'USD',
        tags: [], sector: 'technology', country: 'US', brokerage: 'Fidelity',
      },
      {
        id: 'loan-1', name: 'Home Mortgage', type: 'real_estate', category: 'loan',
        quantity: 1, costBasis: -350000, currentPrice: -280000, currency: 'USD',
        tags: [], loanType: 'mortgage', interestRate: 6.5, loanTermMonths: 360,
        monthlyPayment: 2212, loanStartDate: '2023-01-15',
      },
    ],
  }
}

export function usePortfolio() {
  const [portfolio, setPortfolioState] = useState<Portfolio | null>(loadPortfolio)

  useEffect(() => {
    savePortfolio(portfolio)
  }, [portfolio])

  // Sync portfolio to main process for A2A and AI tools (Electron only)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.electronAPI?.portfolioSync) return
    if (!portfolio) {
      window.electronAPI.portfolioSync(null)
      return
    }
    const totalVal = portfolioTotalValue(portfolio)
    const totalCostVal = portfolioTotalCost(portfolio)
    const gainLossPct = totalCostVal > 0 ? ((totalVal - totalCostVal) / totalCostVal) * 100 : 0
    const nonLoanAssets = portfolio.assets?.filter((a) => a.category !== 'loan') ?? []
    const topHoldings = nonLoanAssets
      .map((a) => ({
        symbol: a.symbol,
        name: a.name,
        value: assetCurrentValue(a),
        percent: totalVal > 0 ? (assetCurrentValue(a) / totalVal) * 100 : undefined,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
    window.electronAPI.portfolioSync({
      portfolioName: portfolio.name || 'Portfolio',
      totalValue: totalVal,
      totalGainLossPercent: gainLossPct,
      assetCount: portfolio.assets?.length ?? 0,
      topHoldings,
    })
  }, [portfolio])

  const createPortfolio = useCallback((name: string, currency: string) => {
    const now = new Date().toISOString()
    const p: Portfolio = {
      id: crypto.randomUUID(), name, currency,
      assets: [], createdAt: now, updatedAt: now,
    }
    setPortfolioState(p)
    return p
  }, [])

  const loadDemo = useCallback(() => {
    setPortfolioState(createDemoPortfolio())
  }, [])

  const addAsset = useCallback((asset: Asset) => {
    setPortfolioState(prev => {
      if (!prev) return prev
      return { ...prev, assets: [...prev.assets, asset], updatedAt: new Date().toISOString() }
    })
  }, [])

  const updateAsset = useCallback((updated: Asset) => {
    setPortfolioState(prev => {
      if (!prev) return prev
      return {
        ...prev,
        assets: prev.assets.map(a => a.id === updated.id ? updated : a),
        updatedAt: new Date().toISOString(),
      }
    })
  }, [])

  const removeAsset = useCallback((assetId: string) => {
    setPortfolioState(prev => {
      if (!prev) return prev
      return {
        ...prev,
        assets: prev.assets.filter(a => a.id !== assetId),
        updatedAt: new Date().toISOString(),
      }
    })
  }, [])

  const clearPortfolio = useCallback(() => {
    setPortfolioState(null)
    localStorage.removeItem(STORAGE_KEY)
  }, [])

  const totalValue = useMemo(() => portfolio ? portfolioTotalValue(portfolio) : 0, [portfolio])
  const totalCost = useMemo(() => portfolio ? portfolioTotalCost(portfolio) : 0, [portfolio])
  const totalGainLoss = useMemo(() => portfolio ? portfolioTotalGainLoss(portfolio) : 0, [portfolio])
  const totalGainLossPercent = useMemo(() => portfolio ? portfolioTotalGainLossPercent(portfolio) : 0, [portfolio])

  return {
    portfolio, totalValue, totalCost, totalGainLoss, totalGainLossPercent,
    createPortfolio, loadDemo, addAsset, updateAsset, removeAsset, clearPortfolio,
  }
}

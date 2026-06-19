import { describe, expect, it } from 'vitest'
import { getTradingViewSymbol, resolveChartSymbolInput } from './TradingViewChart'

describe('resolveChartSymbolInput', () => {
  it('defaults empty input to NASDAQ:AAPL', () => {
    expect(resolveChartSymbolInput('')).toBe('NASDAQ:AAPL')
    expect(resolveChartSymbolInput('   ')).toBe('NASDAQ:AAPL')
  })

  it('passes through explicit exchange:ticker symbols', () => {
    expect(resolveChartSymbolInput('nyse: brk.b')).toBe('NYSE:BRK.B')
    expect(resolveChartSymbolInput('BINANCE:BTCUSDT')).toBe('BINANCE:BTCUSDT')
  })

  it('resolves watchlist entries via lookup callback', () => {
    const lookup = (ticker: string) =>
      ticker === 'BTC' ? { symbol: 'BTC', type: 'crypto' } : undefined
    expect(resolveChartSymbolInput('btc', lookup)).toBe('BINANCE:BTCUSDT')
  })

  it('assumes short tickers are NASDAQ symbols', () => {
    expect(resolveChartSymbolInput('aapl')).toBe('NASDAQ:AAPL')
    expect(resolveChartSymbolInput('brk')).toBe('NASDAQ:BRK')
  })
})

describe('getTradingViewSymbol', () => {
  it('maps known crypto tickers to Binance pairs', () => {
    expect(getTradingViewSymbol('eth', 'crypto')).toBe('BINANCE:ETHUSDT')
    expect(getTradingViewSymbol('DOGE', 'crypto')).toBe('BINANCE:DOGEUSDT')
  })

  it('falls back to BINANCE:SYMBOLUSDT for unknown crypto', () => {
    expect(getTradingViewSymbol('xyz', 'crypto')).toBe('BINANCE:XYZUSDT')
  })

  it('uppercases non-crypto symbols', () => {
    expect(getTradingViewSymbol('aapl', 'stock')).toBe('AAPL')
  })
})

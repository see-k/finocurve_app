/**
 * IPC handlers for historical price data (Yahoo Finance).
 * Used by Dashboard and Portfolio performance charts.
 */
import { ipcMain } from 'electron'
import YahooFinance from 'yahoo-finance2'

type Period = '1D' | '1W' | '1M' | '1Y'

interface PriceHistoricalPayload {
  assets: { symbol: string; quantity: number; type: string; currentValue: number }[]
  period: Period
  otherAssetsValue: number
}

interface ChartQuote {
  date: Date
  close: number | null
  open?: number | null
  high?: number | null
  low?: number | null
}

function getDateRange(period: Period): { period1: Date; period2: Date; interval: '1d' | '1wk' | '1mo' } {
  const now = new Date()
  const period2 = new Date(now)
  let period1: Date
  let interval: '1d' | '1wk' | '1mo' = '1d'

  switch (period) {
    case '1D':
      period1 = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      interval = '1d'
      break
    case '1W':
      period1 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      interval = '1d'
      break
    case '1M':
      period1 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      interval = '1d'
      break
    case '1Y':
      period1 = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
      interval = '1wk'
      break
    default:
      period1 = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
      interval = '1wk'
  }

  return { period1, period2, interval }
}

export function registerPriceHandlers(): void {
  ipcMain.handle(
    'price-historical',
    async (
      _event,
      payload: PriceHistoricalPayload
    ): Promise<{ data: { date: string; value: number }[]; error: string | null }> => {
      try {
        const { assets, period, otherAssetsValue } = payload
        if (!assets || assets.length === 0) {
          return { data: [], error: null }
        }

        const { period1, period2, interval } = getDateRange(period)
        const yahooFinance = new YahooFinance()

        // Fetch chart data for each asset in parallel
        const results = await Promise.allSettled(
          assets.map(async (asset) => {
            const result = await yahooFinance.chart(asset.symbol, {
              period1,
              period2,
              interval,
            })
            const quotes = (result as { quotes?: ChartQuote[] }).quotes ?? []
            return {
              symbol: asset.symbol,
              quantity: asset.quantity,
              quotes: quotes
                .filter((q) => q.close != null)
                .map((q) => ({
                  date: q.date.getTime(),
                  price: q.close as number,
                })),
            }
          })
        )

        // Build date -> total value map
        const valueByDate = new Map<number, number>()

        for (const settled of results) {
          if (settled.status === 'rejected') continue
          const { quantity, quotes } = settled.value
          for (const { date, price } of quotes) {
            const prev = valueByDate.get(date) ?? 0
            valueByDate.set(date, prev + quantity * price)
          }
        }

        // Add otherAssetsValue to each point and sort by date
        const data = Array.from(valueByDate.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([timestamp, value]) => ({
            date: new Date(timestamp).toISOString(),
            value: value + otherAssetsValue,
          }))

        return { data, error: null }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return { data: [], error: message }
      }
    }
  )
}

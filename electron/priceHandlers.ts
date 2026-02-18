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

interface AssetSeries {
  quantity: number
  currentValue: number
  quotesByBucket: Map<string, number>
  firstPrice: number | null
}

function toBucket(date: Date, interval: '1h' | '1d' | '1wk'): string {
  const iso = date.toISOString()
  if (interval === '1h') return iso.slice(0, 13) // YYYY-MM-DDTHH
  return iso.slice(0, 10) // YYYY-MM-DD
}

function bucketToIso(bucket: string, interval: '1h' | '1d' | '1wk'): string {
  if (interval === '1h') return `${bucket}:00:00.000Z`
  return `${bucket}T00:00:00.000Z`
}

function getDateRange(period: Period): { period1: Date; period2: Date; interval: '1h' | '1d' | '1wk' } {
  const now = new Date()
  const period2 = new Date(now)
  let period1: Date
  let interval: '1h' | '1d' | '1wk' = '1d'

  switch (period) {
    case '1D':
      period1 = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      interval = '1h'
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
              currentValue: asset.currentValue,
              quotes: quotes
                .filter((q) => q.close != null)
                .map((q) => ({
                  date: q.date,
                  price: q.close as number,
                })),
            }
          })
        )

        const allBuckets = new Set<string>()
        const series: AssetSeries[] = []
        let staticOffset = otherAssetsValue

        for (let i = 0; i < results.length; i++) {
          const settled = results[i]
          const fallbackValue = assets[i]?.currentValue ?? 0
          if (settled.status === 'rejected') {
            staticOffset += fallbackValue
            continue
          }

          const sortedQuotes = [...settled.value.quotes].sort((a, b) => a.date.getTime() - b.date.getTime())
          if (sortedQuotes.length === 0) {
            staticOffset += fallbackValue
            continue
          }

          const quotesByBucket = new Map<string, number>()
          for (const quote of sortedQuotes) {
            const bucket = toBucket(quote.date, interval)
            quotesByBucket.set(bucket, quote.price)
            allBuckets.add(bucket)
          }

          series.push({
            quantity: settled.value.quantity,
            currentValue: settled.value.currentValue,
            quotesByBucket,
            firstPrice: sortedQuotes[0]?.price ?? null,
          })
        }

        if (series.length === 0 || allBuckets.size === 0) {
          return { data: [], error: null }
        }

        const sortedBuckets = Array.from(allBuckets).sort()
        const cursor = series.map((s) => ({
          ...s,
          lastPrice: s.firstPrice,
        }))

        const data = sortedBuckets.map((bucket) => {
          let bucketValue = staticOffset
          for (const item of cursor) {
            const priceForBucket = item.quotesByBucket.get(bucket)
            if (priceForBucket != null) {
              item.lastPrice = priceForBucket
            }
            if (item.lastPrice != null) {
              bucketValue += item.quantity * item.lastPrice
            } else {
              bucketValue += item.currentValue
            }
          }
          return {
            date: new Date(bucketToIso(bucket, interval)).toISOString(),
            value: bucketValue,
          }
        })

        // Anchor only the latest point to the current portfolio value so the chart's
        // rightmost point matches the UI totals without distorting all historical points.
        const latestPoint = data[data.length - 1]
        if (latestPoint) {
          const currentTotal = assets.reduce((sum, a) => sum + a.currentValue, 0) + otherAssetsValue
          if (Number.isFinite(currentTotal)) {
            latestPoint.value = currentTotal
          }
        }

        return { data, error: null }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return { data: [], error: message }
      }
    }
  )
}

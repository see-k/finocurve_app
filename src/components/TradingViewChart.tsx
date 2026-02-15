import { useEffect, useRef, useState, useCallback } from 'react'
import { useTheme } from '../theme/ThemeContext'
import './TradingViewChart.css'

interface TradingViewChartProps {
  symbol: string
  onClose?: () => void
}

const CRYPTO_MAP: Record<string, string> = {
  BTC: 'BINANCE:BTCUSDT',
  ETH: 'BINANCE:ETHUSDT',
  SOL: 'BINANCE:SOLUSDT',
  BNB: 'BINANCE:BNBUSDT',
  ADA: 'BINANCE:ADAUSDT',
  XRP: 'BINANCE:XRPUSDT',
  DOT: 'BINANCE:DOTUSDT',
  DOGE: 'BINANCE:DOGEUSDT',
  AVAX: 'BINANCE:AVAXUSDT',
  MATIC: 'BINANCE:MATICUSDT',
  LINK: 'BINANCE:LINKUSDT',
  UNI: 'BINANCE:UNIUSDT',
  LTC: 'BINANCE:LTCUSDT',
  ATOM: 'BINANCE:ATOMUSDT',
}

export function getTradingViewSymbol(symbol: string, type: string): string {
  if (type === 'crypto') {
    const upper = symbol.toUpperCase()
    return CRYPTO_MAP[upper] || `BINANCE:${upper}USDT`
  }
  return symbol.toUpperCase()
}

/**
 * Loads https://s3.tradingview.com/tv.js once and resolves when ready.
 * Subsequent calls return the same promise.
 */
let tvPromise: Promise<void> | null = null
function loadTvJs(): Promise<void> {
  if ((window as any).TradingView) return Promise.resolve()
  if (tvPromise) return tvPromise

  tvPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://s3.tradingview.com/tv.js'
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load TradingView'))
    document.body.appendChild(script)
  })
  return tvPromise
}

export default function TradingViewChart({ symbol, onClose }: TradingViewChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { theme } = useTheme()
  const [loading, setLoading] = useState(true)
  const colorTheme = theme === 'dark' ? 'dark' : 'light'
  const bgColor = theme === 'dark' ? '#0f0f23' : '#f4f4f8'

  const initChart = useCallback(async () => {
    if (!containerRef.current) return
    setLoading(true)

    try {
      await loadTvJs()
    } catch {
      setLoading(false)
      return
    }

    if (!containerRef.current) return
    containerRef.current.innerHTML = ''

    const chartDiv = document.createElement('div')
    const chartId = 'tradingview_chart_' + Date.now()
    chartDiv.id = chartId
    chartDiv.style.width = '100%'
    chartDiv.style.height = '100%'
    containerRef.current.appendChild(chartDiv)

    try {
      new (window as any).TradingView.widget({
        width: '100%',
        height: '100%',
        symbol,
        interval: 'D',
        timezone: 'Etc/UTC',
        theme: colorTheme,
        style: '1',
        locale: 'en',
        toolbar_bg: bgColor,
        enable_publishing: false,
        hide_top_toolbar: false,
        hide_legend: false,
        save_image: false,
        container_id: chartId,
        backgroundColor: bgColor,
        gridColor:
          theme === 'dark'
            ? 'rgba(255, 255, 255, 0.06)'
            : 'rgba(0, 0, 0, 0.06)',
        withdateranges: true,
        allow_symbol_change: false,
        details: true,
        hotlist: false,
        calendar: false,
        studies: ['RSI@tv-basicstudies', 'MASimple@tv-basicstudies'],
      })
    } catch (e) {
      console.error('TradingView widget error', e)
    }

    // Give the widget a moment to render its iframe
    setTimeout(() => setLoading(false), 2000)
  }, [symbol, colorTheme, bgColor, theme])

  useEffect(() => {
    initChart()
  }, [initChart])

  return (
    <div className="tv-chart-overlay">
      <div className="tv-chart-header">
        <span className="tv-chart-symbol">{symbol}</span>
        {onClose && (
          <button className="tv-chart-close" onClick={onClose}>
            Close
          </button>
        )}
      </div>
      <div className="tv-chart-container" ref={containerRef} />
      {loading && (
        <div className="tv-chart-loading">
          <div className="tv-chart-spinner" />
          <span>Loading TradingView chart…</span>
        </div>
      )}
    </div>
  )
}

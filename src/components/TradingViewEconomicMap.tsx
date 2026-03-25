import { useEffect, useRef, useState } from 'react'
import { useTheme, themeToTradingViewColorTheme } from '../theme/ThemeContext'
import './TradingViewEconomicMap.css'

/**
 * TradingView [Economic Map](https://www.tradingview.com/widget-docs/widgets/economics/economic-map/)
 * Web Component: load module from widgets.tradingview-widget.com, then mount <tv-economic-map />.
 */
const SCRIPT_ID = 'finocurve-tv-wc-economic-map'
const SCRIPT_SRC = 'https://widgets.tradingview-widget.com/w/en/tv-economic-map.js'

function ensureScript(): Promise<void> {
  const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null
  if (existing && existing.src !== SCRIPT_SRC) {
    existing.remove()
  }
  const el = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null
  if (el) {
    return el.dataset.loaded === '1'
      ? Promise.resolve()
      : new Promise((resolve, reject) => {
          el.addEventListener('load', () => resolve(), { once: true })
          el.addEventListener('error', () => reject(new Error('script')), { once: true })
        })
  }
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.type = 'module'
    s.id = SCRIPT_ID
    s.src = SCRIPT_SRC
    s.async = true
    s.onload = () => {
      s.dataset.loaded = '1'
      resolve()
    }
    s.onerror = () => reject(new Error('Failed to load Economic Map widget'))
    document.head.appendChild(s)
  })
}

interface TradingViewEconomicMapProps {
  className?: string
  /** Example from TradingView docs: `gdg` (GDP). Omit for widget default. */
  metric?: string
}

export default function TradingViewEconomicMap({
  className = '',
  metric,
}: TradingViewEconomicMapProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const { theme } = useTheme()
  const colorTheme = themeToTradingViewColorTheme(theme)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let cancelled = false
    setError(null)
    host.innerHTML = ''

    ensureScript()
      .then(() => {
        if (cancelled || !hostRef.current) return
        const el = document.createElement('tv-economic-map')
        el.setAttribute('theme', colorTheme)
        el.setAttribute('locale', 'en')
        if (metric) el.setAttribute('metric', metric)
        host.appendChild(el)
      })
      .catch(() => {
        if (!cancelled) {
          setError('Unable to load the Economic Map. Check your network or try again later.')
        }
      })

    return () => {
      cancelled = true
      host.innerHTML = ''
    }
  }, [colorTheme, metric])

  if (error) {
    return (
      <div className={`tv-economic-map-fallback ${className}`}>
        <p>{error}</p>
        <a
          href="https://www.tradingview.com/widget-docs/widgets/economics/economic-map/"
          target="_blank"
          rel="noopener noreferrer"
        >
          TradingView Economic Map docs
        </a>
      </div>
    )
  }

  return <div ref={hostRef} className={`tv-economic-map-host ${className}`} />
}

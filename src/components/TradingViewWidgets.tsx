import { useEffect, useRef } from 'react'
import { useTheme } from '../theme/ThemeContext'

interface WidgetProps {
  height?: number | string
  className?: string
}

/**
 * Helper: TradingView embed widgets work by having a <script> tag whose
 * `src` is the widget JS and whose *text content* is the JSON config.
 * Scripts injected via innerHTML are NOT executed by browsers, so we must
 * create the elements programmatically.
 */
function mountWidget(
  container: HTMLElement,
  scriptSrc: string,
  config: Record<string, unknown>,
) {
  // Clear previous widget
  container.innerHTML = ''

  // Outer wrapper (TradingView looks for this class)
  const wrapper = document.createElement('div')
  wrapper.className = 'tradingview-widget-container'

  // Inner widget target
  const widgetDiv = document.createElement('div')
  widgetDiv.className = 'tradingview-widget-container__widget'
  wrapper.appendChild(widgetDiv)

  // The script element – TradingView reads config from script.textContent
  const script = document.createElement('script')
  script.type = 'text/javascript'
  script.src = scriptSrc
  script.async = true
  script.textContent = JSON.stringify(config)
  wrapper.appendChild(script)

  container.appendChild(wrapper)
}

// ─── Ticker Tape ────────────────────────────────────────────────────────────

export function TickerTapeWidget({ height = 46, className = '' }: WidgetProps) {
  const ref = useRef<HTMLDivElement>(null)
  const { theme } = useTheme()
  const colorTheme = theme === 'dark' ? 'dark' : 'light'

  useEffect(() => {
    if (!ref.current) return
    mountWidget(
      ref.current,
      'https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js',
      {
        symbols: [
          { proName: 'FOREXCOM:SPXUSD', title: 'S&P 500' },
          { proName: 'BITSTAMP:BTCUSD', title: 'Bitcoin' },
          { proName: 'NASDAQ:AAPL', title: 'Apple' },
          { proName: 'NASDAQ:MSFT', title: 'Microsoft' },
          { proName: 'NASDAQ:GOOGL', title: 'Google' },
          { proName: 'NASDAQ:TSLA', title: 'Tesla' },
          { proName: 'NASDAQ:AMZN', title: 'Amazon' },
          { proName: 'NASDAQ:NVDA', title: 'NVIDIA' },
          { proName: 'BITSTAMP:ETHUSD', title: 'Ethereum' },
          { proName: 'NASDAQ:META', title: 'Meta' },
        ],
        showSymbolLogo: true,
        isTransparent: true,
        displayMode: 'adaptive',
        colorTheme,
        locale: 'en',
      },
    )
  }, [colorTheme])

  return <div ref={ref} className={className} style={{ height, overflow: 'hidden' }} />
}

// ─── Hotlists (Market Movers) ───────────────────────────────────────────────

export function HotlistsWidget({ height = 420, className = '' }: WidgetProps) {
  const ref = useRef<HTMLDivElement>(null)
  const { theme } = useTheme()
  const colorTheme = theme === 'dark' ? 'dark' : 'light'

  useEffect(() => {
    if (!ref.current) return
    mountWidget(
      ref.current,
      'https://s3.tradingview.com/external-embedding/embed-widget-hotlists.js',
      {
        colorTheme,
        dateRange: '12M',
        exchange: 'US',
        showChart: true,
        locale: 'en',
        isTransparent: true,
        showSymbolLogo: true,
        showFloatingTooltip: false,
        width: '100%',
        height,
      },
    )
  }, [colorTheme, height])

  return <div ref={ref} className={className} style={{ height, overflow: 'hidden' }} />
}

// ─── Timeline (Market News) ─────────────────────────────────────────────────

export function TimelineWidget({ height = 500, className = '' }: WidgetProps) {
  const ref = useRef<HTMLDivElement>(null)
  const { theme } = useTheme()
  const colorTheme = theme === 'dark' ? 'dark' : 'light'

  useEffect(() => {
    if (!ref.current) return
    mountWidget(
      ref.current,
      'https://s3.tradingview.com/external-embedding/embed-widget-timeline.js',
      {
        feedMode: 'all_symbols',
        isTransparent: true,
        displayMode: 'regular',
        width: '100%',
        height,
        colorTheme,
        locale: 'en',
      },
    )
  }, [colorTheme, height])

  return <div ref={ref} className={className} style={{ height, overflow: 'hidden' }} />
}

// ─── Events (Economic Calendar) ─────────────────────────────────────────────

export function EventsWidget({ height = 500, className = '' }: WidgetProps) {
  const ref = useRef<HTMLDivElement>(null)
  const { theme } = useTheme()
  const colorTheme = theme === 'dark' ? 'dark' : 'light'

  useEffect(() => {
    if (!ref.current) return
    mountWidget(
      ref.current,
      'https://s3.tradingview.com/external-embedding/embed-widget-events.js',
      {
        colorTheme,
        isTransparent: true,
        width: '100%',
        height,
        locale: 'en',
        importanceFilter: '-1,0,1',
        countryFilter:
          'ar,au,br,ca,cn,fr,de,in,id,it,jp,kr,mx,ru,sa,za,tr,gb,us,eu',
      },
    )
  }, [colorTheme, height])

  return <div ref={ref} className={className} style={{ height, overflow: 'hidden' }} />
}

// ─── Forex Cross Rates ──────────────────────────────────────────────────────

export function ForexCrossRatesWidget({
  height = 400,
  className = '',
}: WidgetProps) {
  const ref = useRef<HTMLDivElement>(null)
  const { theme } = useTheme()
  const colorTheme = theme === 'dark' ? 'dark' : 'light'

  useEffect(() => {
    if (!ref.current) return
    mountWidget(
      ref.current,
      'https://s3.tradingview.com/external-embedding/embed-widget-forex-cross-rates.js',
      {
        width: '100%',
        height,
        currencies: ['EUR', 'USD', 'JPY', 'GBP', 'CHF', 'AUD', 'CAD', 'NZD'],
        isTransparent: true,
        colorTheme,
        locale: 'en',
      },
    )
  }, [colorTheme, height])

  return <div ref={ref} className={className} style={{ height, overflow: 'hidden' }} />
}

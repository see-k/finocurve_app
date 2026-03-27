import { useEffect, useRef } from 'react'
import { useTheme, themeToTradingViewColorTheme } from '../theme/ThemeContext'

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
  const colorTheme = themeToTradingViewColorTheme(theme)

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
  const colorTheme = themeToTradingViewColorTheme(theme)

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
  const colorTheme = themeToTradingViewColorTheme(theme)

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

// ─── Events (Economic calendar — https://www.tradingview.com/widget-docs/widgets/calendars/economic-calendar/ ) ─

export function EventsWidget({ height = 500, className = '' }: WidgetProps) {
  const ref = useRef<HTMLDivElement>(null)
  const { theme } = useTheme()
  const colorTheme = themeToTradingViewColorTheme(theme)

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
  const colorTheme = themeToTradingViewColorTheme(theme)

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

// ─── Heatmaps (Stock, Crypto, Forex, ETF) ───────────────────────────────────

export type HeatmapKind = 'stock' | 'crypto' | 'forex' | 'etf'

const HEATMAP_SCRIPT: Record<HeatmapKind, string> = {
  stock: 'https://s3.tradingview.com/external-embedding/embed-widget-stock-heatmap.js',
  crypto: 'https://s3.tradingview.com/external-embedding/embed-widget-crypto-coins-heatmap.js',
  forex: 'https://s3.tradingview.com/external-embedding/embed-widget-forex-heat-map.js',
  etf: 'https://s3.tradingview.com/external-embedding/embed-widget-etf-heatmap.js',
}

export function HeatmapWidget({
  kind,
  height = 560,
  className = '',
}: WidgetProps & { kind: HeatmapKind }) {
  const ref = useRef<HTMLDivElement>(null)
  const { theme } = useTheme()
  const colorTheme = themeToTradingViewColorTheme(theme)

  useEffect(() => {
    if (!ref.current) return
    const common = {
      width: '100%',
      height,
      autosize: false,
      colorTheme,
      isTransparent: true,
      locale: 'en',
    }

    let config: Record<string, unknown>
    switch (kind) {
      case 'stock':
        config = {
          ...common,
          dataSource: 'SPX500',
          exchanges: [],
          grouping: 'sector',
          blockSize: 'market_cap_basic',
          blockColor: 'change',
          hasTopBar: true,
          isDataSetEnabled: false,
          isZoomEnabled: true,
          hasSymbolTooltip: true,
          symbolUrl: '',
          isMonoSize: false,
        }
        break
      case 'crypto':
        config = {
          ...common,
          dataSource: 'Crypto',
          blockSize: 'market_cap_calc',
          blockColor: '24h_close_change|5',
          hasTopBar: true,
          isDataSetEnabled: false,
          isZoomEnabled: true,
          hasSymbolTooltip: true,
          symbolUrl: '',
          isMonoSize: false,
        }
        break
      case 'forex':
        config = {
          ...common,
          currencies: [
            'EUR',
            'USD',
            'JPY',
            'GBP',
            'CHF',
            'AUD',
            'CAD',
            'NZD',
            'CNY',
          ],
          frameElementId: null,
        }
        break
      case 'etf':
        config = {
          ...common,
          dataSource: 'AllUSEtf',
          grouping: 'asset_class',
          blockSize: 'volume',
          blockColor: 'change',
          hasTopBar: true,
          isDataSetEnabled: false,
          isZoomEnabled: true,
          hasSymbolTooltip: true,
          symbolUrl: '',
          isMonoSize: false,
        }
        break
    }

    mountWidget(ref.current, HEATMAP_SCRIPT[kind], config)
  }, [kind, colorTheme, height])

  return <div ref={ref} className={className} style={{ height, overflow: 'hidden' }} />
}

// ─── Screener ───────────────────────────────────────────────────────────────

export type ScreenerMarket = 'us' | 'forex' | 'crypto_mkt'

export function ScreenerWidget({
  market,
  height = 560,
  className = '',
}: WidgetProps & { market: ScreenerMarket }) {
  const ref = useRef<HTMLDivElement>(null)
  const { theme } = useTheme()
  const colorTheme = themeToTradingViewColorTheme(theme)

  useEffect(() => {
    if (!ref.current) return

    const base: Record<string, unknown> = {
      width: '100%',
      height,
      colorTheme,
      isTransparent: true,
      locale: 'en',
      showToolbar: true,
      defaultColumn: 'overview',
    }

    let config: Record<string, unknown>
    if (market === 'crypto_mkt') {
      config = {
        ...base,
        market: 'crypto',
        screener_type: 'crypto_mkt',
        displayCurrency: 'USD',
      }
    } else if (market === 'forex') {
      config = {
        ...base,
        market: 'forex',
        defaultScreen: 'general',
      }
    } else {
      config = {
        ...base,
        market: 'us',
        defaultScreen: 'most_capitalized',
      }
    }

    mountWidget(
      ref.current,
      'https://s3.tradingview.com/external-embedding/embed-widget-screener.js',
      config,
    )
  }, [market, colorTheme, height])

  return <div ref={ref} className={className} style={{ height, overflow: 'hidden' }} />
}

/**
 * Interactive World Choropleth Map
 * Uses react-simple-maps for professional-grade geographic visualization.
 * Color-codes countries by portfolio exposure percentage.
 */
import { useState, useMemo } from 'react'
import {
  ComposableMap,
  Geographies,
  Geography,
} from '@vnedyalk0v/react19-simple-maps'
import { Tooltip as ReactTooltip } from 'react-tooltip'
import geographyData from '@/data/countries-110m.json'

// TopoJSON object - avoids URL validation issues in Electron
const GEO_DATA = geographyData as { type: string; objects: Record<string, unknown>; arcs: unknown[] }

// ISO 3166 numeric → name mapping for major countries
const COUNTRY_NUM_TO_NAME: Record<string, string> = {
  '840': 'US', '826': 'UK', '276': 'DE', '250': 'FR', '392': 'JP',
  '156': 'CN', '356': 'IN', '036': 'AU', '124': 'CA', '076': 'BR',
  '410': 'KR', '756': 'CH', '528': 'NL', '380': 'IT', '724': 'ES',
  '752': 'SE', '578': 'NO', '208': 'DK', '246': 'FI', '372': 'IE',
  '158': 'TW', '702': 'SG', '344': 'HK', '554': 'NZ', '710': 'ZA',
  '484': 'MX', '032': 'AR', '682': 'SA', '784': 'AE', '376': 'IL',
  '643': 'RU', '616': 'PL', '056': 'BE', '040': 'AT',
}

// Map common portfolio country names / codes to ISO numeric
const NAME_TO_NUM: Record<string, string> = {}
// Build reverse mapping
for (const [num, code] of Object.entries(COUNTRY_NUM_TO_NAME)) {
  NAME_TO_NUM[code] = num
  NAME_TO_NUM[code.toLowerCase()] = num
}
// Also add common full names
const FULL_NAMES: Record<string, string> = {
  'United States': '840', 'USA': '840', 'US': '840',
  'United Kingdom': '826', 'UK': '826', 'Great Britain': '826', 'GB': '826',
  'Germany': '276', 'DE': '276',
  'France': '250', 'FR': '250',
  'Japan': '392', 'JP': '392',
  'China': '156', 'CN': '156',
  'India': '356', 'IN': '356',
  'Australia': '036', 'AU': '036',
  'Canada': '124', 'CA': '124',
  'Brazil': '076', 'BR': '076',
  'South Korea': '410', 'KR': '410', 'Korea': '410',
  'Switzerland': '756', 'CH': '756',
  'Netherlands': '528', 'NL': '528',
  'Italy': '380', 'IT': '380',
  'Spain': '724', 'ES': '724',
  'Sweden': '752', 'SE': '752',
  'Norway': '578', 'NO': '578',
  'Denmark': '208', 'DK': '208',
  'Finland': '246', 'FI': '246',
  'Ireland': '372', 'IE': '372',
  'Taiwan': '158', 'TW': '158',
  'Singapore': '702', 'SG': '702',
  'Hong Kong': '344', 'HK': '344',
  'New Zealand': '554', 'NZ': '554',
  'South Africa': '710', 'ZA': '710',
  'Mexico': '484', 'MX': '484',
  'Argentina': '032', 'AR': '032',
  'Saudi Arabia': '682', 'SA': '682',
  'UAE': '784', 'AE': '784', 'United Arab Emirates': '784',
  'Israel': '376', 'IL': '376',
  'Russia': '643', 'RU': '643',
  'Poland': '616', 'PL': '616',
  'Belgium': '056', 'BE': '056',
  'Austria': '040', 'AT': '040',
  'Unknown': '',
  'Global': '',
}

function resolveCountryToNum(name: string): string | null {
  if (FULL_NAMES[name]) return FULL_NAMES[name] || null
  if (NAME_TO_NUM[name]) return NAME_TO_NUM[name]
  if (NAME_TO_NUM[name.toUpperCase()]) return NAME_TO_NUM[name.toUpperCase()]
  return null
}

// Color scale: 0% → base gray, 100% → deep brand
function getExposureColor(pct: number, isDark: boolean): string {
  if (pct <= 0) return isDark ? '#1e293b' : '#e2e8f0'
  const stops = [
    { at: 0,  r: isDark ? 71 : 199, g: isDark ? 85 : 210, b: isDark ? 105 : 235 },
    { at: 15, r: 99,  g: 102, b: 241 },  // indigo
    { at: 40, r: 139, g: 92,  b: 246 },  // violet
    { at: 70, r: 236, g: 72,  b: 153 },  // pink
    { at: 100, r: 239, g: 68, b: 68  },  // red
  ]
  const clamped = Math.min(pct, 100)
  let lo = stops[0], hi = stops[stops.length - 1]
  for (let i = 0; i < stops.length - 1; i++) {
    if (clamped >= stops[i].at && clamped <= stops[i + 1].at) {
      lo = stops[i]; hi = stops[i + 1]; break
    }
  }
  const t = hi.at === lo.at ? 1 : (clamped - lo.at) / (hi.at - lo.at)
  const r = Math.round(lo.r + (hi.r - lo.r) * t)
  const g = Math.round(lo.g + (hi.g - lo.g) * t)
  const b = Math.round(lo.b + (hi.b - lo.b) * t)
  return `rgb(${r},${g},${b})`
}

interface WorldMapProps {
  /** Record of country name/code → allocation percentage */
  countryExposure: Record<string, number>
  /** Total portfolio value for dollar display */
  totalValue: number
  onCountryClick?: (country: string, pct: number) => void
}

export default function WorldMap({ countryExposure, totalValue, onCountryClick }: WorldMapProps) {
  const [tooltipContent, setTooltipContent] = useState('')
  const [hovered, setHovered] = useState<string | null>(null)

  const isDark = useMemo(() => {
    return document.documentElement.getAttribute('data-theme') === 'dark'
  }, [])

  // Build numeric-id → pct lookup
  const numericExposure = useMemo(() => {
    const map: Record<string, { pct: number; name: string }> = {}
    for (const [name, pct] of Object.entries(countryExposure)) {
      const num = resolveCountryToNum(name)
      if (num) map[num] = { pct, name }
    }
    return map
  }, [countryExposure])

  return (
    <div className="world-map-container">
      <ComposableMap
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- library branded type quirk
        projectionConfig={{ rotate: [-10, 0, 0], scale: 147 } as any}
        width={800}
        height={400}
        style={{ width: '100%', height: 'auto' }}
      >
        <Geographies geography={GEO_DATA}>
          {({ geographies }) =>
            geographies.map((geo) => {
              const numId = geo.id || geo.properties?.['ISO_A3_EH']
              const entry = numericExposure[numId]
              const pct = entry?.pct ?? 0
              const countryName = geo.properties?.name || entry?.name || 'Unknown'
              const isHovered = hovered === numId

              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  data-tooltip-id="map-tooltip"
                  data-tooltip-content={
                    pct > 0
                      ? `${countryName}: ${pct.toFixed(1)}% ($${((pct / 100) * totalValue).toLocaleString(undefined, { maximumFractionDigits: 0 })})`
                      : countryName
                  }
                  onMouseEnter={() => { setHovered(numId); setTooltipContent(countryName) }}
                  onMouseLeave={() => { setHovered(null); setTooltipContent('') }}
                  onClick={() => pct > 0 && onCountryClick?.(entry?.name || countryName, pct)}
                  style={{
                    default: {
                      fill: getExposureColor(pct, isDark),
                      stroke: isDark ? '#334155' : '#cbd5e1',
                      strokeWidth: 0.5,
                      outline: 'none',
                      transition: 'fill 0.2s ease',
                    },
                    hover: {
                      fill: pct > 0
                        ? getExposureColor(Math.min(pct + 15, 100), isDark)
                        : isDark ? '#334155' : '#cbd5e1',
                      stroke: '#6366f1',
                      strokeWidth: 1,
                      outline: 'none',
                      cursor: pct > 0 ? 'pointer' : 'default',
                    },
                    pressed: {
                      fill: '#6366f1',
                      stroke: '#6366f1',
                      strokeWidth: 1,
                      outline: 'none',
                    },
                  }}
                />
              )
            })
          }
        </Geographies>
      </ComposableMap>
      <ReactTooltip
        id="map-tooltip"
        style={{
          backgroundColor: 'var(--glass-bg-strong, rgba(15,23,42,0.95))',
          color: 'var(--text-primary, #f1f5f9)',
          borderRadius: '10px',
          fontSize: '13px',
          fontWeight: '600',
          padding: '8px 14px',
          border: '1px solid var(--glass-border, rgba(255,255,255,0.1))',
          zIndex: 1000,
        }}
      />
      {/* Legend */}
      <div className="world-map-legend">
        <span className="world-map-legend__label">0%</span>
        <div className="world-map-legend__bar" />
        <span className="world-map-legend__label">100%</span>
      </div>
    </div>
  )
}

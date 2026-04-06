import { useState } from 'react'

interface AssetLogoProps {
  symbol?: string
  name: string
  type: string
  size?: number
  borderRadius?: number
}

const TRUSTED_LOGO_HOSTS = new Set(['companiesmarketcap.com', 'raw.githubusercontent.com'])

function isTrustedLogoUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && TRUSTED_LOGO_HOSTS.has(u.hostname)
  } catch {
    return false
  }
}

/** Allow only typical ticker / crypto symbol characters in logo URL paths. */
function safeSymbolForLogoUrl(symbol: string): string | null {
  const s = symbol.trim().toUpperCase()
  if (s.length === 0 || s.length > 24 || !/^[A-Z0-9._-]+$/.test(s)) {
    return null
  }
  return s
}

const TYPE_COLORS: Record<string, string> = {
  stock: '#4A90D9',
  etf: '#7B68EE',
  crypto: '#F7931A',
  real_estate: '#4ECDC4',
  private_equity: '#6C5CE7',
  cash: '#2ECC71',
  bond: '#E17055',
  commodity: '#FFD700',
  other: '#636E72',
}

function getLogoUrls(symbol: string | undefined, type: string): string[] {
  if (!symbol) return []
  const s = safeSymbolForLogoUrl(symbol)
  if (!s) return []
  const urls: string[] = []

  switch (type) {
    case 'stock':
    case 'etf': {
      const u = `https://companiesmarketcap.com/img/company-logos/64/${s}.webp`
      if (isTrustedLogoUrl(u)) urls.push(u)
      break
    }
    case 'crypto': {
      const gh = `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/${s.toLowerCase()}.png`
      const cmc = `https://companiesmarketcap.com/img/company-logos/64/${s}.webp`
      if (isTrustedLogoUrl(gh)) urls.push(gh)
      if (isTrustedLogoUrl(cmc)) urls.push(cmc)
      break
    }
    default:
      break
  }
  return urls
}

function getDisplayText(symbol?: string, name?: string): string {
  if (symbol) {
    const clean = symbol.replace(/[^A-Za-z0-9]/g, '')
    return clean.length <= 4 ? clean.toUpperCase() : clean.substring(0, 4).toUpperCase()
  }
  if (name) return name[0].toUpperCase()
  return '?'
}

export default function AssetLogo({ symbol, name, type, size = 42, borderRadius = 12 }: AssetLogoProps) {
  const [imgError, setImgError] = useState(0)
  const urls = getLogoUrls(symbol, type)
  const color = TYPE_COLORS[type] || '#636E72'
  const text = getDisplayText(symbol, name)
  const fontSize = text.length >= 4 ? size * 0.25 : text.length >= 3 ? size * 0.3 : size * 0.38

  const fallback = (
    <div style={{
      width: size, height: size, borderRadius,
      background: `linear-gradient(135deg, ${color}, ${color}cc)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'white', fontSize, fontWeight: 700, letterSpacing: text.length > 2 ? -0.5 : 0,
      flexShrink: 0,
    }}>
      {text}
    </div>
  )

  if (urls.length === 0 || imgError >= urls.length) {
    return fallback
  }

  const padding = size * 0.15
  const imgSize = size - padding * 2

  return (
    <div style={{
      width: size, height: size, borderRadius,
      background: 'white',
      border: '1px solid rgba(255,255,255,0.15)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden', flexShrink: 0,
    }}>
      <img
        src={urls[imgError]}
        alt={name}
        width={imgSize}
        height={imgSize}
        style={{ objectFit: 'contain', borderRadius: borderRadius * 0.4 }}
        onError={() => setImgError(prev => prev + 1)}
      />
    </div>
  )
}

import { Globe, Layers, MapPin, PieChart as PieIcon } from 'lucide-react'
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts'
import GlassContainer from '../../../components/glass/GlassContainer'
import WorldMap from '../../../components/WorldMap'
import { SECTOR_LABELS, ASSET_TYPE_LABELS } from '../../../types'
import { CHART_COLORS, countryFlag, fmt, pieData } from './riskConstants'

interface ExposureTabProps {
  effectiveCountryPct: Record<string, number>
  effectiveTotalValue: number
  totalValue: number
  selectedCountry: { name: string; pct: number } | null
  setSelectedCountry: (value: { name: string; pct: number } | null) => void
  effectiveSectorAlloc: Record<string, number>
  effectiveTypeAlloc: Record<string, number>
}

export default function ExposureTab({
  effectiveCountryPct,
  effectiveTotalValue,
  totalValue,
  selectedCountry,
  setSelectedCountry,
  effectiveSectorAlloc,
  effectiveTypeAlloc,
}: ExposureTabProps) {
  return (
    <div className="risk-tab-content">
      {/* Interactive World Map */}
      <GlassContainer padding="24px" borderRadius={16}>
        <h3 className="risk-section-title"><Globe size={16} /> Geographic Exposure</h3>
        <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 16 }}>
          Hover over countries to see your allocation. Click a highlighted country for details.
        </p>
        <WorldMap
          countryExposure={effectiveCountryPct}
          totalValue={effectiveTotalValue}
          onCountryClick={(name, pct) => setSelectedCountry({ name, pct })}
        />
        {selectedCountry && (
          <div className="map-country-detail">
            <MapPin size={16} />
            <strong>{selectedCountry.name}</strong>
            <span>{selectedCountry.pct.toFixed(1)}% of portfolio</span>
            <span className="map-country-detail__val">
              {fmt((selectedCountry.pct / 100) * effectiveTotalValue)}
            </span>
            <button className="map-country-detail__close" onClick={() => setSelectedCountry(null)}>&times;</button>
          </div>
        )}
      </GlassContainer>

      {/* Country Breakdown List */}
      <GlassContainer padding="24px" borderRadius={16}>
        <h3 className="risk-section-title">Country Breakdown</h3>
        <div className="country-breakdown">
          {Object.entries(effectiveCountryPct).sort(([,a],[,b]) => b - a).map(([country, pct]) => (
            <div key={country} className="country-row">
              <span className="country-row__flag">{countryFlag(country)}</span>
              <span className="country-row__name">{country}</span>
              <div className="country-row__bar-bg">
                <div className="country-row__bar" style={{ width: `${pct}%` }} />
              </div>
              <span className="country-row__pct">{pct.toFixed(1)}%</span>
              <span className="country-row__val">{fmt((pct / 100) * totalValue)}</span>
            </div>
          ))}
        </div>
      </GlassContainer>

      {/* Sector + Type pie charts */}
      {[
        { title: 'Sector Exposure', icon: <PieIcon size={16} />, data: pieData(effectiveSectorAlloc, SECTOR_LABELS as Record<string, string>) },
        { title: 'Asset Type Breakdown', icon: <Layers size={16} />, data: pieData(effectiveTypeAlloc, ASSET_TYPE_LABELS as Record<string, string>) },
      ].map(({ title, icon, data }) => (
        <GlassContainer key={title} padding="24px" borderRadius={16}>
          <h3 className="risk-section-title">{icon} {title}</h3>
          <div className="exposure-row">
            <div className="exposure-chart">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={45}>
                    {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'var(--glass-bg-strong)', border: '1px solid var(--glass-border)', borderRadius: 10, fontSize: 12 }}
                    formatter={(v) => {
                      if (v == null || typeof v !== 'number' || Number.isNaN(v)) return ['—', 'Value']
                      return [fmt(v), 'Value']
                    }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="exposure-legend">
              {data.map((d, i) => (
                <div key={d.name} className="exposure-legend__item">
                  <div className="exposure-legend__dot" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                  <span className="exposure-legend__name">{d.name}</span>
                  <span className="exposure-legend__val">{fmt(d.value)}</span>
                  <span className="exposure-legend__pct">{totalValue > 0 ? ((d.value / totalValue) * 100).toFixed(1) : 0}%</span>
                </div>
              ))}
            </div>
          </div>
        </GlassContainer>
      ))}
    </div>
  )
}

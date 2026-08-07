import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { ChartSpec } from '../../ai/chartSpec'

const CHART_COLORS = [
  'var(--brand-primary)',
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
]

const tooltipStyle = {
  background: 'var(--chart-tooltip-bg, var(--glass-bg-strong))',
  border: '1px solid var(--glass-border)',
  borderRadius: 8,
  fontSize: 12,
  color: 'var(--text-primary)',
}

function seriesData(spec: ChartSpec) {
  return spec.labels.map((label, i) => ({
    label,
    value: spec.values[i] ?? 0,
  }))
}

export default function ChatChart({ spec }: { spec: ChartSpec }) {
  const data = seriesData(spec)
  const height = spec.type === 'pie' ? 220 : 200

  return (
    <figure className="ai-chat-chart" aria-label={spec.title || `${spec.type} chart`}>
      {spec.title ? <figcaption className="ai-chat-chart__title">{spec.title}</figcaption> : null}
      <div className="ai-chat-chart__plot" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          {spec.type === 'bar' ? (
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid stroke="var(--divider, var(--glass-border))" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                interval={0}
                angle={data.length > 6 ? -25 : 0}
                textAnchor={data.length > 6 ? 'end' : 'middle'}
                height={data.length > 6 ? 48 : 28}
              />
              <YAxis
                tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={48}
              />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {data.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          ) : spec.type === 'line' ? (
            <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid stroke="var(--divider, var(--glass-border))" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={48}
              />
              <Tooltip contentStyle={tooltipStyle} />
              <Line
                type="monotone"
                dataKey="value"
                stroke="var(--brand-primary)"
                strokeWidth={2}
                dot={{ r: 3, fill: 'var(--brand-primary)' }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          ) : (
            <PieChart>
              <Pie
                data={data.filter((d) => d.value > 0)}
                dataKey="value"
                nameKey="label"
                cx="50%"
                cy="50%"
                outerRadius={72}
                innerRadius={28}
                paddingAngle={1}
              >
                {data
                  .filter((d) => d.value > 0)
                  .map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
              <Legend
                wrapperStyle={{ fontSize: 11, color: 'var(--text-secondary)' }}
                iconType="circle"
                iconSize={8}
              />
            </PieChart>
          )}
        </ResponsiveContainer>
      </div>
    </figure>
  )
}

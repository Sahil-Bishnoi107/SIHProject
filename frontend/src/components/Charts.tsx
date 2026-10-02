import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, Area, AreaChart, BarChart, Bar, Cell } from 'recharts'

export const palette = ['#0369a1', '#d97706', '#15803d', '#dc2626', '#7c3aed', '#0d9488', '#db2777', '#a16207']

const axis = { stroke: '#94a3b8', fontSize: 11, tick: { fill: '#64748b' }, tickLine: false }
const tooltipStyle = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, boxShadow: '0 4px 12px rgba(15,23,42,0.12)' }

export type LineDef = { key: string; name: string; color?: string; dashed?: boolean }

type Props = {
  data: Record<string, number | null>[]
  x: string
  xLabel?: string
  yLabel?: string
  lines: LineDef[]
  tall?: boolean
  refY?: { y: number; label: string }[]
  refX?: { x: number; label: string }[]
}

export function Lines({ data, x, xLabel, yLabel, lines, tall, refY, refX }: Props) {
  return (
    <div className={`chart-box ${tall ? 'tall' : ''}`}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 6, right: 12, bottom: 16, left: 4 }}>
          <CartesianGrid stroke="#eef2f6" vertical={false} />
          <XAxis dataKey={x} {...axis} type="number" domain={['dataMin', 'dataMax']} tickFormatter={v => fmtTick(v)}
            label={xLabel ? { value: xLabel, position: 'insideBottom', offset: -8, fill: '#64748b', fontSize: 11 } : undefined} />
          <YAxis {...axis} width={56} tickFormatter={v => fmtTick(v)}
            label={yLabel ? { value: yLabel, angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 11, dy: 30 } : undefined} />
          <Tooltip contentStyle={tooltipStyle} labelFormatter={v => `${xLabel ?? x}: ${fmtTick(Number(v))}`}
            formatter={(v: any) => (typeof v === 'number' ? v.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : v)} />
          <Legend verticalAlign="top" align="right" height={22} wrapperStyle={{ fontSize: 11, color: '#475569' }} iconType="plainline" />
          {refY?.map(r => <ReferenceLine key={r.label} y={r.y} stroke="#d97706" strokeDasharray="4 3" label={{ value: r.label, fill: '#b45309', fontSize: 10, position: 'right' }} />)}
          {refX?.map(r => <ReferenceLine key={r.label} x={r.x} stroke="#dc2626" strokeDasharray="4 3" label={{ value: r.label, fill: '#b91c1c', fontSize: 10, position: 'top' }} />)}
          {lines.map((l, i) => (
            <Line key={l.key} dataKey={l.key} name={l.name} stroke={l.color ?? palette[i % palette.length]} dot={false}
              strokeWidth={1.8} strokeDasharray={l.dashed ? '5 4' : undefined} isAnimationActive={false} connectNulls />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export function Profile({ data }: { data: { km: number; bed: number; ws: number | null }[] }) {
  return (
    <div className="chart-box tall">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 6, right: 12, bottom: 16, left: 4 }}>
          <CartesianGrid stroke="#eef2f6" vertical={false} />
          <XAxis dataKey="km" {...axis} type="number" domain={['dataMin', 'dataMax']}
            label={{ value: 'distance below dam (km)', position: 'insideBottom', offset: -8, fill: '#64748b', fontSize: 11 }} />
          <YAxis {...axis} width={56} domain={['auto', 'auto']} />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend verticalAlign="top" align="right" height={22} wrapperStyle={{ fontSize: 11, color: '#475569' }} iconType="plainline" />
          <Area dataKey="ws" name="max water surface (m)" stroke="#0369a1" fill="rgba(3,105,161,0.22)" isAnimationActive={false} connectNulls={false} />
          <Area dataKey="bed" name="river bed (m)" stroke="#92400e" fill="rgba(180,120,60,0.35)" isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

export function Bars({ data, x, y, colors }: { data: Record<string, any>[]; x: string; y: string; colors?: string[] }) {
  return (
    <div className="chart-box">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 6, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid stroke="#eef2f6" vertical={false} />
          <XAxis dataKey={x} {...axis} />
          <YAxis {...axis} width={50} />
          <Tooltip contentStyle={tooltipStyle} />
          <Bar dataKey={y} isAnimationActive={false}>
            {data.map((_, i) => <Cell key={i} fill={colors?.[i] ?? palette[0]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function fmtTick(v: number) {
  if (!Number.isFinite(v)) return ''
  const a = Math.abs(v)
  if (a >= 1e6) return (v / 1e6).toFixed(1) + 'M'
  if (a >= 1e4) return (v / 1e3).toFixed(0) + 'k'
  if (a >= 100) return v.toFixed(0)
  return v.toFixed(a < 10 ? 2 : 1).replace(/\.?0+$/, '')
}

/** zip parallel arrays into chart rows */
export function rows(t: number[], cols: Record<string, (number | null)[]>, tScale = 1) {
  return t.map((tv, i) => {
    const r: Record<string, number | null> = { t: +(tv * tScale).toFixed(3) }
    for (const [k, arr] of Object.entries(cols)) r[k] = arr[i] ?? null
    return r
  })
}

import { useId, useMemo, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { PhoneCall } from 'lucide-react'

export const LAURA_CHART_COLORS = ['#0a55b8', '#2563eb', '#3b82f6', '#60a5fa', '#7dd3fc', '#f59e0b'] as const

export type LauraRadarAxis = {
  label: string
  short: string
  value: number
  color: string
  count?: number
}

export type LauraPieSlice = {
  label: string
  value: string
  pct: number
  color: string
  icon?: boolean
  count?: number
}

export type LauraParetoRow = {
  key: string
  label: string
  value: number
}

export function pieGradient(slices: { pct: number; color: string }[]): string {
  let start = 0
  const stops = slices.map((slice) => {
    const end = start + slice.pct
    const stop = `${slice.color} ${start}% ${end}%`
    start = end
    return stop
  })
  return `conic-gradient(${stops.join(', ')})`
}

export function polarPoint(cx: number, cy: number, radius: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) }
}

function donutSlicePath(
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  startPct: number,
  endPct: number,
): string {
  const span = Math.max(0, Math.min(100, endPct) - Math.max(0, startPct))
  if (span <= 0) return ''
  if (span >= 99.95) {
    return [
      `M ${cx} ${cy - outer}`,
      `A ${outer} ${outer} 0 1 1 ${cx} ${cy + outer}`,
      `A ${outer} ${outer} 0 1 1 ${cx} ${cy - outer}`,
      `M ${cx} ${cy - inner}`,
      `A ${inner} ${inner} 0 1 0 ${cx} ${cy + inner}`,
      `A ${inner} ${inner} 0 1 0 ${cx} ${cy - inner}`,
    ].join(' ')
  }
  const a0 = startPct * 3.6
  const a1 = endPct * 3.6
  const p0 = polarPoint(cx, cy, outer, a0)
  const p1 = polarPoint(cx, cy, outer, a1)
  const q1 = polarPoint(cx, cy, inner, a1)
  const q0 = polarPoint(cx, cy, inner, a0)
  const large = span > 50 ? 1 : 0
  return [
    `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)}`,
    `A ${outer} ${outer} 0 ${large} 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`,
    `L ${q1.x.toFixed(2)} ${q1.y.toFixed(2)}`,
    `A ${inner} ${inner} 0 ${large} 0 ${q0.x.toFixed(2)} ${q0.y.toFixed(2)}`,
    'Z',
  ].join(' ')
}

export function formatLauraPct(value: number): string {
  return `${value.toLocaleString('es-ES', { maximumFractionDigits: 1 })}%`
}

type ChartTipData = {
  x: number
  y: number
  title: string
  color?: string
  lines: { label: string; value: string }[]
}

function formatCount(value: number): string {
  return value.toLocaleString('es-ES')
}

function ChartTip({ tip }: { tip: ChartTipData | null }) {
  if (!tip || typeof document === 'undefined') return null
  const width = 228
  const left = tip.x + 16 + width > window.innerWidth - 8 ? Math.max(8, tip.x - 16 - width) : tip.x + 16
  const top = tip.y + 132 > window.innerHeight - 8 ? Math.max(8, tip.y - 124) : tip.y + 14
  return createPortal(
    <div className="laura-chart-tip glass glass-lite" style={{ left, top }} role="status">
      <p>
        {tip.color ? <i style={{ background: tip.color }} aria-hidden /> : null}
        <strong>{tip.title}</strong>
      </p>
      <dl>
        {tip.lines.map((line) => (
          <div key={line.label}>
            <dt>{line.label}</dt>
            <dd>{line.value}</dd>
          </div>
        ))}
      </dl>
    </div>,
    document.body,
  )
}

function useChartTip() {
  const [tip, setTip] = useState<ChartTipData | null>(null)
  const show = (event: ReactPointerEvent, next: Omit<ChartTipData, 'x' | 'y'>) => {
    setTip({ ...next, x: event.clientX, y: event.clientY })
  }
  const hide = () => setTip(null)
  return { tip, show, hide }
}

export function LauraRadar({
  caption,
  axes,
  scaleMax,
}: {
  caption: string
  axes: LauraRadarAxis[]
  scaleMax?: number
}) {
  const rawId = useId().replace(/[^a-zA-Z0-9]/g, '')
  const fillId = `lauraRadarFill${rawId}`
  const size = 320
  const cx = size / 2
  const cy = size / 2 + 4
  const radius = 104
  const max = scaleMax ?? Math.max(50, ...axes.map((axis) => axis.value), 1)
  const ringValues = [0.2, 0.4, 0.6, 0.8, 1].map((part) => Math.round(max * part * 10) / 10)
  const step = axes.length > 0 ? 360 / axes.length : 72

  const ringPaths = ringValues.map((value) =>
    axes
      .map((_, index) => {
        const point = polarPoint(cx, cy, radius * (value / max), index * step)
        return `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`
      })
      .join(' ') + ' Z',
  )
  const valuePts = axes.map((axis, index) =>
    polarPoint(cx, cy, radius * (Math.min(axis.value, max) / max), index * step),
  )
  const valuePath =
    valuePts.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ') +
    ' Z'
  const labelPts = axes.map((axis, index) => ({
    ...axis,
    ...polarPoint(cx, cy, radius + 34, index * step),
  }))
  const { tip, show, hide } = useChartTip()
  const sectorPaths = axes.map((_, index) => {
    const start = index * step - step / 2
    const end = index * step + step / 2
    const a = polarPoint(cx, cy, radius + 28, start)
    const b = polarPoint(cx, cy, radius + 28, end)
    const large = step > 180 ? 1 : 0
    return `M${cx.toFixed(1)},${cy.toFixed(1)} L${a.x.toFixed(1)},${a.y.toFixed(1)} A${radius + 28},${radius + 28} 0 ${large} 1 ${b.x.toFixed(1)},${b.y.toFixed(1)} Z`
  })

  if (axes.length === 0) {
    return (
      <div className="laura-chart-block">
        <p className="section-subtitle">{caption}</p>
        <p className="section-subtitle">Aún no hay consultas en este periodo.</p>
      </div>
    )
  }

  return (
    <div className="laura-chart-block">
      <div className="laura-radar" aria-hidden>
        <div className="laura-radar-stage">
          <svg viewBox={`0 0 ${size} ${size}`} className="laura-radar-svg">
            <defs>
              <radialGradient id={fillId} cx="50%" cy="42%" r="68%">
                <stop offset="0%" stopColor="rgba(96,165,250,0.55)" />
                <stop offset="100%" stopColor="rgba(11,99,214,0.28)" />
              </radialGradient>
            </defs>
            {ringPaths.map((d, index) => (
              <path key={d} className="laura-radar-ring" d={d} style={{ ['--i' as string]: String(index) }} />
            ))}
            {axes.map((_, index) => {
              const point = polarPoint(cx, cy, radius, index * step)
              return (
                <line
                  key={index}
                  className="laura-radar-axis"
                  x1={cx}
                  y1={cy}
                  x2={point.x}
                  y2={point.y}
                  style={{ ['--i' as string]: String(index) }}
                />
              )
            })}
            <path className="laura-radar-area" d={valuePath} style={{ fill: `url(#${fillId})` }} />
            {valuePts.map((point, index) => (
              <circle
                key={index}
                className={`laura-radar-dot${tip?.title === axes[index]?.label ? ' is-hot' : ''}`}
                cx={point.x}
                cy={point.y}
                r="5"
                style={{ ['--i' as string]: String(index) }}
              />
            ))}
            {sectorPaths.map((d, index) => {
              const axis = axes[index]
              if (!axis) return null
              return (
                <path
                  key={`hit-${axis.label}`}
                  className="laura-chart-hit"
                  d={d}
                  onPointerMove={(event) =>
                    show(event, {
                      title: axis.label,
                      color: axis.color,
                      lines: [
                        { label: 'Peso', value: formatLauraPct(axis.value) },
                        ...(axis.count != null ? [{ label: 'Consultas', value: formatCount(axis.count) }] : []),
                      ],
                    })
                  }
                  onPointerLeave={hide}
                />
              )
            })}
            {ringValues.map((value) => {
              const point = polarPoint(cx, cy, radius * (value / max), 0)
              return (
                <text key={value} className="laura-radar-scale" x={cx + 5} y={point.y + 3}>
                  {Number.isInteger(value) ? `${value}%` : formatLauraPct(value)}
                </text>
              )
            })}
          </svg>
          {labelPts.map((item) => (
            <span
              key={item.label}
              className="laura-radar-label"
              style={{ left: `${(item.x / size) * 100}%`, top: `${(item.y / size) * 100}%` }}
            >
              <b style={{ color: item.color }}>{formatLauraPct(item.value)}</b>
              {item.short}
            </span>
          ))}
        </div>
      </div>
      <p className="section-subtitle">{caption}</p>
      <ul className="laura-legend">
        {axes.map((item) => (
          <li key={item.label}>
            <i style={{ background: item.color }} aria-hidden />
            <span>{item.label}</span>
            <strong>{formatLauraPct(item.value)}</strong>
          </li>
        ))}
      </ul>
      <ChartTip tip={tip} />
    </div>
  )
}

export function LauraUprightPie({
  caption,
  slices,
  centerValue,
  centerLabel,
}: {
  caption: string
  slices: LauraPieSlice[]
  centerValue?: string
  centerLabel?: string
}) {
  const gradient = pieGradient(slices)
  const box = 200
  const cxy = box / 2
  let acc = 0
  const callouts = slices.map((slice) => {
    const midPct = acc + slice.pct / 2
    acc += slice.pct
    const point = polarPoint(cxy, cxy, box * 0.42, midPct * 3.6)
    return { ...slice, x: (point.x / box) * 100, y: (point.y / box) * 100 }
  })
  const lead = slices[0]
  const { tip, show, hide } = useChartTip()
  const [hotSlice, setHotSlice] = useState<string | null>(null)
  let sliceStart = 0
  const sliceHits = slices.map((slice) => {
    const start = sliceStart
    sliceStart += slice.pct
    const d = donutSlicePath(100, 100, 96, 38, start, start + slice.pct)
    return { ...slice, start, d }
  })

  if (slices.length === 0) {
    return (
      <div className="laura-chart-block">
        <p className="section-subtitle">{caption}</p>
        <p className="section-subtitle">Aún no hay consultas en este periodo.</p>
      </div>
    )
  }

  return (
    <div className="laura-chart-block">
      <div className="laura-upie">
        <div className="laura-upie-stage" aria-hidden>
          {Array.from({ length: 14 }, (_, layer) => (
            <span
              key={layer}
              className={`laura-upie-layer${layer === 0 ? ' is-face' : ''}`}
              style={{ background: gradient, ['--z' as string]: String(layer) }}
            />
          ))}
          <span className="laura-upie-hole">
            <b>{centerValue ?? lead?.value}</b>
            <small>{centerLabel ?? 'Canal'}</small>
          </span>
          <svg className="laura-upie-hits" viewBox="0 0 200 200" aria-hidden>
            {sliceHits.map((item) => (
              <path
                key={item.label}
                className={`laura-chart-hit${hotSlice === item.label ? ' is-hot' : ''}`}
                d={item.d}
                onPointerMove={(event) => {
                  setHotSlice(item.label)
                  show(event, {
                    title: item.label,
                    color: item.color,
                    lines: [
                      { label: 'Parte', value: item.value },
                      ...(item.count != null ? [{ label: 'Consultas', value: formatCount(item.count) }] : []),
                    ],
                  })
                }}
                onPointerLeave={() => {
                  setHotSlice(null)
                  hide()
                }}
              />
            ))}
          </svg>
        </div>
        <div className="laura-upie-callouts">
          {callouts.map((item, index) => (
            <span
              key={item.label}
              className="laura-upie-tag"
              style={{
                left: `${item.x}%`,
                top: `${item.y}%`,
                ['--dot' as string]: item.color,
                ['--i' as string]: String(index),
              }}
            >
              {item.value}
            </span>
          ))}
        </div>
      </div>
      <p className="section-subtitle">{caption}</p>
      <ul className="laura-legend">
        {slices.map((item) => (
          <li key={item.label}>
            <i style={{ background: item.color }} aria-hidden />
            <span>
              {item.icon ? <PhoneCall size={14} aria-hidden /> : null}
              {item.label}
            </span>
            <strong>{item.value}</strong>
          </li>
        ))}
      </ul>
      <ChartTip tip={tip} />
    </div>
  )
}

export function LauraPareto({
  eyebrow,
  title,
  legend,
  rows,
  sortByValue = false,
  dense = false,
  barLabel = 'Volumen',
  lineLabel = 'Acumulado Pareto',
  empty = 'Aún no hay consultas en este periodo.',
}: {
  eyebrow?: string
  title: string
  legend?: string[]
  rows: LauraParetoRow[]
  sortByValue?: boolean
  dense?: boolean
  barLabel?: string
  lineLabel?: string
  empty?: string
}) {
  const plotted = useMemo(() => {
    const source = sortByValue ? [...rows].sort((a, b) => b.value - a.value) : rows
    const total = source.reduce((sum, item) => sum + item.value, 0)
    let acc = 0
    return source.map((item) => {
      acc += item.value
      return {
        ...item,
        share: total > 0 ? (item.value / total) * 100 : 0,
        cumulative: total > 0 ? (acc / total) * 100 : 0,
      }
    })
  }, [rows, sortByValue])
  const maxVolume = Math.max(1, ...plotted.map((item) => item.value))
  const cols = plotted.length
  const { tip, show, hide } = useChartTip()
  const [hotKey, setHotKey] = useState<string | null>(null)
  const total = plotted.reduce((sum, item) => sum + item.value, 0)
  const linePoints = plotted
    .map((item, index) => {
      const x = ((index + 0.5) / Math.max(1, cols)) * 100
      const y = 100 - item.cumulative
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')

  const showXLabel = (index: number) => {
    if (!dense || cols <= 12) return true
    if (index === 0 || index === cols - 1) return true
    const step = cols > 20 ? 5 : 2
    return (index + 1) % step === 0
  }

  return (
    <>
      <div className="laura-chart-head">
        <div>
          {eyebrow ? <p className="section-eyebrow">{eyebrow}</p> : null}
          <h2 className="ops-card-title">{title}</h2>
        </div>
        {legend && legend.length > 0 ? (
          <div className="laura-chart-legend">
            {legend.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        ) : null}
      </div>
      {cols === 0 || plotted.every((item) => item.value === 0) ? (
        <p className="section-subtitle" style={{ marginTop: 16 }}>
          {empty}
        </p>
      ) : (
        <>
          <div
            className={`laura-pareto${dense ? ' is-dense' : ''}`}
            role="img"
            aria-label={`${title}. ${barLabel} y ${lineLabel}.`}
            style={{ ['--cols' as string]: String(cols) } as CSSProperties}
          >
            <div className="laura-pareto-axis is-left" aria-hidden>
              <span>{maxVolume}</span>
              <span>{Math.round(maxVolume * 0.5)}</span>
              <span>0</span>
            </div>
            <div className="laura-pareto-plot">
              <div className="laura-pareto-grid" aria-hidden>
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
              <div className="laura-pareto-bars">
                {plotted.map((item, index) => (
                  <div
                    key={item.key}
                    className={`laura-pareto-col${hotKey === item.key ? ' is-hot' : ''}`}
                    style={{ ['--i' as string]: String(index) }}
                    onPointerMove={(event) => {
                      setHotKey(item.key)
                      show(event, {
                        title: item.label,
                        color: '#0a55b8',
                        lines: [
                          { label: barLabel, value: formatCount(item.value) },
                          { label: 'Peso', value: formatLauraPct(item.share) },
                          { label: lineLabel, value: formatLauraPct(item.cumulative) },
                          { label: 'Total del periodo', value: formatCount(total) },
                        ],
                      })
                    }}
                    onPointerLeave={() => {
                      setHotKey(null)
                      hide()
                    }}
                  >
                    {!dense ? <span className="laura-pareto-value">{item.value}</span> : null}
                    <span className="laura-pareto-bar" style={{ height: `${(item.value / maxVolume) * 100}%` }} />
                  </div>
                ))}
              </div>
              <svg className="laura-pareto-line" viewBox="0 0 100 100" preserveAspectRatio="none">
                <polyline points={linePoints} vectorEffect="non-scaling-stroke" pathLength={100} />
              </svg>
              {plotted.map((item, index) =>
                dense && !showXLabel(index) ? null : (
                  <span
                    key={`dot-${item.key}`}
                    className="laura-pareto-dot"
                    style={{
                      left: `${((index + 0.5) / cols) * 100}%`,
                      bottom: `${item.cumulative}%`,
                      ['--i' as string]: String(index),
                    }}
                  >
                    {!dense ? <em>{Math.round(item.cumulative)}%</em> : null}
                  </span>
                ),
              )}
            </div>
            <div className="laura-pareto-axis is-right" aria-hidden>
              <span>100%</span>
              <span>50%</span>
              <span>0%</span>
            </div>
          </div>
          <div className={`laura-pareto-xaxis${dense ? ' is-dense' : ''}`} aria-hidden style={{ ['--cols' as string]: String(cols) } as CSSProperties}>
            {plotted.map((item, index) => (
              <span key={`x-${item.key}`}>{showXLabel(index) ? item.label : ''}</span>
            ))}
          </div>
          <ul className="laura-chart-keys">
            <li>
              <i className="is-auto" aria-hidden />
              {barLabel}
            </li>
            <li>
              <i className="is-derived" aria-hidden />
              {lineLabel}
            </li>
          </ul>
          <ChartTip tip={tip} />
        </>
      )}
    </>
  )
}

export function mixToPieSlices(rows: { key: string; label: string; value: number }[]): LauraPieSlice[] {
  const total = rows.reduce((sum, row) => sum + row.value, 0)
  if (total <= 0) return []
  return rows.map((row, index) => {
    const pct = (row.value / total) * 100
    return {
      label: row.label,
      value: formatLauraPct(pct),
      pct,
      count: row.value,
      color: LAURA_CHART_COLORS[index % LAURA_CHART_COLORS.length],
      icon: /llamad|voz/i.test(row.label),
    }
  })
}

export function mixToRadarAxes(rows: { key: string; label: string; value: number }[]): LauraRadarAxis[] {
  const total = rows.reduce((sum, row) => sum + row.value, 0)
  if (total <= 0) return []
  return rows.map((row, index) => ({
    label: row.label,
    short: row.label.length > 14 ? `${row.label.slice(0, 12)}…` : row.label,
    value: Math.round((row.value / total) * 1000) / 10,
    count: row.value,
    color: LAURA_CHART_COLORS[index % LAURA_CHART_COLORS.length],
  }))
}

export function LauraChartCardHeader({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string
  title: string
  children?: ReactNode
}) {
  return (
    <div className="laura-chart-head">
      <div>
        <p className="section-eyebrow">{eyebrow}</p>
        <h2 className="ops-card-title">{title}</h2>
      </div>
      {children}
    </div>
  )
}

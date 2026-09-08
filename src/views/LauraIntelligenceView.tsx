import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, Camera, Coins, Mic, PhoneCall, Sparkles, Timer, Trash2 } from 'lucide-react'
import Card from '../components/ui/Card'
import LauraCallCosts from '../components/LauraCallCosts'
import { resizeImageFile } from '../lib/lauraProfile'
import {
  BOT_CONFIG_EVENT,
  loadActiveBotProfile,
  updateBotProfile,
} from '../lib/botProfiles'

type LauraTab = 'rendimiento' | 'calidad' | 'sla' | 'costes'

const DAILY = [
  { day: '24', volume: 148 },
  { day: '25', volume: 162 },
  { day: '26', volume: 175 },
  { day: '27', volume: 159 },
  { day: '28', volume: 180 },
  { day: '01', volume: 134 },
  { day: '02', volume: 191 },
  { day: '03', volume: 204 },
  { day: '04', volume: 129 },
]

const TIPOLOGIA = [
  { label: 'Cita Mecánica', short: 'Mecánica', value: 42, color: '#0a55b8' },
  { label: 'Cita Carrocería', short: 'Carrocería', value: 24, color: '#2563eb' },
  { label: 'Peritaje de Seguros', short: 'Peritaje', value: 18, color: '#3b82f6' },
  { label: 'Recambios y Flotas', short: 'Recambios', value: 11, color: '#60a5fa' },
  { label: 'Ventas VN / VO', short: 'Ventas', value: 5, color: '#7dd3fc' },
] as const

const PRECISION = [
  {
    value: '99,4%',
    pct: 99.4,
    cobertura: 97.5,
    muestras: 1482,
    color: '#0a55b8',
    title: 'Reconocimiento de Matrícula (OCR / Fonética)',
    detail: 'Validación contra formato DGT (4 dígitos + 3 letras)',
  },
  {
    value: '94,8%',
    pct: 94.8,
    cobertura: 92,
    muestras: 1162,
    color: '#f59e0b',
    title: 'Acierto en Asignación de Box / Operación',
    detail: 'Correcta tipificación (Mecánica, Chapa, Peritaje, EV)',
  },
  {
    value: '96,8%',
    pct: 96.8,
    cobertura: 88,
    muestras: 420,
    color: '#22a06b',
    title: 'Cumplimiento SLA Alerta Asesor (<15 min)',
    detail: 'Tiempo medio de primer contacto humano: 8,5 minutos',
  },
]

type Props = {
  workshopName: string
}

export default function LauraIntelligenceView({ workshopName }: Props) {
  const [tab, setTab] = useState<LauraTab>('rendimiento')

  return (
    <div className="dashboard-page laura-page">
      <LauraProfileCard workshopName={workshopName} />

      <div className="triage-view-switch" role="tablist" aria-label="Paneles de Laura">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'rendimiento'}
          className={`triage-view-btn ${tab === 'rendimiento' ? 'is-active' : ''}`}
          onClick={() => setTab('rendimiento')}
        >
          <Activity size={16} aria-hidden />
          Rendimiento Bot
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'calidad'}
          className={`triage-view-btn ${tab === 'calidad' ? 'is-active' : ''}`}
          onClick={() => setTab('calidad')}
        >
          <Mic size={16} aria-hidden />
          Calidad de Diagnóstico
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'sla'}
          className={`triage-view-btn ${tab === 'sla' ? 'is-active' : ''}`}
          onClick={() => setTab('sla')}
        >
          <Timer size={16} aria-hidden />
          Tiempos &amp; SLA DMS
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'costes'}
          className={`triage-view-btn ${tab === 'costes' ? 'is-active' : ''}`}
          onClick={() => setTab('costes')}
        >
          <Coins size={16} aria-hidden />
          Costes de llamadas
        </button>
      </div>

      {tab === 'rendimiento' || tab === 'sla' ? (
        <section className="laura-kpi-grid" aria-label="Indicadores de Laura">
          <article className="metric glass glass-lite">
            <span>Llamadas Atendidas</span>
            <strong>1.482</strong>
            <small>+14,2% vs semana anterior (Red Ditevo)</small>
          </article>
          <article className="metric glass glass-lite">
            <span>Tasa Automatización</span>
            <strong>78,4%</strong>
            <small>Meta &gt;75% · 1.162 citas cerradas 100% IA</small>
          </article>
          <article className="metric glass glass-lite">
            <span>Tiempo Medio Conversación</span>
            <strong>2m 14s</strong>
            <small>−18s · Cualificación y síntesis diagnóstica</small>
          </article>
          <article className="metric glass glass-lite">
            <span>Derivaciones Humanas / SLA</span>
            <strong>42</strong>
            <small>96,8% OK · Casos complejos atendidos &lt;15 min</small>
          </article>
        </section>
      ) : null}

      {tab === 'rendimiento' ? (
        <>
          <PrecisionBlock />
          <section className="laura-split">
            <Card className="laura-panel" padding="md">
              <p className="section-eyebrow">Distribución por Tipología</p>
              <h2 className="ops-card-title">Pentágono 3D · Clasificación IA según motivo</h2>
              <Radar3D
                caption="5 ramas de posventa · escala 0–50%"
                axes={TIPOLOGIA.map((item) => ({
                  label: item.label,
                  short: item.short,
                  value: item.value,
                  color: item.color,
                }))}
              />
            </Card>
            <Card className="laura-panel" padding="md">
              <p className="section-eyebrow">Distribución por Canal</p>
              <h2 className="ops-card-title">Pastel vertical · Entradas a centralita</h2>
              <UprightPie
                caption="Disco 3D de pie · Canal Voz"
                slices={[
                  { label: 'Voz Telefónica (Laura AI)', value: '98,7%', pct: 98.7, color: '#0a55b8', icon: true },
                  { label: 'WhatsApp', value: '1,3%', pct: 1.3, color: '#f59e0b' },
                ]}
              />
            </Card>
          </section>
          <ParetoChart />
        </>
      ) : null}

      {tab === 'calidad' ? (
        <>
          <PrecisionBlock />
          <section className="laura-split">
            <Card className="laura-panel" padding="md">
              <p className="section-eyebrow">Distribución por Tipología</p>
              <h2 className="ops-card-title">Pentágono 3D · Clasificación IA según motivo</h2>
              <Radar3D
                caption="5 ramas de posventa · escala 0–50%"
                axes={TIPOLOGIA.map((item) => ({
                  label: item.label,
                  short: item.short,
                  value: item.value,
                  color: item.color,
                }))}
              />
            </Card>
            <Card className="laura-panel" padding="md">
              <p className="section-eyebrow">Canal de entrada</p>
              <h2 className="ops-card-title">Pastel vertical · Entradas a centralita</h2>
              <UprightPie
                caption="Disco 3D de pie · Voz frente a WhatsApp"
                slices={[
                  { label: 'Voz Telefónica (Laura AI)', value: '98,7%', pct: 98.7, color: '#0a55b8', icon: true },
                  { label: 'WhatsApp', value: '1,3%', pct: 1.3, color: '#f59e0b' },
                ]}
              />
            </Card>
          </section>
        </>
      ) : null}

      {tab === 'costes' ? <LauraCallCosts /> : null}

      {tab === 'sla' ? (
        <>
          <PrecisionBlock />
          <Card className="laura-panel" padding="md">
            <p className="section-eyebrow">Tiempos &amp; SLA DMS</p>
            <h2 className="ops-card-title">Derivación a taller y primer contacto humano</h2>
            <ul className="laura-precision">
              <li>
                <strong>2m 14s</strong>
                <span>Tiempo medio de conversación</span>
                <small>−18s · Cualificación y síntesis diagnóstica</small>
              </li>
              <li>
                <strong>8,5 min</strong>
                <span>Primer contacto humano</span>
                <small>Casos complejos atendidos &lt;15 min · 96,8% OK</small>
              </li>
              <li>
                <strong>42</strong>
                <span>Derivaciones a asesor</span>
                <small>1.162 citas cerradas 100% IA · meta de automatización &gt;75%</small>
              </li>
            </ul>
          </Card>
          <ParetoChart />
        </>
      ) : null}
    </div>
  )
}

function LauraProfileCard({ workshopName }: { workshopName: string }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [profile, setProfile] = useState(loadActiveBotProfile)
  const [avatarOk, setAvatarOk] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const custom = profile.photo !== profile.portrait

  useEffect(() => {
    const sync = () => {
      setProfile(loadActiveBotProfile())
      setAvatarOk(true)
    }
    window.addEventListener(BOT_CONFIG_EVENT, sync)
    return () => window.removeEventListener(BOT_CONFIG_EVENT, sync)
  }, [])

  const onPick = async (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Elige una imagen (JPG, PNG o WebP).')
      return
    }
    try {
      const dataUrl = await resizeImageFile(file)
      updateBotProfile(profile.id, { photo: dataUrl })
      setAvatarOk(true)
      setError(null)
    } catch {
      setError('No se pudo guardar la foto.')
    }
  }

  return (
    <header className="laura-hero glass glass-lite">
      <div className="laura-profile">
        <button
          type="button"
          className="laura-avatar-btn"
          onClick={() => inputRef.current?.click()}
          aria-label={`Cambiar foto de perfil de ${profile.name}`}
        >
          {avatarOk ? (
            <img src={profile.photo} alt="" onError={() => setAvatarOk(false)} />
          ) : (
            <span className="laura-avatar-fallback" aria-hidden>
              {profile.name.charAt(0).toUpperCase()}
            </span>
          )}
          <span className="laura-avatar-cam">
            <Camera size={18} aria-hidden />
          </span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={(e) => {
            void onPick(e.target.files?.[0])
            e.target.value = ''
          }}
        />
        <div className="laura-profile-copy">
          <p className="section-eyebrow">{profile.name} Intelligence · Voz Activa ASR+LLM</p>
          <h2 className="ops-card-title">Asistente de IA {profile.name}</h2>
          <p className="section-subtitle mt-1">
            Monitor de telemetría conversacional, precisión de diagnosis y rendimiento de derivación a taller
            en {workshopName}.
          </p>
          <div className="laura-profile-actions">
            <button type="button" className="ghost-button" onClick={() => inputRef.current?.click()}>
              <Camera size={16} aria-hidden />
              {custom ? 'Cambiar foto' : 'Poner foto de perfil'}
            </button>
            {custom ? (
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  updateBotProfile(profile.id, { photo: '' })
                  setAvatarOk(true)
                  setError(null)
                }}
              >
                <Trash2 size={16} aria-hidden />
                Quitar foto
              </button>
            ) : null}
          </div>
          {error ? <p className="laura-profile-error">{error}</p> : null}
        </div>
      </div>
      <span className="badge tone-positive laura-live">
        <Sparkles size={14} aria-hidden />
        Voz activa
      </span>
    </header>
  )
}

function pieGradient(slices: { pct: number; color: string }[]) {
  let start = 0
  const stops = slices.map((slice) => {
    const end = start + slice.pct
    const stop = `${slice.color} ${start}% ${end}%`
    start = end
    return stop
  })
  return `conic-gradient(${stops.join(', ')})`
}

function polarPoint(cx: number, cy: number, radius: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) }
}

function PrecisionBlock() {
  return (
    <Card className="laura-panel" padding="md">
      <div className="laura-chart-head">
        <div>
          <p className="section-eyebrow">Calidad de lenguaje</p>
          <h2 className="ops-card-title">Métricas de Precisión de Lenguaje Natural Automotriz</h2>
        </div>
        <div className="laura-chart-legend">
          <span>Bubble chart</span>
        </div>
      </div>
      <BubbleChart />
      <p className="laura-bubble-cap">
        Eje X: precisión del modelo · Eje Y: cobertura de casos · Tamaño y color de burbuja: muestras evaluadas.
      </p>
      <ul className="laura-bubble-legend">
        {PRECISION.map((item) => (
          <li key={item.title}>
            <i style={{ background: item.color }} aria-hidden />
            <div>
              <span>{item.title}</span>
              <small>{item.detail}</small>
            </div>
            <strong>{item.value}</strong>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function BubbleChart() {
  const W = 640
  const H = 380
  const plotL = 66
  const plotR = W - 26
  const plotT = 26
  const plotB = H - 62
  const xMin = 89
  const xMax = 100.5
  const yMin = 80
  const yMax = 100
  const maxSize = Math.max(...PRECISION.map((item) => item.muestras))
  const xOf = (p: number) => plotL + ((p - xMin) / (xMax - xMin)) * (plotR - plotL)
  const yOf = (c: number) => plotB - ((c - yMin) / (yMax - yMin)) * (plotB - plotT)
  const rOf = (m: number) => 15 + (m / maxSize) * 26
  const xTicks = [90, 92, 94, 96, 98, 100]
  const yTicks = [80, 85, 90, 95, 100]
  const midX = (plotL + plotR) / 2
  const midY = (plotT + plotB) / 2

  return (
    <div className="laura-bubble">
      <svg viewBox={`0 0 ${W} ${H}`} className="laura-bubble-svg" role="img" aria-label="Bubble chart de precisión">
        <defs>
          {PRECISION.map((item, index) => (
            <radialGradient key={index} id={`lauraBubble${index}`} cx="36%" cy="28%" r="76%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.85" />
              <stop offset="30%" stopColor={item.color} stopOpacity="0.62" />
              <stop offset="78%" stopColor={item.color} stopOpacity="0.86" />
              <stop offset="100%" stopColor={item.color} stopOpacity="1" />
            </radialGradient>
          ))}
          <radialGradient id="lauraBubbleGloss" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.92" />
            <stop offset="70%" stopColor="#ffffff" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
        </defs>

        {yTicks.map((c) => (
          <g key={`y-${c}`}>
            <line className="laura-bubble-grid" x1={plotL} y1={yOf(c)} x2={plotR} y2={yOf(c)} />
            <text className="laura-bubble-tick" x={plotL - 12} y={yOf(c) + 4} textAnchor="end">
              {c}%
            </text>
          </g>
        ))}
        {xTicks.map((p) => (
          <g key={`x-${p}`}>
            <line className="laura-bubble-grid" x1={xOf(p)} y1={plotT} x2={xOf(p)} y2={plotB} />
            <text className="laura-bubble-tick" x={xOf(p)} y={plotB + 24} textAnchor="middle">
              {p}%
            </text>
          </g>
        ))}

        <text className="laura-bubble-axis" x={midX} y={H - 14} textAnchor="middle">
          Precisión del modelo (%)
        </text>
        <text
          className="laura-bubble-axis"
          x={18}
          y={midY}
          textAnchor="middle"
          transform={`rotate(-90 18 ${midY})`}
        >
          Cobertura de casos (%)
        </text>

        {PRECISION.map((item, index) => {
          const cx = xOf(item.pct)
          const cy = yOf(item.cobertura)
          const r = rOf(item.muestras)
          return (
            <g key={item.title} className="laura-bubble-node" style={{ ['--i' as string]: String(index) }}>
              {/* halo exterior */}
              <circle className="laura-bubble-ring" cx={cx} cy={cy} r={r} stroke={item.color} />
              {/* cuerpo de cristal translúcido */}
              <circle cx={cx} cy={cy} r={r} fill={`url(#lauraBubble${index})`} stroke={item.color} strokeWidth={1} strokeOpacity={0.45} />
              {/* borde de luz interior (rim light) */}
              <circle className="laura-bubble-rim" cx={cx} cy={cy} r={r - 1.2} />
              {/* refracción inferior */}
              <ellipse
                className="laura-bubble-refract"
                cx={cx}
                cy={cy + r * 0.42}
                rx={r * 0.62}
                ry={r * 0.24}
                fill={item.color}
              />
              {/* brillo especular superior */}
              <ellipse
                className="laura-bubble-gloss"
                cx={cx - r * 0.3}
                cy={cy - r * 0.36}
                rx={r * 0.46}
                ry={r * 0.28}
              />
              <text className="laura-bubble-val" x={cx} y={cy - 1} textAnchor="middle">
                {item.value}
              </text>
              <text className="laura-bubble-sub" x={cx} y={cy + 14} textAnchor="middle">
                {item.muestras.toLocaleString('es-ES')}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function Radar3D({
  caption,
  axes,
}: {
  caption: string
  axes: { label: string; short: string; value: number; color: string }[]
}) {
  const size = 320
  const cx = size / 2
  const cy = size / 2 + 4
  const radius = 104
  const scaleMax = 50
  const ringValues = [10, 20, 30, 40, 50]

  const ringPaths = ringValues.map((v) =>
    axes
      .map((_, index) => {
        const p = polarPoint(cx, cy, radius * (v / scaleMax), index * 72)
        return `${index === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`
      })
      .join(' ') + ' Z',
  )
  const valuePts = axes.map((axis, index) =>
    polarPoint(cx, cy, radius * (Math.min(axis.value, scaleMax) / scaleMax), index * 72),
  )
  const valuePath =
    valuePts.map((p, index) => `${index === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + ' Z'
  const labelPts = axes.map((axis, index) => ({
    ...axis,
    ...polarPoint(cx, cy, radius + 34, index * 72),
  }))

  return (
    <div className="laura-chart-block">
      <div className="laura-radar" aria-hidden>
        <div className="laura-radar-stage">
          <svg viewBox={`0 0 ${size} ${size}`} className="laura-radar-svg">
            <defs>
              <radialGradient id="lauraRadarFill" cx="50%" cy="42%" r="68%">
                <stop offset="0%" stopColor="rgba(96,165,250,0.55)" />
                <stop offset="100%" stopColor="rgba(11,99,214,0.28)" />
              </radialGradient>
            </defs>
            {ringPaths.map((d, index) => (
              <path key={d} className="laura-radar-ring" d={d} style={{ ['--i' as string]: String(index) }} />
            ))}
            {axes.map((_, index) => {
              const p = polarPoint(cx, cy, radius, index * 72)
              return (
                <line
                  key={index}
                  className="laura-radar-axis"
                  x1={cx}
                  y1={cy}
                  x2={p.x}
                  y2={p.y}
                  style={{ ['--i' as string]: String(index) }}
                />
              )
            })}
            <path className="laura-radar-area" d={valuePath} />
            {valuePts.map((p, index) => (
              <circle
                key={index}
                className="laura-radar-dot"
                cx={p.x}
                cy={p.y}
                r="5"
                style={{ ['--i' as string]: String(index) }}
              />
            ))}
            {ringValues.map((v) => {
              const p = polarPoint(cx, cy, radius * (v / scaleMax), 0)
              return (
                <text key={v} className="laura-radar-scale" x={cx + 5} y={p.y + 3}>
                  {v}%
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
              <b style={{ color: item.color }}>{item.value}%</b>
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
            <strong>{item.value}%</strong>
          </li>
        ))}
      </ul>
    </div>
  )
}

function UprightPie({
  caption,
  slices,
}: {
  caption: string
  slices: { label: string; value: string; pct: number; color: string; icon?: boolean }[]
}) {
  const gradient = pieGradient(slices)
  const box = 200
  const cxy = box / 2
  let acc = 0
  const callouts = slices.map((slice) => {
    const midPct = acc + slice.pct / 2
    acc += slice.pct
    const p = polarPoint(cxy, cxy, box * 0.42, midPct * 3.6)
    return { ...slice, x: (p.x / box) * 100, y: (p.y / box) * 100 }
  })
  const lead = slices[0]

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
            <b>{lead?.value}</b>
            <small>Voz</small>
          </span>
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
    </div>
  )
}

function ParetoChart() {
  const rows = useMemo(() => {
    const sorted = [...DAILY].sort((a, b) => b.volume - a.volume)
    const total = sorted.reduce((sum, item) => sum + item.volume, 0)
    let acc = 0
    return sorted.map((item) => {
      acc += item.volume
      return { ...item, share: (item.volume / total) * 100, cumulative: (acc / total) * 100 }
    })
  }, [])
  const maxVolume = rows[0]?.volume ?? 1
  const cols = rows.length
  const linePoints = rows
    .map((item, index) => {
      const x = ((index + 0.5) / cols) * 100
      const y = 100 - item.cumulative
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')

  return (
    <Card className="laura-panel" padding="md">
      <div className="laura-chart-head">
        <div>
          <p className="section-eyebrow">Evolución Diaria (Últimos 9 Días)</p>
          <h2 className="ops-card-title">Pareto · Volumen atendido y acumulado</h2>
        </div>
        <div className="laura-chart-legend">
          <span>9 Días</span>
          <span>Mes Q1</span>
        </div>
      </div>
      <div className="laura-pareto" role="img" aria-label="Gráfico de Pareto del volumen diario">
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
            {rows.map((item, index) => (
              <div
                key={`${item.day}-${item.volume}`}
                className="laura-pareto-col"
                style={{ ['--i' as string]: String(index) }}
              >
                <span className="laura-pareto-value">{item.volume}</span>
                <span className="laura-pareto-bar" style={{ height: `${(item.volume / maxVolume) * 100}%` }} />
              </div>
            ))}
          </div>
          <svg className="laura-pareto-line" viewBox="0 0 100 100" preserveAspectRatio="none">
            <polyline points={linePoints} vectorEffect="non-scaling-stroke" pathLength={100} />
          </svg>
          {rows.map((item, index) => (
            <span
              key={`dot-${item.day}`}
              className="laura-pareto-dot"
              style={{
                left: `${((index + 0.5) / cols) * 100}%`,
                bottom: `${item.cumulative}%`,
                ['--i' as string]: String(index),
              }}
            >
              <em>{Math.round(item.cumulative)}%</em>
            </span>
          ))}
        </div>
        <div className="laura-pareto-axis is-right" aria-hidden>
          <span>100%</span>
          <span>50%</span>
          <span>0%</span>
        </div>
      </div>
      <div className="laura-pareto-xaxis" aria-hidden>
        {rows.map((item) => (
          <span key={`x-${item.day}`}>{item.day}</span>
        ))}
      </div>
      <ul className="laura-chart-keys">
        <li>
          <i className="is-auto" aria-hidden />
          Llamadas del día
        </li>
        <li>
          <i className="is-derived" aria-hidden />
          Acumulado Pareto
        </li>
      </ul>
    </Card>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, Camera, Mic, PhoneCall, Sparkles, Timer, Trash2 } from 'lucide-react'
import Card from '../components/ui/Card'
import {
  DEFAULT_LAURA_AVATAR,
  LAURA_AVATAR_EVENT,
  clearLauraAvatar,
  loadLauraAvatar,
  resizeImageFile,
  saveLauraAvatar,
} from '../lib/lauraProfile'

type LauraTab = 'rendimiento' | 'calidad' | 'sla'

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
  { label: 'Cita Mecánica', value: 42, color: '#0a55b8' },
  { label: 'Cita Carrocería', value: 24, color: '#2563eb' },
  { label: 'Peritaje de Seguros', value: 18, color: '#3b82f6' },
  { label: 'Recambios y Flotas', value: 11, color: '#60a5fa' },
  { label: 'Ventas VN / VO', value: 5, color: '#93c5fd' },
] as const

const PRECISION = [
  {
    value: '99,4%',
    pct: 99.4,
    title: 'Reconocimiento de Matrícula (OCR / Fonética)',
    detail: 'Validación contra formato DGT (4 dígitos + 3 letras)',
  },
  {
    value: '94,8%',
    pct: 94.8,
    title: 'Acierto en Asignación de Box / Operación',
    detail: 'Correcta tipificación (Mecánica, Chapa, Peritaje, EV)',
  },
  {
    value: '96,8%',
    pct: 96.8,
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
              <Pentagon3D
                caption="5 ramas de posventa"
                axes={TIPOLOGIA.map((item) => ({
                  label: item.label,
                  value: item.value,
                  color: item.color,
                }))}
              />
            </Card>
            <Card className="laura-panel" padding="md">
              <p className="section-eyebrow">Distribución por Canal</p>
              <h2 className="ops-card-title">Pastel vertical · Entradas a centralita</h2>
              <VerticalPie
                center="98,7%"
                caption="Disco 3D de pie · Canal Voz"
                slices={[
                  { label: 'Voz Telefónica (Laura AI)', value: '98,7%', pct: 98.7, color: '#0a55b8', icon: true },
                  { label: 'WhatsApp', value: '1,3%', pct: 1.3, color: '#93c5fd' },
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
              <Pentagon3D
                caption="5 ramas de posventa"
                axes={TIPOLOGIA.map((item) => ({
                  label: item.label,
                  value: item.value,
                  color: item.color,
                }))}
              />
            </Card>
            <Card className="laura-panel" padding="md">
              <p className="section-eyebrow">Canal de entrada</p>
              <h2 className="ops-card-title">Pastel vertical · Entradas a centralita</h2>
              <VerticalPie
                center="98,7%"
                caption="Disco 3D de pie · Voz frente a WhatsApp"
                slices={[
                  { label: 'Voz Telefónica (Laura AI)', value: '98,7%', pct: 98.7, color: '#0a55b8', icon: true },
                  { label: 'WhatsApp', value: '1,3%', pct: 1.3, color: '#93c5fd' },
                ]}
              />
            </Card>
          </section>
        </>
      ) : null}

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
  const [avatar, setAvatar] = useState(loadLauraAvatar)
  const [avatarOk, setAvatarOk] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const custom = avatar !== DEFAULT_LAURA_AVATAR

  useEffect(() => {
    const sync = () => {
      setAvatar(loadLauraAvatar())
      setAvatarOk(true)
    }
    window.addEventListener(LAURA_AVATAR_EVENT, sync)
    return () => window.removeEventListener(LAURA_AVATAR_EVENT, sync)
  }, [])

  const onPick = async (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Elige una imagen (JPG, PNG o WebP).')
      return
    }
    try {
      const dataUrl = await resizeImageFile(file)
      saveLauraAvatar(dataUrl)
      setAvatar(dataUrl)
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
          aria-label="Cambiar foto de perfil de Laura"
        >
          {avatarOk ? (
            <img src={avatar} alt="" onError={() => setAvatarOk(false)} />
          ) : (
            <span className="laura-avatar-fallback" aria-hidden>
              L
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
          <p className="section-eyebrow">Laura Intelligence · Voz Activa ASR+LLM</p>
          <h1 className="section-title">Asistente de IA Laura</h1>
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
                  clearLauraAvatar()
                  setAvatar(DEFAULT_LAURA_AVATAR)
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
      <p className="section-eyebrow">Calidad de lenguaje</p>
      <h2 className="ops-card-title">Métricas de Precisión de Lenguaje Natural Automotriz</h2>
      <ul className="laura-circle-grid">
        {PRECISION.map((item, index) => (
          <li key={item.title} style={{ ['--i' as string]: String(index) }}>
            <CircleGauge pct={item.pct} label={item.value} />
            <span>{item.title}</span>
            <small>{item.detail}</small>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function CircleGauge({ pct, label }: { pct: number; label: string }) {
  const radius = 52
  const length = 2 * Math.PI * radius
  return (
    <div className="laura-circle-3d" style={{ ['--pct' as string]: String(pct) }}>
      <div className="laura-circle-scene" aria-hidden>
        <div className="laura-circle-depth" />
        <svg viewBox="0 0 120 120" className="laura-circle-svg">
          <circle className="is-track" cx="60" cy="60" r={radius} />
          <circle
            className="is-fill"
            cx="60"
            cy="60"
            r={radius}
            strokeDasharray={`${(pct / 100) * length} ${length}`}
          />
        </svg>
        <strong>{label}</strong>
      </div>
    </div>
  )
}

function Pentagon3D({
  caption,
  axes,
}: {
  caption: string
  axes: { label: string; value: number; color: string }[]
}) {
  const cx = 140
  const cy = 140
  const radius = 92
  const max = Math.max(...axes.map((axis) => axis.value), 1)
  const rings = [0.25, 0.5, 0.75, 1]
  const ringPaths = rings.map((scale) =>
    axes
      .map((_, index) => {
        const p = polarPoint(cx, cy, radius * scale, index * 72)
        return `${index === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`
      })
      .join(' ') + ' Z',
  )
  const valuePath =
    axes
      .map((axis, index) => {
        const p = polarPoint(cx, cy, radius * (axis.value / max), index * 72)
        return `${index === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`
      })
      .join(' ') + ' Z'
  const labels = axes.map((axis, index) => ({
    ...axis,
    ...polarPoint(cx, cy, radius + 28, index * 72),
  }))

  return (
    <div className="laura-chart-block">
      <div className="laura-penta-3d" aria-hidden>
        <div className="laura-penta-scene">
          <svg viewBox="0 0 280 280" className="laura-penta-svg">
            {ringPaths.map((d) => (
              <path key={d} className="laura-penta-ring" d={d} />
            ))}
            {axes.map((_, index) => {
              const p = polarPoint(cx, cy, radius, index * 72)
              return <line key={index} className="laura-penta-axis" x1={cx} y1={cy} x2={p.x} y2={p.y} />
            })}
            <path className="laura-penta-fill" d={valuePath} />
          </svg>
        </div>
      </div>
      <p className="section-subtitle">{caption}</p>
      <ul className="laura-legend">
        {labels.map((item) => (
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

function VerticalPie({
  center,
  caption,
  slices,
}: {
  center: string
  caption: string
  slices: { label: string; value: string; pct: number; color: string; icon?: boolean }[]
}) {
  const gradient = pieGradient(slices)
  return (
    <div className="laura-chart-block">
      <div className="laura-pie-vertical" aria-hidden>
        <div className="laura-pie-scene is-vertical">
          {Array.from({ length: 18 }, (_, layer) => (
            <span
              key={layer}
              className={`laura-pie-layer${layer === 0 ? ' is-top' : ''}`}
              style={{ background: gradient, ['--z' as string]: String(layer) }}
            />
          ))}
        </div>
        <strong className="laura-pie-center is-vertical">{center}</strong>
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
  const line = rows
    .map((item, index) => {
      const x = 28 + (index / Math.max(rows.length - 1, 1)) * 244
      const y = 168 - (item.cumulative / 100) * 140
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
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
        <svg className="laura-pareto-line" viewBox="0 0 300 180" preserveAspectRatio="none">
          <path d={line} />
        </svg>
        {rows.map((item, index) => (
          <div key={`${item.day}-${item.volume}`} className="laura-pareto-col" style={{ ['--i' as string]: String(index) }}>
            <strong>{item.volume}</strong>
            <span className="laura-pareto-bar" style={{ height: `${(item.volume / maxVolume) * 100}%` }} />
            <small>{item.day}</small>
            <em>{Math.round(item.cumulative)}%</em>
          </div>
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

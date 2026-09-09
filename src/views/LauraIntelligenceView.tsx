import { useEffect, useRef, useState } from 'react'
import { Activity, Camera, Coins, Mic, Sparkles, Timer, Trash2 } from 'lucide-react'
import Card from '../components/ui/Card'
import { LauraPareto, LauraRadar, LauraUprightPie } from '../components/LauraCharts'
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
  showCallCosts?: boolean
}

export default function LauraIntelligenceView({ workshopName, showCallCosts = false }: Props) {
  const [tab, setTab] = useState<LauraTab>('rendimiento')

  useEffect(() => {
    if (!showCallCosts && tab === 'costes') setTab('rendimiento')
  }, [showCallCosts, tab])

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
        {showCallCosts ? (
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
        ) : null}
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
              <LauraRadar
                caption="5 ramas de posventa · escala 0–50%"
                scaleMax={50}
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
              <LauraUprightPie
                caption="Disco 3D de pie · Canal Voz"
                centerLabel="Voz"
                slices={[
                  { label: 'Voz Telefónica (Laura AI)', value: '98,7%', pct: 98.7, color: '#0a55b8', icon: true },
                  { label: 'WhatsApp', value: '1,3%', pct: 1.3, color: '#f59e0b' },
                ]}
              />
            </Card>
          </section>
          <Card className="laura-panel" padding="md">
            <LauraPareto
              eyebrow="Evolución Diaria (Últimos 9 Días)"
              title="Pareto · Volumen atendido y acumulado"
              legend={['9 Días', 'Mes Q1']}
              rows={DAILY.map((item) => ({ key: item.day, label: item.day, value: item.volume }))}
              sortByValue
            />
          </Card>
        </>
      ) : null}

      {tab === 'calidad' ? (
        <>
          <PrecisionBlock />
          <section className="laura-split">
            <Card className="laura-panel" padding="md">
              <p className="section-eyebrow">Distribución por Tipología</p>
              <h2 className="ops-card-title">Pentágono 3D · Clasificación IA según motivo</h2>
              <LauraRadar
                caption="5 ramas de posventa · escala 0–50%"
                scaleMax={50}
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
              <LauraUprightPie
                caption="Disco 3D de pie · Voz frente a WhatsApp"
                centerLabel="Voz"
                slices={[
                  { label: 'Voz Telefónica (Laura AI)', value: '98,7%', pct: 98.7, color: '#0a55b8', icon: true },
                  { label: 'WhatsApp', value: '1,3%', pct: 1.3, color: '#f59e0b' },
                ]}
              />
            </Card>
          </section>
        </>
      ) : null}

      {tab === 'costes' && showCallCosts ? <LauraCallCosts /> : null}

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
          <Card className="laura-panel" padding="md">
            <LauraPareto
              eyebrow="Evolución Diaria (Últimos 9 Días)"
              title="Pareto · Volumen atendido y acumulado"
              legend={['9 Días', 'Mes Q1']}
              rows={DAILY.map((item) => ({ key: item.day, label: item.day, value: item.volume }))}
              sortByValue
            />
          </Card>
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

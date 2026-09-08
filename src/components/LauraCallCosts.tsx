import { useEffect, useMemo, useState } from 'react'
import { Coins, FileText, Mic, Phone, RefreshCw, Timer } from 'lucide-react'
import Card from './ui/Card'
import { CrmApiError, fetchCallCostStats, isCrmApiConfigured, type CallCostStats } from '../lib/crmApi'
import { fmtMoney, fmtSeconds } from '../lib/callFormat'

function monthRange(): { from: string; to: string; label: string } {
  const now = new Date()
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const to = new Date()
  const label = now.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
  return { from: from.toISOString(), to: to.toISOString(), label }
}

function last30(): { from: string; to: string; label: string } {
  const to = new Date()
  const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000)
  return { from: from.toISOString(), to: to.toISOString(), label: 'Últimos 30 días' }
}

type RangeKey = 'month' | '30d'

export default function LauraCallCosts() {
  const [range, setRange] = useState<RangeKey>('month')
  const [stats, setStats] = useState<CallCostStats | null>(null)
  const [loading, setLoading] = useState(isCrmApiConfigured())
  const [error, setError] = useState<string | null>(null)

  const window = useMemo(() => (range === 'month' ? monthRange() : last30()), [range])

  useEffect(() => {
    if (!isCrmApiConfigured()) {
      setLoading(false)
      setError('Falta VITE_CRM_API_URL para leer los costes de api-crm.')
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    void fetchCallCostStats({ from: window.from, to: window.to })
      .then((next) => {
        if (!cancelled) setStats(next)
      })
      .catch((e) => {
        if (cancelled) return
        setStats(null)
        setError(e instanceof CrmApiError ? e.message : 'No se pudieron cargar los costes.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [window.from, window.to])

  const currency = stats?.currency || 'USD'
  const maxDay = Math.max(0.0001, ...(stats?.series.map((d) => d.cost) ?? [0]))
  const minutes = stats ? stats.duration_sec / 60 : 0
  const avgPerMin = stats && minutes > 0 && stats.cost > 0 ? stats.cost / minutes : null
  const pending = stats ? Math.max(0, stats.answered - stats.with_cost) : 0

  return (
    <div className="laura-costs">
      <section className="laura-kpi-grid" aria-label="Costes de llamadas">
        <article className="metric glass glass-lite">
          <span>Gasto Telnyx</span>
          <strong>{stats ? fmtMoney(stats.cost, currency) : '—'}</strong>
          <small>
            {stats?.with_cost ?? 0} llamadas tarificadas
            {pending > 0 ? ` · ${pending} aún sin CDR` : ''}
          </small>
        </article>
        <article className="metric glass glass-lite">
          <span>Llamadas</span>
          <strong>{stats?.calls ?? '—'}</strong>
          <small>{stats ? `${stats.answered} atendidas · ${stats.calls - stats.answered} sin respuesta` : 'Del periodo'}</small>
        </article>
        <article className="metric glass glass-lite">
          <span>Minutos hablados</span>
          <strong>{stats ? fmtSeconds(stats.duration_sec) : '—'}</strong>
          <small>{avgPerMin != null ? `${fmtMoney(avgPerMin, currency, { precise: true })} / min` : 'Tarifa media cuando hay coste'}</small>
        </article>
        <article className="metric glass glass-lite">
          <span>Grabación y texto</span>
          <strong>{stats ? `${stats.with_recording}` : '—'}</strong>
          <small>{stats ? `${stats.with_transcript} con transcripción Deepgram` : 'Guardadas en api-crm'}</small>
        </article>
      </section>

      <Card className="laura-panel" padding="md">
        <div className="laura-costs-head">
          <div>
            <p className="section-eyebrow">Consumo de voz</p>
            <h2 className="ops-card-title">Coste real de las llamadas del CRM</h2>
            <p className="section-subtitle mt-1">
              Suma de los Detail Records de Telnyx (pata PSTN + WebRTC + grabación) que api-crm guarda al
              colgar. {window.label}.
            </p>
          </div>
          <div className="laura-costs-filters">
            <button
              type="button"
              className={`triage-view-btn${range === 'month' ? ' is-active' : ''}`}
              onClick={() => setRange('month')}
            >
              Este mes
            </button>
            <button
              type="button"
              className={`triage-view-btn${range === '30d' ? ' is-active' : ''}`}
              onClick={() => setRange('30d')}
            >
              30 días
            </button>
          </div>
        </div>

        {loading ? (
          <p className="phone-pad-hint">
            <RefreshCw size={13} className="animate-spin" aria-hidden /> Cargando costes…
          </p>
        ) : null}
        {error ? <p className="lead-calls-error">{error}</p> : null}

        {stats && stats.series.length === 0 && !loading ? (
          <p className="phone-pad-hint">En este periodo no hay llamadas registradas.</p>
        ) : null}

        {stats && stats.series.length > 0 ? (
          <ul className="laura-cost-bars" aria-label="Gasto diario">
            {stats.series.map((day) => {
              const d = new Date(`${day.day}T12:00:00`)
              const label = d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
              const h = Math.max(6, Math.round((day.cost / maxDay) * 120))
              return (
                <li key={day.day} title={`${label}: ${fmtMoney(day.cost, currency)} · ${day.calls} llamadas`}>
                  <span className="laura-cost-col" style={{ height: h }} />
                  <em>{label}</em>
                  <small>{fmtMoney(day.cost, currency)}</small>
                </li>
              )
            })}
          </ul>
        ) : null}

        <ul className="laura-precision">
          <li>
            <strong>
              <Coins size={16} aria-hidden /> {stats ? fmtMoney(stats.cost, currency, { precise: true }) : '—'}
            </strong>
            <span>Importe Telnyx del periodo</span>
            <small>Se actualiza unos minutos después de cada colgado</small>
          </li>
          <li>
            <strong>
              <Phone size={16} aria-hidden /> {stats?.answered ?? '—'}
            </strong>
            <span>Llamadas atendidas</span>
            <small>
              <Timer size={13} aria-hidden /> {stats ? fmtSeconds(stats.duration_sec) : '—'} en conversación
            </small>
          </li>
          <li>
            <strong>
              <Mic size={16} aria-hidden /> {stats?.with_recording ?? '—'}
            </strong>
            <span>Con grabación</span>
            <small>
              <FileText size={13} aria-hidden /> {stats?.with_transcript ?? 0} con transcripción
            </small>
          </li>
        </ul>
      </Card>
    </div>
  )
}

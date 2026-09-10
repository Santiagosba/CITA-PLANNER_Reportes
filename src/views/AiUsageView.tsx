import { useEffect, useMemo, useState } from 'react'
import { Coins, Cpu, RefreshCw, Sparkles, TriangleAlert } from 'lucide-react'
import ApiStatusBanner from '../components/ApiStatusBanner'
import Card from '../components/ui/Card'
import { HexLoaderScreen } from '../components/ui/HexLoader'
import {
  CrmApiError,
  fetchAiUsageReport,
  isCrmApiConfigured,
  type AiUsageReport,
  type AiUsageScope,
} from '../lib/crmApi'
import { canSeeAiCosts } from '../lib/crmRoles'
import { isCrmUuid } from '../lib/crmUuid'
import { fmtMoney } from '../lib/callFormat'
import type { Workshop } from '../types'

type RangeKey = 'month' | '30d' | '7d'

function rangeWindow(key: RangeKey): { from: string; to: string; label: string } {
  const to = new Date()
  if (key === 'month') {
    const from = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1))
    const label = to.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
    return { from: from.toISOString(), to: to.toISOString(), label }
  }
  const days = key === '7d' ? 7 : 30
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000)
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    label: key === '7d' ? 'Últimos 7 días' : 'Últimos 30 días',
  }
}

function fmtTokens(value: number): string {
  return new Intl.NumberFormat('es-ES').format(value)
}

type Props = {
  workshop: Workshop
}

export default function AiUsageView({ workshop }: Props) {
  const workshopId = String(workshop.containerIdTaller || workshop.id || '').trim()
  const canSee = canSeeAiCosts()
  const [range, setRange] = useState<RangeKey>('month')
  const [feature, setFeature] = useState('all')
  const [report, setReport] = useState<(AiUsageReport & { scope: AiUsageScope }) | null>(null)
  const [loading, setLoading] = useState(canSee && isCrmApiConfigured())
  const [error, setError] = useState<string | null>(null)

  const window = useMemo(() => rangeWindow(range), [range])

  useEffect(() => {
    if (!canSee) {
      setLoading(false)
      setError(null)
      setReport(null)
      return
    }
    if (!isCrmApiConfigured()) {
      setLoading(false)
      setError('Falta VITE_CRM_API_URL para leer el gasto de IA.')
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    void fetchAiUsageReport({
      from: window.from,
      to: window.to,
      idtaller: isCrmUuid(workshopId) ? workshopId : null,
      feature: feature === 'all' ? null : feature,
    })
      .then((next) => {
        if (!cancelled) setReport(next)
      })
      .catch((e) => {
        if (cancelled) return
        setReport(null)
        setError(e instanceof CrmApiError ? e.message : 'No se pudo cargar el gasto de IA.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [canSee, window.from, window.to, workshopId, feature])

  const maxDay = Math.max(0.0001, ...(report?.series.map((day) => day.costUsd) ?? [0]))
  const avgPerRequest =
    report && report.kpis.requests > 0 ? report.kpis.estimatedCostUsd / report.kpis.requests : null

  if (!canSee) {
    return (
      <div className="dashboard-page role-desk laura-costs">
        <Card className="laura-panel" padding="md">
          <p className="section-eyebrow">Tokens</p>
          <h2 className="ops-card-title">Gasto de IA</h2>
          <p className="section-subtitle">Solo el admin del taller puede ver el dinero gastado en tokens.</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="dashboard-page role-desk laura-costs">
      {error ? <ApiStatusBanner message={error} variant="error" /> : null}

      <section className="laura-kpi-grid" aria-label="Gasto de tokens de IA">
        <article className="metric glass glass-lite">
          <span className="ops-kpi-label">Gastado</span>
          <strong>{report ? fmtMoney(report.kpis.estimatedCostUsd, 'USD') : '—'}</strong>
          <span className="ops-kpi-helper">{window.label}</span>
        </article>
        <article className="metric glass glass-lite">
          <span className="ops-kpi-label">Tokens</span>
          <strong>{report ? fmtTokens(report.kpis.tokens) : '—'}</strong>
          <span className="ops-kpi-helper">Entrada y salida de OpenAI</span>
        </article>
        <article className="metric glass glass-lite">
          <span className="ops-kpi-label">Peticiones</span>
          <strong>{report ? fmtTokens(report.kpis.requests) : '—'}</strong>
          <span className="ops-kpi-helper">
            {avgPerRequest != null ? `${fmtMoney(avgPerRequest, 'USD', { precise: true })} de media` : 'Llamadas al modelo'}
          </span>
        </article>
        <article className="metric glass glass-lite">
          <span className="ops-kpi-label">Errores</span>
          <strong>{report ? report.kpis.errorCount : '—'}</strong>
          <span className="ops-kpi-helper">Peticiones que fallaron</span>
        </article>
      </section>

      <Card className="laura-panel" padding="md">
        <div className="laura-costs-head">
          <div>
            <p className="section-eyebrow">Tokens</p>
            <h2 className="ops-card-title">Dinero gastado en IA</h2>
            <p className="section-subtitle">
              Coste estimado según las tarifas de OpenAI y el uso que registra api-crm.
              {report?.scope === 'taller'
                ? ' Solo este taller.'
                : ' Cuenta completa: aún no está acotado a este taller en el api-crm desplegado.'}
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
            <button
              type="button"
              className={`triage-view-btn${range === '7d' ? ' is-active' : ''}`}
              onClick={() => setRange('7d')}
            >
              7 días
            </button>
          </div>
        </div>

        {report && report.features.length > 0 ? (
          <label className="field-label" htmlFor="ai-feature" style={{ marginTop: 'var(--space-4)' }}>
            Función
            <select
              id="ai-feature"
              className="field-select"
              value={feature}
              onChange={(event) => setFeature(event.target.value)}
              style={{ marginTop: 8, maxWidth: 360 }}
            >
              <option value="all">Todas</option>
              {report.features.map((item) => (
                <option key={item.feature} value={item.feature}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {loading ? <HexLoaderScreen size="md" label="Cargando el gasto de IA…" /> : null}

        {!loading && report && report.kpis.requests === 0 ? (
          <p className="section-subtitle">En este periodo no hay uso de IA registrado.</p>
        ) : null}

        {report && report.series.some((day) => day.costUsd > 0 || day.requests > 0) ? (
          <ul className="laura-cost-bars" aria-label="Gasto diario de IA">
            {report.series.map((day) => {
              const d = new Date(`${day.date}T12:00:00`)
              const label = d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
              const h = Math.max(6, Math.round((day.costUsd / maxDay) * 120))
              return (
                <li
                  key={day.date}
                  title={`${label}: ${fmtMoney(day.costUsd, 'USD')} · ${fmtTokens(day.tokens)} tokens`}
                >
                  <span className="laura-cost-col" style={{ height: h }} />
                  <em>{label}</em>
                  <small>{fmtMoney(day.costUsd, 'USD')}</small>
                </li>
              )
            })}
          </ul>
        ) : null}

        <ul className="laura-precision">
          <li>
            <strong>
              <Coins size={16} aria-hidden /> {report ? fmtMoney(report.kpis.estimatedCostUsd, 'USD', { precise: true }) : '—'}
            </strong>
            <span>Importe estimado</span>
            <small>No es la factura de OpenAI; es la suma de cada petición</small>
          </li>
          <li>
            <strong>
              <Sparkles size={16} aria-hidden /> {report ? fmtTokens(report.kpis.tokens) : '—'}
            </strong>
            <span>Tokens usados</span>
            <small>Prompt + respuesta</small>
          </li>
          <li>
            <strong>
              <TriangleAlert size={16} aria-hidden /> {report?.kpis.errorCount ?? '—'}
            </strong>
            <span>Fallos</span>
            <small>
              <RefreshCw size={13} aria-hidden /> {report ? fmtTokens(report.kpis.requests) : '—'} peticiones en total
            </small>
          </li>
        </ul>
      </Card>

      <section className="laura-split" aria-label="Desglose del gasto">
        <Card className="laura-panel" padding="md">
          <p className="section-eyebrow">Por función</p>
          <h2 className="ops-card-title">En qué se gasta</h2>
          {!report || report.byFeature.length === 0 ? (
            <p className="section-subtitle">Aún no hay desglose.</p>
          ) : (
            <div className="scroll-panel overflow-x-auto">
              <table className="role-table">
                <thead>
                  <tr>
                    <th>Función</th>
                    <th>Peticiones</th>
                    <th>Tokens</th>
                    <th>Coste</th>
                  </tr>
                </thead>
                <tbody>
                  {report.byFeature.map((row) => (
                    <tr key={row.feature}>
                      <td>
                        <strong>{row.label}</strong>
                      </td>
                      <td>{fmtTokens(row.requests)}</td>
                      <td>{fmtTokens(row.tokens)}</td>
                      <td>{fmtMoney(row.costUsd, 'USD', { precise: true })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="laura-panel" padding="md">
          <p className="section-eyebrow">Por modelo</p>
          <h2 className="ops-card-title">Qué modelo se usa</h2>
          {!report || report.byModel.length === 0 ? (
            <p className="section-subtitle">Aún no hay modelos.</p>
          ) : (
            <ul className="role-list">
              {report.byModel.map((row) => (
                <li key={row.model} className="role-task-row glass glass-lite">
                  <div>
                    <p className="list-row-title">
                      <Cpu size={16} aria-hidden /> {row.model}
                    </p>
                    <p className="list-row-meta">
                      {fmtTokens(row.requests)} peticiones · {fmtTokens(row.tokens)} tokens
                    </p>
                  </div>
                  <span className="badge tone-positive">{fmtMoney(row.costUsd, 'USD', { precise: true })}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </div>
  )
}

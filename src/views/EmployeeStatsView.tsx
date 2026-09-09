import { useMemo } from 'react'
import { BarChart3, CheckCircle2, ClipboardList, Users } from 'lucide-react'
import ApiStatusBanner from '../components/ApiStatusBanner'
import { HexLoaderScreen } from '../components/ui/HexLoader'
import Card from '../components/ui/Card'
import { resolveDateRange } from '../lib/dateRangePresets'
import { computeAdvisorStats, normalizeEmail } from '../lib/advisorWorkspace'
import { useAdvisorWorkspace } from '../hooks/useAdvisorWorkspace'
import { useOperationalData } from '../hooks/useOperationalData'
import type { Workshop } from '../types'

type Props = {
  workshop: Workshop
  currentUser: { name: string; email: string }
}

export default function EmployeeStatsView({ workshop, currentUser }: Props) {
  const workshopId = workshop.containerIdTaller || workshop.id
  const { workspace } = useAdvisorWorkspace(workshopId, currentUser)
  const range = resolveDateRange('mes', '', '')
  const { items, loading, error, sourceNotice } = useOperationalData(workshop, range)

  const peticionEmails = useMemo(() => {
    const map = new Map<string, { total: number; hechas: number }>()
    for (const item of items) {
      const email = normalizeEmail(item.gestionemail || '')
      if (!email) continue
      const prev = map.get(email) ?? { total: 0, hechas: 0 }
      prev.total += 1
      if (item.gestionado) prev.hechas += 1
      map.set(email, prev)
    }
    return map
  }, [items])

  const rows = useMemo(
    () =>
      computeAdvisorStats(workspace, {
        fromIso: range.from?.slice(0, 10),
        toIso: range.to?.slice(0, 10),
        peticionEmails,
      }),
    [workspace, range.from, range.to, peticionEmails],
  )

  const totals = rows.reduce(
    (acc, row) => {
      acc.assigned += row.assigned
      acc.done += row.done
      acc.pending += row.pending
      acc.peticiones += row.peticiones
      return acc
    },
    { assigned: 0, done: 0, pending: 0, peticiones: 0 },
  )

  return (
    <div className="dashboard-page role-desk">
      {error ? <ApiStatusBanner message={error} variant="error" /> : null}
      {sourceNotice && !error ? <ApiStatusBanner message={sourceNotice} variant="warning" /> : null}

      <section className="ops-kpi-grid" aria-label="Resumen del equipo">
        <article className="metric glass glass-lite">
          <span className="ops-kpi-icon">
            <Users size={17} />
          </span>
          <span className="ops-kpi-label">Asesores</span>
          <strong>{workspace.people.length}</strong>
          <span className="ops-kpi-helper">En este taller</span>
        </article>
        <article className="metric glass glass-lite">
          <span className="ops-kpi-icon">
            <ClipboardList size={17} />
          </span>
          <span className="ops-kpi-label">Tareas del mes</span>
          <strong>{loading ? '—' : totals.assigned}</strong>
          <span className="ops-kpi-helper">{totals.pending} pendientes</span>
        </article>
        <article className="metric glass glass-lite">
          <span className="ops-kpi-icon">
            <CheckCircle2 size={17} />
          </span>
          <span className="ops-kpi-label">Hechas</span>
          <strong>{loading ? '—' : totals.done}</strong>
          <span className="ops-kpi-helper">{totals.peticiones} consultas gestionadas</span>
        </article>
      </section>

      <Card>
        <div className="role-desk-heading">
          <div>
            <p className="section-eyebrow">Mes en curso</p>
            <h2 className="ops-card-title">Trabajo por asesor</h2>
          </div>
          <BarChart3 size={20} aria-hidden style={{ color: 'var(--color-brand)' }} />
        </div>

        {loading ? (
          <HexLoaderScreen size="md" label="Cargando estadísticas…" />
        ) : workspace.people.length === 0 ? (
          <p className="section-subtitle">Añade asesores en Equipos para ver su trabajo.</p>
        ) : (
          <div className="scroll-panel overflow-x-auto">
            <table className="role-table">
              <thead>
                <tr>
                  <th>Asesor</th>
                  <th>Equipo</th>
                  <th>Asignadas</th>
                  <th>Pendientes</th>
                  <th>Hechas</th>
                  <th>Consultas</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const team = workspace.teams.find((item) => item.memberIds.includes(row.person.id))
                  return (
                    <tr key={row.person.id}>
                      <td>
                        <strong>{row.person.name}</strong>
                        <small>{row.person.email}</small>
                      </td>
                      <td>{team?.name || 'Sin equipo'}</td>
                      <td>{row.assigned}</td>
                      <td>{row.pending}</td>
                      <td>{row.done}</td>
                      <td>
                        {row.peticionesHechas}/{row.peticiones}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

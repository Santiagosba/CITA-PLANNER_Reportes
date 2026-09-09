import { useMemo } from 'react'
import { CalendarCheck2, CheckCircle2 } from 'lucide-react'
import ApiStatusBanner from '../components/ApiStatusBanner'
import { HexLoaderScreen } from '../components/ui/HexLoader'
import Card from '../components/ui/Card'
import { resolveDateRange } from '../lib/dateRangePresets'
import { type PeticionPendiente } from '../lib/peticionesPendientes'
import {
  catalogName,
  localTodayIso,
  tasksForAdvisorDay,
} from '../lib/advisorWorkspace'
import { useAdvisorWorkspace } from '../hooks/useAdvisorWorkspace'
import { useOperationalData } from '../hooks/useOperationalData'
import type { Workshop } from '../types'

type Props = {
  workshop: Workshop
  currentUser: { name: string; email: string }
  onOpenLead: (peticion: PeticionPendiente) => void
}

export default function TodayTasksView({ workshop, currentUser, onOpenLead }: Props) {
  const workshopId = workshop.containerIdTaller || workshop.id
  const { workspace, setTaskStatus } = useAdvisorWorkspace(workshopId, currentUser, true)
  const today = localTodayIso()
  const range = resolveDateRange('mes', '', '')
  const { items, loading, error, sourceNotice } = useOperationalData(workshop, range)

  const tasks = useMemo(
    () => tasksForAdvisorDay(workspace, currentUser.email, today),
    [workspace, currentUser.email, today],
  )
  const pending = tasks.filter((task) => task.status === 'pendiente')
  const done = tasks.filter((task) => task.status === 'hecho')

  const openLinked = (peticionId: string | null) => {
    if (!peticionId) return
    const item = items.find((row) => row.idpeticion === peticionId)
    if (item) onOpenLead(item)
  }

  return (
    <div className="dashboard-page role-desk">
      {error ? <ApiStatusBanner message={error} variant="error" /> : null}
      {sourceNotice && !error ? <ApiStatusBanner message={sourceNotice} variant="warning" /> : null}

      <section className="ops-kpi-grid" aria-label="Tus números de hoy">
        <article className="metric glass glass-lite">
          <span className="ops-kpi-label">Pendientes</span>
          <strong>{pending.length}</strong>
          <span className="ops-kpi-helper">Para hoy o atrasadas</span>
        </article>
        <article className="metric glass glass-lite">
          <span className="ops-kpi-label">Hechas hoy</span>
          <strong>{done.length}</strong>
          <span className="ops-kpi-helper">Ya cerradas</span>
        </article>
        <article className="metric glass glass-lite">
          <span className="ops-kpi-label">Total</span>
          <strong>{tasks.length}</strong>
          <span className="ops-kpi-helper">Tu bandeja del día</span>
        </article>
      </section>

      <Card>
        <div className="role-desk-heading">
          <div>
            <p className="section-eyebrow">Bandeja</p>
            <h2 className="ops-card-title">Tareas de hoy</h2>
            <p className="section-subtitle">Lo que te ha asignado el admin para este día.</p>
          </div>
          <CalendarCheck2 size={22} aria-hidden style={{ color: 'var(--color-brand)' }} />
        </div>

        {loading && tasks.length === 0 ? (
          <HexLoaderScreen size="md" label="Cargando tus tareas…" />
        ) : tasks.length === 0 ? (
          <p className="section-subtitle">Hoy no tienes tareas. Cuando el admin te asigne una, saldrá aquí.</p>
        ) : (
          <ul className="role-list">
            {tasks.map((task) => {
              const overdue = task.status === 'pendiente' && task.dueDate < today
              return (
                <li key={task.id} className="role-task-row glass glass-lite">
                  <div>
                    <p className="list-row-title">{task.title}</p>
                    <p className="list-row-meta">
                      {catalogName(workspace.taskTypes, task.taskTypeId)}
                      {task.boardId ? ` · ${catalogName(workspace.boards, task.boardId)}` : ''}
                      {overdue ? ' · Atrasada' : ` · ${task.dueDate}`}
                    </p>
                    {task.notes ? <p className="section-subtitle">{task.notes}</p> : null}
                  </div>
                  <div className="role-task-actions">
                    <span className={`badge ${task.status === 'hecho' ? 'tone-positive' : overdue ? 'tone-negative' : 'tone-warning'}`}>
                      {task.status === 'hecho' ? 'Hecha' : overdue ? 'Atrasada' : 'Pendiente'}
                    </span>
                    {task.peticionId ? (
                      <button type="button" className="ghost-button" onClick={() => openLinked(task.peticionId)}>
                        Abrir ficha
                      </button>
                    ) : null}
                    {task.status === 'pendiente' ? (
                      <button
                        type="button"
                        className="client-submit"
                        onClick={() => setTaskStatus(task.id, 'hecho')}
                      >
                        <CheckCircle2 size={16} aria-hidden />
                        Ya está hecha
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => setTaskStatus(task.id, 'pendiente')}
                      >
                        Reabrir
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}

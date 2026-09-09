import { useEffect, useMemo, useState } from 'react'
import { CalendarCheck2, CheckCircle2 } from 'lucide-react'
import ApiStatusBanner from '../components/ApiStatusBanner'
import { HexLoaderScreen } from '../components/ui/HexLoader'
import Card from '../components/ui/Card'
import { resolveDateRange } from '../lib/dateRangePresets'
import { type PeticionPendiente } from '../lib/peticionesPendientes'
import {
  catalogName,
  isTaskDueOnOrBefore,
  localTodayIso,
  personById,
} from '../lib/advisorWorkspace'
import { useAdvisorWorkspace } from '../hooks/useAdvisorWorkspace'
import { teammatesForReassign } from '../lib/ticketOps'
import type { CrmAppRole } from '../lib/crmRoles'
import { useOperationalData } from '../hooks/useOperationalData'
import {
  buildOwnerScopeContext,
  matchesTaskOwnerScope,
  ownerScopeEmptyCopy,
  type OwnerScope,
} from '../lib/ownerScope'
import OwnerScopeFilter from '../components/OwnerScopeFilter'
import type { Workshop } from '../types'

type Props = {
  workshop: Workshop
  currentUser: { name: string; email: string }
  appRole?: CrmAppRole
  onOpenLead: (peticion: PeticionPendiente) => void
}

export default function TodayTasksView({ workshop, currentUser, appRole = 'asesor', onOpenLead }: Props) {
  const workshopId = workshop.containerIdTaller || workshop.id
  const { workspace, setTaskStatus, setTaskAssignee } = useAdvisorWorkspace(workshopId, currentUser, true)
  const today = localTodayIso()
  const range = resolveDateRange('mes', '', '')
  const { items, loading, error, sourceNotice } = useOperationalData(workshop, range)
  const [ownerScope, setOwnerScope] = useState<OwnerScope>(appRole === 'asesor' ? 'grupo' : 'todas')
  useEffect(() => {
    setOwnerScope(appRole === 'asesor' ? 'grupo' : 'todas')
  }, [appRole])
  const ownerCtx = useMemo(
    () => buildOwnerScopeContext(workspace, currentUser.email),
    [workspace, currentUser.email],
  )

  const tasks = useMemo(
    () =>
      workspace.tasks.filter((task) => {
        if (!matchesTaskOwnerScope(task, ownerScope, workspace, ownerCtx)) return false
        if (task.status === 'hecho') return task.dueDate === today
        return isTaskDueOnOrBefore(task, today)
      }),
    [workspace, ownerScope, ownerCtx, today],
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
          <span className="ops-kpi-helper">Según el dueño elegido</span>
        </article>
      </section>

      <Card>
        <div className="role-desk-heading">
          <div>
            <p className="section-eyebrow">Bandeja</p>
            <h2 className="ops-card-title">Tareas de hoy</h2>
            <p className="section-subtitle">
              Las tuyas y las del equipo. Si un compañero está de baja o el cliente lo atendió otro, pásasela.
            </p>
          </div>
          <CalendarCheck2 size={22} aria-hidden style={{ color: 'var(--color-brand)' }} />
        </div>

        <div className="elevator-filters glass glass-lite" style={{ marginBottom: 'var(--space-4)' }}>
          <OwnerScopeFilter value={ownerScope} onChange={setOwnerScope} label="Tareas" />
        </div>

        {loading && tasks.length === 0 ? (
          <HexLoaderScreen size="md" label="Cargando tus tareas…" />
        ) : tasks.length === 0 ? (
          <p className="section-subtitle">
            {ownerScope === 'mias'
              ? 'Hoy no tienes tareas. Cuando el admin te asigne una, saldrá aquí.'
              : ownerScopeEmptyCopy(ownerScope)}
          </p>
        ) : (
          <ul className="role-list">
            {tasks.map((task) => {
              const overdue = task.status === 'pendiente' && task.dueDate < today
              const owner = personById(workspace, task.assigneeId)
              return (
                <li key={task.id} className="role-task-row glass glass-lite">
                  <div>
                    <p className="list-row-title">{task.title}</p>
                    <p className="list-row-meta">
                      {catalogName(workspace.taskTypes, task.taskTypeId)}
                      {task.boardId ? ` · ${catalogName(workspace.boards, task.boardId)}` : ''}
                      {` · ${owner?.name || 'Sin dueño'}`}
                      {overdue ? ' · Atrasada' : ` · ${task.dueDate}`}
                    </p>
                    {task.notes ? <p className="section-subtitle">{task.notes}</p> : null}
                  </div>
                  <div className="role-task-actions">
                    <label className="ticket-owner-picker is-compact" onClick={(e) => e.stopPropagation()}>
                      <span className="sr-only">Pasar tarea</span>
                      <select
                        className="field-select"
                        value={task.assigneeId}
                        aria-label="Pasar tarea a otro asesor"
                        onChange={(e) => setTaskAssignee(task.id, e.target.value)}
                      >
                        <option value="">Sin dueño</option>
                        {teammatesForReassign(workspace, currentUser.email, appRole).map((person) => (
                          <option key={person.id} value={person.id}>
                            {person.name}
                          </option>
                        ))}
                      </select>
                    </label>
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

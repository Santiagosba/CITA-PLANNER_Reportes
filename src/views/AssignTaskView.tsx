import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { HexLoaderScreen } from '../components/ui/HexLoader'
import Card from '../components/ui/Card'
import ApiStatusBanner from '../components/ApiStatusBanner'
import { resolveDateRange } from '../lib/dateRangePresets'
import { formatFecha, type PeticionPendiente } from '../lib/peticionesPendientes'
import { ticketClientLabel } from '../lib/ticketClient'
import {
  boardsForTeam,
  catalogName,
  localTodayIso,
  personById,
  typesForTeam,
} from '../lib/advisorWorkspace'
import { useAdvisorWorkspace } from '../hooks/useAdvisorWorkspace'
import { useOperationalData } from '../hooks/useOperationalData'
import type { Workshop } from '../types'

type Props = {
  workshop: Workshop
  currentUser: { name: string; email: string }
  onOpenTodayTasks?: () => void
}

export default function AssignTaskView({ workshop, currentUser, onOpenTodayTasks }: Props) {
  const workshopId = workshop.containerIdTaller || workshop.id
  const { workspace, loading: workspaceLoading, persistError, assignTask } = useAdvisorWorkspace(
    workshopId,
    currentUser,
    true,
  )
  const range = resolveDateRange('mes', '', '')
  const { items, loading, error, sourceNotice } = useOperationalData(workshop, range)

  const [teamId, setTeamId] = useState(workspace.teams[0]?.id ?? '')
  const [assigneeId, setAssigneeId] = useState('')
  const [taskTypeId, setTaskTypeId] = useState('')
  const [boardId, setBoardId] = useState('')
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [dueDate, setDueDate] = useState(localTodayIso())
  const [peticionId, setPeticionId] = useState('')
  const [notice, setNotice] = useState<string | null>(null)

  const team = workspace.teams.find((row) => row.id === teamId)
  const members = workspace.people.filter((person) => !team || team.memberIds.includes(person.id))
  const types = typesForTeam(workspace, team)
  const boards = boardsForTeam(workspace, team)
  const memberKey = members.map((person) => person.id).join('|')
  const typeKey = types.map((item) => item.id).join('|')
  const boardKey = boards.map((item) => item.id).join('|')

  useEffect(() => {
    if (teamId && workspace.teams.some((row) => row.id === teamId)) return
    setTeamId(workspace.teams[0]?.id ?? '')
    setAssigneeId('')
    setTaskTypeId('')
    setBoardId('')
  }, [workspace.teams, teamId])

  useEffect(() => {
    const ids = memberKey ? memberKey.split('|').filter(Boolean) : []
    if (assigneeId && ids.includes(assigneeId)) return
    setAssigneeId(ids.length === 1 ? ids[0] : '')
  }, [teamId, assigneeId, memberKey])

  useEffect(() => {
    const ids = typeKey ? typeKey.split('|').filter(Boolean) : []
    if (taskTypeId && ids.includes(taskTypeId)) return
    setTaskTypeId(ids.length === 1 ? ids[0] : '')
  }, [teamId, taskTypeId, typeKey])

  useEffect(() => {
    if (!boardId || boardKey.split('|').includes(boardId)) return
    setBoardId('')
  }, [teamId, boardId, boardKey])

  const pendingPeticiones = useMemo(
    () => items.filter((item) => !item.gestionado),
    [items],
  )

  const recentTasks = useMemo(
    () =>
      workspace.tasks
        .slice()
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
    [workspace.tasks],
  )

  const canSubmit = Boolean(title.trim() && assigneeId && taskTypeId && dueDate && members.length > 0)

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    const assignee = personById(workspace, assigneeId)
    if (!assignee || !title.trim() || !taskTypeId || !dueDate) return
    const linked = pendingPeticiones.find((item) => item.idpeticion === peticionId) ?? null
    assignTask({
      title: title.trim(),
      notes: notes.trim(),
      taskTypeId,
      boardId: boardId || null,
      teamId: teamId || null,
      assigneeId,
      dueDate,
      createdByEmail: currentUser.email,
      peticionId: linked?.idpeticion ?? null,
    })
    setTitle('')
    setNotes('')
    setPeticionId('')
    setNotice(`Tarea asignada a ${assignee.name}. La verá en Tareas de hoy.`)
  }

  return (
    <div className="dashboard-page role-desk">
      {error ? <ApiStatusBanner message={error} variant="error" /> : null}
      {sourceNotice && !error ? <ApiStatusBanner message={sourceNotice} variant="warning" /> : null}
      {persistError ? (
        <ApiStatusBanner
          message="No se ha podido guardar en el taller. La tarea queda en este navegador."
          variant="warning"
        />
      ) : null}

      <div className="role-desk-grid role-desk-grid-2">
        <Card>
          <p className="section-eyebrow">Asignación</p>
          <h2 className="ops-card-title">Asignar tarea</h2>
          <p className="section-subtitle">Elige equipo, asesor y día. La tarea aparece en su bandeja de hoy.</p>

          {workspaceLoading && workspace.teams.length === 0 ? (
            <HexLoaderScreen size="sm" label="Cargando equipos…" />
          ) : workspace.teams.length === 0 ? (
            <p className="section-subtitle">Crea un equipo en Equipos antes de asignar tareas.</p>
          ) : (
            <form className="role-stack-form" onSubmit={onSubmit}>
              <label className="field-label" htmlFor="assign-team">
                Equipo
              </label>
              <select
                id="assign-team"
                className="field-select"
                value={teamId}
                onChange={(event) => {
                  setTeamId(event.target.value)
                  setAssigneeId('')
                  setTaskTypeId('')
                  setBoardId('')
                }}
              >
                {workspace.teams.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>

              <label className="field-label" htmlFor="assign-asesor">
                Asesor
              </label>
              <select
                id="assign-asesor"
                className="field-select"
                value={assigneeId}
                onChange={(event) => setAssigneeId(event.target.value)}
                required
              >
                <option value="">{members.length === 0 ? 'Este equipo no tiene asesores' : 'Elige un asesor'}</option>
                {members.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
              {members.length === 0 ? (
                <p className="section-subtitle">Marca asesores en Equipos para este grupo.</p>
              ) : null}

              <label className="field-label" htmlFor="assign-type">
                Tipo de tarea
              </label>
              <select
                id="assign-type"
                className="field-select"
                value={taskTypeId}
                onChange={(event) => setTaskTypeId(event.target.value)}
                required
              >
                <option value="">{types.length === 0 ? 'Este equipo no tiene tipos' : 'Elige un tipo'}</option>
                {types.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>

              <label className="field-label" htmlFor="assign-board">
                Tablero
              </label>
              <select
                id="assign-board"
                className="field-select"
                value={boardId}
                onChange={(event) => setBoardId(event.target.value)}
              >
                <option value="">Sin tablero</option>
                {boards.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>

              <label className="field-label" htmlFor="assign-title">
                Qué hay que hacer
              </label>
              <input
                id="assign-title"
                className="field-input"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Llamar al cliente, confirmar recambio…"
                required
              />

              <label className="field-label" htmlFor="assign-due">
                Para el día
              </label>
              <input
                id="assign-due"
                className="field-input"
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                required
              />

              <label className="field-label" htmlFor="assign-peticion">
                Vincular consulta (opcional)
              </label>
              {loading ? (
                <HexLoaderScreen size="sm" label="Cargando consultas…" />
              ) : (
                <select
                  id="assign-peticion"
                  className="field-select"
                  value={peticionId}
                  onChange={(event) => {
                    const next = event.target.value
                    setPeticionId(next)
                    const item = pendingPeticiones.find((row) => row.idpeticion === next)
                    if (item && !title.trim()) {
                      setTitle(item.descripcion || item.tipopeticion || 'Seguimiento de consulta')
                    }
                  }}
                >
                  <option value="">Ninguna</option>
                  {pendingPeticiones.map((item: PeticionPendiente) => (
                    <option key={item.idpeticion} value={item.idpeticion}>
                      {ticketClientLabel(item)}{' '}
                      · {item.tipopeticion || 'Sin tipo'} · {formatFecha(item.fechainicio)}
                    </option>
                  ))}
                </select>
              )}

              <label className="field-label" htmlFor="assign-notes">
                Notas
              </label>
              <textarea
                id="assign-notes"
                className="field-input field-textarea"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Contexto para el asesor"
              />

              <button type="submit" className="client-submit" disabled={!canSubmit}>
                Asignar tarea
              </button>
              {notice ? (
                <p className="section-subtitle">
                  {notice}{' '}
                  {onOpenTodayTasks ? (
                    <button type="button" className="ghost-button" onClick={onOpenTodayTasks}>
                      Ir a Tareas de hoy
                    </button>
                  ) : null}
                </p>
              ) : null}
            </form>
          )}
        </Card>

        <Card>
          <p className="section-eyebrow">Reciente</p>
          <h2 className="ops-card-title">Tareas asignadas</h2>
          {recentTasks.length === 0 ? (
            <p className="section-subtitle">Aún no has asignado ninguna.</p>
          ) : (
            <ul className="role-list">
              {recentTasks.map((task) => {
                const assignee = personById(workspace, task.assigneeId)
                const taskTeam = workspace.teams.find((row) => row.id === task.teamId)
                return (
                  <li key={task.id} className="list-row">
                    <span className="list-row-title">{task.title}</span>
                    <span className="list-row-meta">
                      {assignee?.name || 'Sin dueño'}
                      {taskTeam ? ` · ${taskTeam.name}` : ''}
                      {' · '}
                      {catalogName(workspace.taskTypes, task.taskTypeId)} · {task.dueDate}
                    </span>
                    <span className={`badge ${task.status === 'hecho' ? 'tone-positive' : 'tone-warning'}`}>
                      {task.status === 'hecho' ? 'Hecha' : 'Pendiente'}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { CalendarDays, Check, Search, UserPlus, X } from 'lucide-react'
import { HexLoaderScreen } from '../components/ui/HexLoader'
import OperatorAvatar from '../components/OperatorAvatar'
import Card from '../components/ui/Card'
import ApiStatusBanner from '../components/ApiStatusBanner'
import { resolveDateRange } from '../lib/dateRangePresets'
import { formatFecha, type PeticionPendiente } from '../lib/peticionesPendientes'
import { ticketClientLabel, ticketClientPhone, ticketNeedLabel } from '../lib/ticketClient'
import {
  boardsForTeam,
  catalogName,
  isExampleAssignedTask,
  isPersonOnTeam,
  isPersonPendingDelete,
  localTodayIso,
  normalizeEmail,
  personById,
  typesForTeam,
} from '../lib/advisorWorkspace'
import { teamForTicketType } from '../lib/teamScope'
import { suggestTicketOwner, suggestTicketOwnerForTeam } from '../lib/ticketOwnerSuggest'
import { useAdvisorWorkspace } from '../hooks/useAdvisorWorkspace'
import { useOperationalData } from '../hooks/useOperationalData'
import { reassignTicketOwner } from '../lib/ticketOps'
import type { Workshop } from '../types'

type Props = {
  workshop: Workshop
  currentUser: { name: string; email: string }
  onOpenTodayTasks?: () => void
}

function shiftIso(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number)
  const date = new Date(year || 1970, (month || 1) - 1, day || 1)
  date.setDate(date.getDate() + days)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatDueChip(iso: string, today: string): string {
  if (iso === today) return 'Hoy'
  if (iso === shiftIso(today, 1)) return 'Mañana'
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year || 1970, (month || 1) - 1, day || 1).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
  })
}

function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function openWorkForPerson(
  personId: string,
  email: string,
  tickets: PeticionPendiente[],
  taskAssigneeIds: string[],
): number {
  const key = normalizeEmail(email)
  const openTickets = tickets.reduce((count, row) => {
    if (row.gestionado) return count
    return normalizeEmail(row.gestionemail || '') === key ? count + 1 : count
  }, 0)
  const openTasks = taskAssigneeIds.reduce((count, id) => (id === personId ? count + 1 : count), 0)
  return openTickets + openTasks
}

function workLabel(count: number): string {
  if (count <= 0) return 'Libre ahora'
  if (count === 1) return '1 por hacer'
  return `${count} por hacer`
}

function suggestHint(reason: 'cliente' | 'equipo' | 'carga'): string {
  if (reason === 'cliente') return 'Ya atendió a este cliente'
  if (reason === 'equipo') return 'Es de su equipo y tipo'
  return 'Quien menos tickets abiertos tiene'
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

  const [teamId, setTeamId] = useState(() => {
    try {
      const stored = sessionStorage.getItem('avi_assign_team')
      if (stored) sessionStorage.removeItem('avi_assign_team')
      if (stored && workspace.teams.some((row) => row.id === stored)) return stored
    } catch {
      /* ignore */
    }
    return workspace.teams[0]?.id ?? ''
  })
  const [assigneeId, setAssigneeId] = useState('')
  const [taskTypeId, setTaskTypeId] = useState('')
  const [boardId, setBoardId] = useState('')
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [dueDate, setDueDate] = useState(localTodayIso())
  const [peticionId, setPeticionId] = useState('')
  const [ticketQuery, setTicketQuery] = useState('')
  const [notice, setNotice] = useState<string | null>(null)

  const today = localTodayIso()
  const tomorrow = shiftIso(today, 1)
  const duePreset = dueDate === today ? 'hoy' : dueDate === tomorrow ? 'manana' : 'otro'

  const team = workspace.teams.find((row) => row.id === teamId)
  const members = workspace.people.filter(
    (person) => !isPersonPendingDelete(person) && (!team || isPersonOnTeam(workspace, team, person.id, person.email)),
  )
  const types = typesForTeam(workspace, team)
  const boards = boardsForTeam(workspace, team)
  const memberKey = members.map((person) => person.id).join('|')
  const typeKey = types.map((item) => item.id).join('|')
  const boardKey = boards.map((item) => item.id).join('|')

  const pendingTasks = useMemo(
    () =>
      workspace.tasks
        .filter((task) => !isExampleAssignedTask(task) && task.status !== 'hecho')
        .map((task) => task.assigneeId),
    [workspace.tasks],
  )

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
    setTaskTypeId(ids[0] ?? '')
  }, [teamId, taskTypeId, typeKey])

  useEffect(() => {
    if (!boardId || boardKey.split('|').includes(boardId)) return
    setBoardId('')
  }, [teamId, boardId, boardKey])

  const pendingPeticiones = useMemo(() => items.filter((item) => !item.gestionado), [items])
  const linked = pendingPeticiones.find((item) => item.idpeticion === peticionId) ?? null

  const suggested = useMemo(() => {
    if (!linked) return null
    if (team) return suggestTicketOwnerForTeam(workspace, team, linked, items)
    return suggestTicketOwner(workspace, linked, items)
  }, [linked, team, workspace, items])

  const rankedMembers = useMemo(() => {
    const suggestedId = suggested?.person.id
    return [...members].sort((a, b) => {
      if (a.id === suggestedId) return -1
      if (b.id === suggestedId) return 1
      const delta =
        openWorkForPerson(a.id, a.email, items, pendingTasks) -
        openWorkForPerson(b.id, b.email, items, pendingTasks)
      if (delta !== 0) return delta
      return a.name.localeCompare(b.name, 'es')
    })
  }, [members, suggested, items, pendingTasks])

  const filteredTickets = useMemo(() => {
    const needle = fold(ticketQuery)
    if (!needle) return pendingPeticiones
    return pendingPeticiones.filter((item) =>
      fold(
        `${ticketClientLabel(item)} ${ticketClientPhone(item)} ${item.tipopeticion || ''} ${ticketNeedLabel(item)}`,
      ).includes(needle),
    )
  }, [pendingPeticiones, ticketQuery])

  const recentTasks = useMemo(
    () =>
      workspace.tasks
        .filter((task) => !isExampleAssignedTask(task))
        .slice()
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
    [workspace.tasks],
  )

  const canSubmit = Boolean(title.trim() && assigneeId && taskTypeId && dueDate && members.length > 0)

  const applyTeam = (nextId: string) => {
    const nextTeam = workspace.teams.find((row) => row.id === nextId)
    setTeamId(nextId)
    setTaskTypeId(typesForTeam(workspace, nextTeam)[0]?.id ?? '')
    setBoardId('')
    setNotice(null)
  }

  const pickTeam = (next: string) => {
    applyTeam(next)
    setAssigneeId('')
  }

  const pickTicket = (nextId: string) => {
    setPeticionId(nextId)
    setNotice(null)
    if (!nextId) return
    const item = pendingPeticiones.find((row) => row.idpeticion === nextId)
    if (!item) return
    if (!title.trim()) {
      setTitle(item.descripcion || item.tipopeticion || 'Seguimiento de consulta')
    }
    const owner = suggestTicketOwner(workspace, item, items)
    const ownerTeam =
      owner &&
      workspace.teams.find((row) => isPersonOnTeam(workspace, row, owner.person.id, owner.person.email))
    const typeTeam = teamForTicketType(workspace, item.tipopeticion)
    const nextTeam = ownerTeam || typeTeam
    if (nextTeam && nextTeam.id !== teamId) {
      applyTeam(nextTeam.id)
    }
    const nextMembers = workspace.people.filter(
      (person) =>
        !isPersonPendingDelete(person) &&
        (!nextTeam || isPersonOnTeam(workspace, nextTeam, person.id, person.email)),
    )
    if (owner && nextMembers.some((person) => person.id === owner.person.id)) {
      setAssigneeId(owner.person.id)
    }
  }

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const assignee = personById(workspace, assigneeId)
    if (!assignee || !title.trim() || !taskTypeId || !dueDate) return
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
    if (linked) {
      try {
        await reassignTicketOwner(workshop, workspace, currentUser, 'admin', linked, assignee.email)
      } catch {
        /* la tarea ya está */
      }
    }
    setTitle('')
    setNotes('')
    setPeticionId('')
    setTicketQuery('')
    setNotice(
      linked
        ? `Listo: tarea y ticket para ${assignee.name}.`
        : `Listo: tarea para ${assignee.name}.`,
    )
  }

  return (
    <div className="dashboard-page role-desk assign-desk">
      {error ? <ApiStatusBanner message={error} variant="error" /> : null}
      {sourceNotice && !error ? <ApiStatusBanner message={sourceNotice} variant="warning" /> : null}
      {persistError ? (
        <ApiStatusBanner
          message="No se ha podido guardar en el taller. La tarea queda en este navegador."
          variant="warning"
        />
      ) : null}

      <div className="role-desk-grid role-desk-grid-2">
        <Card className="assign-desk-form">
          {workspaceLoading && workspace.teams.length === 0 ? (
            <HexLoaderScreen size="sm" label="Cargando equipos…" />
          ) : workspace.teams.length === 0 ? (
            <p className="section-subtitle">Crea un equipo en Cuentas y equipos antes de asignar.</p>
          ) : (
            <form className="assign-form" onSubmit={(event) => void onSubmit(event)}>
              {notice ? (
                <p className="assign-success" role="status">
                  {notice}{' '}
                  {onOpenTodayTasks ? (
                    <button type="button" className="ghost-button" onClick={onOpenTodayTasks}>
                      Ver historial
                    </button>
                  ) : null}
                </p>
              ) : null}

              <fieldset className="assign-step">
                <legend>1. A quién</legend>
                {workspace.teams.length > 1 ? (
                  <div className="assign-pills" role="group" aria-label="Equipo">
                    {workspace.teams.map((row) => (
                      <button
                        key={row.id}
                        type="button"
                        className={`triage-view-btn${teamId === row.id ? ' is-active' : ''}`}
                        aria-pressed={teamId === row.id}
                        onClick={() => pickTeam(row.id)}
                      >
                        {row.name}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="assign-team-one">{team?.name}</p>
                )}

                {members.length === 0 ? (
                  <p className="section-subtitle">Este equipo no tiene asesores. Márcalos en Cuentas y equipos.</p>
                ) : (
                  <div className="assign-people" role="listbox" aria-label="Asesor">
                    {rankedMembers.map((person) => {
                      const selected = assigneeId === person.id
                      const isSuggested = suggested?.person.id === person.id
                      const load = openWorkForPerson(person.id, person.email, items, pendingTasks)
                      return (
                        <button
                          key={person.id}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          className={`assign-person${selected ? ' is-selected' : ''}${isSuggested ? ' is-suggested' : ''}`}
                          onClick={() => {
                            setAssigneeId(person.id)
                            setNotice(null)
                          }}
                        >
                          <OperatorAvatar name={person.name} photoUrl={person.photoUrl} size="sm" />
                          <span className="assign-person-copy">
                            <strong>{person.name}</strong>
                            <small>{isSuggested && suggested ? suggestHint(suggested.reason) : workLabel(load)}</small>
                          </span>
                          {selected ? (
                            <span className="assign-person-check" aria-hidden>
                              <Check size={16} />
                            </span>
                          ) : isSuggested ? (
                            <span className="badge tone-positive">Le tocaría</span>
                          ) : null}
                        </button>
                      )
                    })}
                  </div>
                )}
              </fieldset>

              <fieldset className="assign-step">
                <legend>2. Qué hay que hacer</legend>
                <label className="field-label" htmlFor="assign-title">
                  Tarea
                </label>
                <input
                  id="assign-title"
                  className="field-input assign-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Llamar al cliente, confirmar recambio…"
                  required
                />
                {types.length > 1 ? (
                  <>
                    <p className="assign-mini-label" id="assign-type-label">
                      Tipo
                    </p>
                    <div className="assign-pills" role="group" aria-labelledby="assign-type-label">
                      {types.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={`triage-view-btn${taskTypeId === item.id ? ' is-active' : ''}`}
                          aria-pressed={taskTypeId === item.id}
                          onClick={() => setTaskTypeId(item.id)}
                        >
                          {item.name}
                        </button>
                      ))}
                    </div>
                  </>
                ) : null}
                {types.length === 0 ? (
                  <p className="section-subtitle">Este equipo no tiene tipos de tarea. Ponlos en Cuentas y equipos.</p>
                ) : null}
              </fieldset>

              <fieldset className="assign-step">
                <legend>3. Para cuándo</legend>
                <div className="assign-due">
                  <button
                    type="button"
                    className={`triage-view-btn${duePreset === 'hoy' ? ' is-active' : ''}`}
                    aria-pressed={duePreset === 'hoy'}
                    onClick={() => setDueDate(today)}
                  >
                    Hoy
                  </button>
                  <button
                    type="button"
                    className={`triage-view-btn${duePreset === 'manana' ? ' is-active' : ''}`}
                    aria-pressed={duePreset === 'manana'}
                    onClick={() => setDueDate(tomorrow)}
                  >
                    Mañana
                  </button>
                  {duePreset === 'otro' ? (
                    <label className="assign-due-date is-active" htmlFor="assign-due">
                      <CalendarDays size={16} aria-hidden />
                      <input
                        id="assign-due"
                        type="date"
                        value={dueDate}
                        onChange={(event) => setDueDate(event.target.value)}
                        required
                      />
                    </label>
                  ) : (
                    <button
                      type="button"
                      className="triage-view-btn"
                      onClick={() => setDueDate(shiftIso(today, 2))}
                    >
                      Otro día
                    </button>
                  )}
                </div>
              </fieldset>

              <fieldset className="assign-step assign-step-ticket">
                <legend>Consulta (si viene de un ticket)</legend>
                {linked ? (
                  <div className="assign-ticket-picked">
                    <span>
                      <strong>{ticketClientLabel(linked)}</strong>
                      <small>
                        {ticketNeedLabel(linked)}
                        {ticketClientPhone(linked) ? ` · ${ticketClientPhone(linked)}` : ''}
                      </small>
                    </span>
                    <button type="button" className="ghost-button" onClick={() => pickTicket('')}>
                      <X size={16} aria-hidden />
                      Quitar
                    </button>
                  </div>
                ) : loading ? (
                  <HexLoaderScreen size="sm" label="Cargando consultas…" />
                ) : (
                  <>
                    <label className="assign-search" htmlFor="assign-ticket-q">
                      <Search size={18} aria-hidden />
                      <input
                        id="assign-ticket-q"
                        className="field-input"
                        value={ticketQuery}
                        onChange={(event) => setTicketQuery(event.target.value)}
                        placeholder="Busca cliente, teléfono o tipo…"
                      />
                    </label>
                    {pendingPeticiones.length === 0 ? (
                      <p className="section-subtitle">No hay consultas abiertas para vincular.</p>
                    ) : fold(ticketQuery).length < 2 ? (
                      <p className="section-subtitle">
                        Escribe 2 letras o el teléfono. Si no viene de un ticket, déjalo vacío.
                      </p>
                    ) : filteredTickets.length === 0 ? (
                      <p className="section-subtitle">No hay consultas con eso.</p>
                    ) : (
                      <ul className="assign-ticket-list">
                        {filteredTickets.map((item: PeticionPendiente) => (
                          <li key={item.idpeticion}>
                            <button type="button" className="assign-ticket" onClick={() => pickTicket(item.idpeticion)}>
                              <strong>{ticketClientLabel(item)}</strong>
                              <small>
                                {ticketNeedLabel(item)} · {formatFecha(item.fechainicio)}
                              </small>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </fieldset>

              <details className="assign-more">
                <summary>Tablero y notas</summary>
                {boards.length > 0 ? (
                  <>
                    <p className="assign-mini-label" id="assign-board-label">
                      Tablero
                    </p>
                    <div className="assign-pills" role="group" aria-labelledby="assign-board-label">
                      <button
                        type="button"
                        className={`triage-view-btn${!boardId ? ' is-active' : ''}`}
                        aria-pressed={!boardId}
                        onClick={() => setBoardId('')}
                      >
                        Sin tablero
                      </button>
                      {boards.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={`triage-view-btn${boardId === item.id ? ' is-active' : ''}`}
                          aria-pressed={boardId === item.id}
                          onClick={() => setBoardId(item.id)}
                        >
                          {item.name}
                        </button>
                      ))}
                    </div>
                  </>
                ) : null}
                <label className="field-label" htmlFor="assign-notes">
                  Notas para el asesor
                </label>
                <textarea
                  id="assign-notes"
                  className="field-input field-textarea"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Contexto corto: qué pasó y qué tiene que hacer"
                />
              </details>

              <button type="submit" className="client-submit assign-submit" disabled={!canSubmit}>
                <UserPlus size={18} aria-hidden />
                Asignar
              </button>
            </form>
          )}
        </Card>

        <Card className="assign-desk-recent">
          <p className="section-eyebrow">Reciente</p>
          <h2 className="ops-card-title">Ya asignadas</h2>
          {recentTasks.length === 0 ? (
            <p className="section-subtitle">Cuando asignes, salen aquí.</p>
          ) : (
            <ul className="assign-recent">
              {recentTasks.map((task) => {
                const assignee = personById(workspace, task.assigneeId)
                return (
                  <li key={task.id} className="assign-recent-row">
                    <span className="assign-recent-title">{task.title}</span>
                    <span className="assign-recent-meta">
                      {assignee?.name || 'Sin dueño'} · {catalogName(workspace.taskTypes, task.taskTypeId)} ·{' '}
                      {formatDueChip(task.dueDate, today)}
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

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  CalendarDays,
  Check,
  ChevronDown,
  ClipboardList,
  Link2,
  Search,
  Sparkles,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
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

function choiceClass(active: boolean): string {
  return `min-h-tap rounded-pill border px-4 text-sm font-semibold transition-colors duration-fast focus-visible:outline-none focus-visible:shadow-focus ${
    active
      ? 'border-avi-brand bg-avi-brand text-white shadow-brand'
      : 'border-avi-line bg-avi-surface-solid text-avi-fog-strong hover:border-avi-brand hover:bg-avi-brand-soft'
  }`
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
  const [consultationOpen, setConsultationOpen] = useState(false)
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
  const selectedAssignee = personById(workspace, assigneeId)
  const selectedType = types.find((item) => item.id === taskTypeId)
  const selectedBoard = boards.find((item) => item.id === boardId)
  const nextAction = !assigneeId
    ? 'Elige quién se encargará.'
    : !title.trim()
      ? 'Escribe qué tiene que hacer.'
      : !taskTypeId
        ? 'Elige un tipo de tarea.'
        : !dueDate
          ? 'Elige para qué día.'
          : `Todo listo para asignar a ${selectedAssignee?.name || 'el asesor'}.`

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
    if (!nextId) {
      setConsultationOpen(false)
      setTicketQuery('')
      return
    }
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
    <div className="dashboard-page">
      {error ? <ApiStatusBanner message={error} variant="error" /> : null}
      {sourceNotice && !error ? <ApiStatusBanner message={sourceNotice} variant="warning" /> : null}
      {persistError ? (
        <ApiStatusBanner
          message="No se ha podido guardar en el taller. La tarea queda en este navegador."
          variant="warning"
        />
      ) : null}

      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.55fr)]">
        <Card className="min-w-0 overflow-visible" padding="none">
          <div className="flex flex-wrap items-center gap-3 border-b border-avi-line px-4 py-4 sm:px-5">
            <span
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-avi-brand-soft text-avi-brand"
              aria-hidden
            >
              <ClipboardList size={22} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold tracking-[-0.02em] text-avi-fog-strong">Nueva tarea</h2>
              <p className="m-0 text-sm text-avi-muted">
                Elige quién la hará, explica el trabajo y confirma la fecha.
              </p>
            </div>
          </div>

          {workspaceLoading && workspace.teams.length === 0 ? (
            <HexLoaderScreen size="sm" label="Cargando equipos…" />
          ) : workspace.teams.length === 0 ? (
            <p className="m-5 text-base text-avi-muted">Crea un equipo en Cuentas y equipos antes de asignar.</p>
          ) : (
            <form
              id="assign-task-form"
              className="flex min-w-0 flex-col gap-4 p-4 sm:p-5"
              onSubmit={(event) => void onSubmit(event)}
            >
              {notice ? (
                <div
                  className="flex flex-wrap items-center gap-3 rounded-md border border-avi-success bg-avi-surface-solid px-4 py-3 text-sm font-semibold text-avi-success"
                  role="status"
                >
                  <Check size={18} aria-hidden />
                  <span className="min-w-0 flex-1">{notice}</span>
                  {onOpenTodayTasks ? (
                    <button type="button" className="ghost-button" onClick={onOpenTodayTasks}>
                      Ver historial
                    </button>
                  ) : null}
                </div>
              ) : null}

              <section className="min-w-0 rounded-md border border-avi-line bg-avi-surface p-3 sm:p-4">
                <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-3 sm:flex sm:items-center">
                  <span
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-pill bg-avi-brand-soft font-bold text-avi-brand"
                    aria-hidden
                  >
                    {linked ? <Check size={17} /> : 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <strong className="flex flex-wrap items-center gap-2 text-base text-avi-fog-strong">
                      Consulta relacionada
                      <span className="badge">Opcional</span>
                    </strong>
                    <small className="block text-sm text-avi-muted">
                      Si eliges una, proponemos automáticamente quién debería atenderla.
                    </small>
                  </span>
                  {!linked ? (
                    <button
                      type="button"
                      className="ghost-button col-span-2 w-full shrink-0 sm:w-auto"
                      aria-expanded={consultationOpen}
                      onClick={() => {
                        setConsultationOpen((value) => !value)
                        setNotice(null)
                      }}
                    >
                      <Search size={17} aria-hidden />
                      <span className="hidden sm:inline">{consultationOpen ? 'Cerrar' : 'Buscar consulta'}</span>
                      <span className="sm:hidden">{consultationOpen ? 'Cerrar' : 'Buscar'}</span>
                    </button>
                  ) : null}
                </div>

                {linked ? (
                  <div className="mt-3 flex min-w-0 flex-wrap items-center gap-3 rounded-sm border border-avi-brand bg-avi-brand-soft p-3">
                    <Link2 size={18} className="shrink-0 text-avi-brand" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate text-base text-avi-fog-strong">{ticketClientLabel(linked)}</strong>
                      <small className="block truncate text-sm text-avi-muted">
                        {ticketNeedLabel(linked)}
                        {ticketClientPhone(linked) ? ` · ${ticketClientPhone(linked)}` : ''}
                      </small>
                    </span>
                    <button type="button" className="ghost-button shrink-0" onClick={() => pickTicket('')}>
                      <X size={16} aria-hidden />
                      Quitar
                    </button>
                  </div>
                ) : consultationOpen ? (
                  <div className="mt-3 border-t border-avi-line pt-3">
                    {loading ? (
                      <HexLoaderScreen size="sm" label="Cargando consultas…" />
                    ) : (
                      <>
                        <label className="relative block" htmlFor="assign-ticket-q">
                          <span className="sr-only">Buscar consulta</span>
                          <Search
                            size={19}
                            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-avi-muted"
                            aria-hidden
                          />
                          <input
                            id="assign-ticket-q"
                            className="field-input min-h-tap max-w-none pl-12 pr-12"
                            value={ticketQuery}
                            onChange={(event) => setTicketQuery(event.target.value)}
                            placeholder="Nombre, teléfono o tipo de consulta"
                            autoFocus
                          />
                          {ticketQuery ? (
                            <button
                              type="button"
                              className="absolute right-1 top-1/2 inline-flex min-h-tap min-w-tap -translate-y-1/2 items-center justify-center rounded-pill text-avi-muted hover:bg-avi-brand-soft hover:text-avi-brand"
                              onClick={() => setTicketQuery('')}
                              aria-label="Borrar búsqueda"
                            >
                              <X size={17} aria-hidden />
                            </button>
                          ) : null}
                        </label>
                        {pendingPeticiones.length === 0 ? (
                          <p className="mb-0 mt-3 text-sm text-avi-muted">No hay consultas abiertas para vincular.</p>
                        ) : fold(ticketQuery).length < 2 ? (
                          <p className="mb-0 mt-3 text-sm text-avi-muted">
                            Escribe al menos dos letras o números.
                          </p>
                        ) : filteredTickets.length === 0 ? (
                          <p className="mb-0 mt-3 text-sm text-avi-muted">
                            No encontramos ninguna consulta con esos datos.
                          </p>
                        ) : (
                          <ul className="mt-3 grid max-h-[22rem] gap-2 overflow-y-auto pr-1 md:grid-cols-2">
                            {filteredTickets.map((item: PeticionPendiente) => (
                              <li key={item.idpeticion}>
                                <button
                                  type="button"
                                  className="flex min-h-[68px] w-full min-w-0 flex-col items-start justify-center rounded-sm border border-avi-line bg-avi-surface-solid px-3 py-2 text-left transition-colors hover:border-avi-brand hover:bg-avi-brand-soft focus-visible:outline-none focus-visible:shadow-focus"
                                  onClick={() => pickTicket(item.idpeticion)}
                                >
                                  <strong className="w-full truncate text-base text-avi-fog-strong">
                                    {ticketClientLabel(item)}
                                  </strong>
                                  <small className="w-full truncate text-sm text-avi-muted">
                                    {ticketNeedLabel(item)} · {formatFecha(item.fechainicio)}
                                  </small>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </>
                    )}
                  </div>
                ) : null}
              </section>

              <div className="grid min-w-0 gap-4 lg:grid-cols-2 lg:items-start">
              <fieldset className="m-0 min-w-0 rounded-md border border-avi-line bg-avi-surface p-4">
                <legend className="float-none flex items-center gap-2 px-1 text-base font-bold text-avi-fog-strong">
                  <span
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-pill text-sm text-white ${
                      assigneeId ? 'bg-avi-success' : 'bg-avi-brand'
                    }`}
                  >
                    {assigneeId ? <Check size={17} aria-hidden /> : 2}
                  </span>
                  <Users size={18} className="text-avi-brand" aria-hidden />
                  Responsable
                </legend>

                {workspace.teams.length > 1 ? (
                  <label className="mt-2 block" htmlFor="assign-team">
                    <span className="mb-1 block text-sm font-semibold text-avi-fog-strong">Equipo</span>
                    <span className="relative block">
                      <select
                        id="assign-team"
                        className="field-input min-h-tap max-w-none appearance-none pr-12 font-semibold"
                        value={teamId}
                        onChange={(event) => pickTeam(event.target.value)}
                      >
                        {workspace.teams.map((row) => (
                          <option key={row.id} value={row.id}>
                            {row.name}
                          </option>
                        ))}
                      </select>
                      <ChevronDown
                        size={18}
                        className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-avi-muted"
                        aria-hidden
                      />
                    </span>
                  </label>
                ) : (
                  <p className="mb-3 mt-1 text-sm text-avi-muted">
                    Equipo: <strong className="text-avi-fog-strong">{team?.name}</strong>
                  </p>
                )}

                <p className="mb-2 mt-4 text-sm font-semibold text-avi-fog-strong">Persona responsable</p>
                {members.length === 0 ? (
                  <p className="mt-3 text-sm text-avi-danger">
                    Este equipo no tiene asesores. Márcalos en Cuentas y equipos.
                  </p>
                ) : (
                  <div
                    className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2"
                    role="listbox"
                    aria-label="Persona responsable"
                  >
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
                          className={`flex min-h-[76px] min-w-0 items-center gap-3 rounded-md border p-3 text-left transition-colors focus-visible:outline-none focus-visible:shadow-focus ${
                            selected
                              ? 'border-avi-brand bg-avi-brand-soft'
                              : isSuggested
                                ? 'border-avi-success bg-avi-surface-solid hover:bg-avi-brand-soft'
                                : 'border-avi-line bg-avi-surface-solid hover:border-avi-brand hover:bg-avi-brand-soft'
                          }`}
                          onClick={() => {
                            setAssigneeId(person.id)
                            setNotice(null)
                          }}
                        >
                          <OperatorAvatar name={person.name} photoUrl={person.photoUrl} size="md" />
                          <span className="min-w-0 flex-1">
                            <strong className="block truncate text-base text-avi-fog-strong">{person.name}</strong>
                            <small className="block truncate text-sm text-avi-muted">
                              {isSuggested && suggested ? suggestHint(suggested.reason) : workLabel(load)}
                            </small>
                          </span>
                          {selected ? (
                            <span
                              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-pill bg-avi-brand text-white"
                              aria-hidden
                            >
                              <Check size={17} />
                            </span>
                          ) : isSuggested ? (
                            <span className="badge tone-positive shrink-0">Le tocaría</span>
                          ) : null}
                        </button>
                      )
                    })}
                  </div>
                )}
              </fieldset>

              <fieldset className="m-0 min-w-0 rounded-md border border-avi-line bg-avi-surface p-4">
                <legend className="float-none flex items-center gap-2 px-1 text-base font-bold text-avi-fog-strong">
                  <span
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-pill text-sm text-white ${
                      title.trim() && taskTypeId && dueDate ? 'bg-avi-success' : 'bg-avi-brand'
                    }`}
                  >
                    {title.trim() && taskTypeId && dueDate ? <Check size={17} aria-hidden /> : 3}
                  </span>
                  <ClipboardList size={18} className="text-avi-brand" aria-hidden />
                  Tarea y fecha
                </legend>

                <label className="mb-1 mt-1 block text-sm font-semibold text-avi-fog-strong" htmlFor="assign-title">
                  ¿Qué tiene que hacer?
                </label>
                <input
                  id="assign-title"
                  className="field-input min-h-tap max-w-none"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Ej.: Llamar al cliente y confirmar la cita"
                  required
                />

                {types.length > 1 ? (
                  <>
                    <p className="mb-2 mt-4 text-sm font-semibold text-avi-fog-strong" id="assign-type-label">
                      Tipo de tarea
                    </p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2 2xl:grid-cols-3" role="group" aria-labelledby="assign-type-label">
                      {types.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={`${choiceClass(taskTypeId === item.id)} w-full`}
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
                  <p className="mt-3 text-sm text-avi-danger">
                    Este equipo no tiene tipos de tarea. Ponlos en Cuentas y equipos.
                  </p>
                ) : null}

                <p className="mb-2 mt-4 text-sm font-semibold text-avi-fog-strong" id="assign-due-label">
                  ¿Para cuándo?
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2 2xl:grid-cols-3" role="group" aria-labelledby="assign-due-label">
                  <button
                    type="button"
                    className={`${choiceClass(duePreset === 'hoy')} w-full`}
                    aria-pressed={duePreset === 'hoy'}
                    onClick={() => setDueDate(today)}
                  >
                    Hoy
                  </button>
                  <button
                    type="button"
                    className={`${choiceClass(duePreset === 'manana')} w-full`}
                    aria-pressed={duePreset === 'manana'}
                    onClick={() => setDueDate(tomorrow)}
                  >
                    Mañana
                  </button>
                  {duePreset === 'otro' ? (
                    <label
                      className="inline-flex min-h-tap w-full items-center justify-center gap-2 rounded-pill border border-avi-brand bg-avi-brand-soft px-3 text-sm font-semibold text-avi-brand-strong"
                      htmlFor="assign-due"
                    >
                      <CalendarDays size={17} aria-hidden />
                      <input
                        id="assign-due"
                        className="min-h-tap min-w-0 w-full border-0 bg-transparent text-avi-fog-strong outline-none"
                        type="date"
                        value={dueDate}
                        onChange={(event) => setDueDate(event.target.value)}
                        required
                      />
                    </label>
                  ) : (
                    <button
                      type="button"
                      className={`${choiceClass(false)} w-full`}
                      onClick={() => setDueDate(shiftIso(today, 2))}
                    >
                      Otro día
                    </button>
                  )}
                </div>

              <details className="group mt-4 rounded-sm border border-avi-line bg-avi-surface-solid">
                <summary className="flex min-h-tap cursor-pointer list-none items-center gap-2 px-4 py-2 font-semibold text-avi-fog-strong">
                  <Sparkles size={18} className="text-avi-brand" aria-hidden />
                  Tablero y notas
                  <span className="ml-1 text-sm font-normal text-avi-muted">(opcional)</span>
                  <ChevronDown
                    size={18}
                    className="ml-auto text-avi-muted transition-transform group-open:rotate-180"
                    aria-hidden
                  />
                </summary>
                <div className="flex flex-col gap-4 border-t border-avi-line p-4">
                  {boards.length > 0 ? (
                    <div>
                      <p className="mb-2 text-sm font-semibold text-avi-fog-strong" id="assign-board-label">
                        Tablero
                      </p>
                      <div className="flex flex-wrap gap-2" role="group" aria-labelledby="assign-board-label">
                        <button
                          type="button"
                          className={choiceClass(!boardId)}
                          aria-pressed={!boardId}
                          onClick={() => setBoardId('')}
                        >
                          Sin tablero
                        </button>
                        {boards.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            className={choiceClass(boardId === item.id)}
                            aria-pressed={boardId === item.id}
                            onClick={() => setBoardId(item.id)}
                          >
                            {item.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <label className="text-sm font-semibold text-avi-fog-strong" htmlFor="assign-notes">
                    Notas para el asesor
                  </label>
                  <textarea
                    id="assign-notes"
                    className="field-input min-h-28 max-w-none resize-y"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Añade solo el contexto que necesite para hacer la tarea"
                  />
                </div>
              </details>
              </fieldset>
              </div>

              <div className="rounded-md border border-avi-line bg-avi-surface p-4 xl:hidden">
                <strong className="block text-base text-avi-fog-strong">Revisa y asigna</strong>
                <p className="mb-0 mt-1 break-words text-sm text-avi-muted">
                  {selectedAssignee?.name || 'Sin responsable'} · {selectedType?.name || 'Sin tipo'} ·{' '}
                  {formatDueChip(dueDate, today)}
                  {title.trim() ? ` · ${title.trim()}` : ''}
                </p>
                <p className={`mb-3 mt-3 text-sm ${canSubmit ? 'font-semibold text-avi-success' : 'text-avi-muted'}`}>
                  {nextAction}
                </p>
                <button type="submit" className="client-submit min-h-tap w-full" disabled={!canSubmit}>
                  <UserPlus size={18} aria-hidden />
                  {selectedAssignee ? `Asignar a ${selectedAssignee.name}` : 'Asignar tarea'}
                </button>
              </div>
            </form>
          )}
        </Card>

        <aside className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-4">
          {workspace.teams.length > 0 ? (
            <Card className="hidden min-w-0 xl:block" padding="sm">
              <p className="section-eyebrow">Paso final</p>
              <h2 className="mt-1 text-lg font-bold tracking-[-0.02em] text-avi-fog-strong">Revisa y asigna</h2>
              <div className="mt-4 flex flex-col gap-3">
                <div className="flex items-center gap-3 rounded-sm bg-avi-surface p-3">
                  {selectedAssignee ? (
                    <OperatorAvatar name={selectedAssignee.name} photoUrl={selectedAssignee.photoUrl} size="md" />
                  ) : (
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-pill bg-avi-brand-soft text-avi-brand">
                      <Users size={18} aria-hidden />
                    </span>
                  )}
                  <span className="min-w-0">
                    <small className="block text-sm text-avi-muted">Responsable</small>
                    <strong className="block truncate text-base text-avi-fog-strong">
                      {selectedAssignee?.name || 'Falta elegir'}
                    </strong>
                  </span>
                </div>
                <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
                  <span className="text-avi-muted">Equipo</span>
                  <strong className="min-w-0 break-words text-right text-avi-fog-strong">{team?.name || '—'}</strong>
                  <span className="text-avi-muted">Tarea</span>
                  <strong className="min-w-0 break-words text-right text-avi-fog-strong">
                    {title.trim() || 'Falta escribir'}
                  </strong>
                  <span className="text-avi-muted">Tipo</span>
                  <strong className="min-w-0 break-words text-right text-avi-fog-strong">
                    {selectedType?.name || '—'}
                  </strong>
                  <span className="text-avi-muted">Fecha</span>
                  <strong className="text-right text-avi-fog-strong">{formatDueChip(dueDate, today)}</strong>
                  {linked ? (
                    <>
                      <span className="text-avi-muted">Consulta</span>
                      <strong className="truncate text-right text-avi-fog-strong">{ticketClientLabel(linked)}</strong>
                    </>
                  ) : null}
                  {selectedBoard ? (
                    <>
                      <span className="text-avi-muted">Tablero</span>
                      <strong className="truncate text-right text-avi-fog-strong">{selectedBoard.name}</strong>
                    </>
                  ) : null}
                </div>
              </div>
              <p
                className={`mb-3 mt-4 rounded-sm px-3 py-2 text-sm ${
                  canSubmit
                    ? 'border border-avi-success bg-avi-surface-solid font-semibold text-avi-success'
                    : 'bg-avi-surface text-avi-muted'
                }`}
              >
                {nextAction}
              </p>
              <button
                type="submit"
                form="assign-task-form"
                className="client-submit min-h-tap w-full"
                disabled={!canSubmit}
              >
                <UserPlus size={18} aria-hidden />
                {selectedAssignee ? `Asignar a ${selectedAssignee.name}` : 'Asignar tarea'}
              </button>
            </Card>
          ) : null}

          <Card className="min-w-0" padding="sm">
            <h2 className="text-lg font-bold tracking-[-0.02em] text-avi-fog-strong">Tareas recientes</h2>
            {recentTasks.length === 0 ? (
              <p className="mb-0 mt-3 text-sm text-avi-muted">Cuando asignes una tarea, aparecerá aquí.</p>
            ) : (
              <ul className="mt-3 flex max-h-[38rem] flex-col gap-2 overflow-y-auto pr-1">
                {recentTasks.map((task) => {
                  const assignee = personById(workspace, task.assigneeId)
                  return (
                    <li
                      key={task.id}
                      className="flex min-w-0 items-center gap-3 rounded-sm border border-avi-line bg-avi-surface px-3 py-3"
                    >
                      <span className="min-w-0 flex-1">
                        <strong className="line-clamp-2 block text-sm leading-snug text-avi-fog-strong">{task.title}</strong>
                        <small className="mt-1 block truncate text-sm text-avi-muted">
                          {assignee?.name || 'Sin dueño'} · {catalogName(workspace.taskTypes, task.taskTypeId)} ·{' '}
                          {formatDueChip(task.dueDate, today)}
                        </small>
                      </span>
                      <span
                        className={`badge shrink-0 self-center whitespace-nowrap ${
                          task.status === 'hecho' ? 'tone-positive' : 'tone-warning'
                        }`}
                      >
                        {task.status === 'hecho' ? 'Hecha' : 'Pendiente'}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        </aside>
      </div>
    </div>
  )
}

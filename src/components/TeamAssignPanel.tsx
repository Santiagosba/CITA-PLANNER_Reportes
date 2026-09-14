import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { UserPlus } from 'lucide-react'
import {
  isPersonOnTeam,
  localTodayIso,
  personById,
  type AdvisorWorkspace,
  type AssignedTask,
  type AssignedTaskStatus,
} from '../lib/advisorWorkspace'
import { matchesTeamFilter, TEAM_FILTER_ALL, TEAM_FILTER_LOOSE, type TeamFilterId } from '../lib/teamScope'
import { ticketClientLabel, ticketClientPhone } from '../lib/ticketClient'
import { reassignTicketOwner } from '../lib/ticketOps'
import { formatFecha, type PeticionPendiente } from '../lib/peticionesPendientes'
import type { Workshop } from '../types'
import Card from './ui/Card'

type Props = {
  workshop: Workshop
  workspace: AdvisorWorkspace
  currentUser: { name: string; email: string }
  teamFilter: TeamFilterId
  looseTickets: PeticionPendiente[]
  assignTask: (
    input: Omit<AssignedTask, 'id' | 'createdAt' | 'completedAt' | 'status'> & { status?: AssignedTaskStatus },
  ) => AdvisorWorkspace
  onOpenAssign?: (teamId?: string) => void
}

export default function TeamAssignPanel({
  workshop,
  workspace,
  currentUser,
  teamFilter,
  looseTickets,
  assignTask,
  onOpenAssign,
}: Props) {
  const teams = workspace.teams
  const [teamId, setTeamId] = useState(
    teamFilter !== TEAM_FILTER_ALL && teamFilter !== TEAM_FILTER_LOOSE ? teamFilter : teams[0]?.id ?? '',
  )
  const [assigneeId, setAssigneeId] = useState('')
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState(localTodayIso())
  const [ticketId, setTicketId] = useState('')
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (teamFilter !== TEAM_FILTER_ALL && teamFilter !== TEAM_FILTER_LOOSE) {
      setTeamId(teamFilter)
      setAssigneeId('')
    }
  }, [teamFilter])

  const team = teams.find((row) => row.id === teamId)
  const members = useMemo(
    () =>
      workspace.people.filter(
        (person) => !team || isPersonOnTeam(workspace, team, person.id, person.email),
      ),
    [workspace, team],
  )
  const memberIds = members.map((person) => person.id).join('|')
  const teamTickets = useMemo(
    () =>
      looseTickets.filter((item) =>
        teamId ? matchesTeamFilter(workspace, item, teamId, 'admin', currentUser.email) : true,
      ),
    [looseTickets, workspace, teamId, currentUser.email],
  )
  const linked = teamTickets.find((item) => item.idpeticion === ticketId) ?? null
  const typeId = team?.taskTypeIds[0] || workspace.taskTypes[0]?.id || ''

  useEffect(() => {
    const ids = memberIds.split('|').filter(Boolean)
    if (assigneeId && ids.includes(assigneeId)) return
    setAssigneeId(ids.length === 1 ? ids[0] : '')
  }, [teamId, memberIds, assigneeId])

  useEffect(() => {
    if (ticketId && !teamTickets.some((item) => item.idpeticion === ticketId)) {
      setTicketId('')
    }
  }, [teamId, ticketId, teamTickets])

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const assignee = personById(workspace, assigneeId)
    if (!assignee || !title.trim() || !typeId || !dueDate) return
    assignTask({
      title: title.trim(),
      notes: linked ? `Ticket ${linked.tipopeticion || ''}`.trim() : '',
      taskTypeId: typeId,
      boardId: team?.boardIds[0] ?? null,
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
        /* la tarea ya está; el ticket se puede pasar a mano */
      }
    }
    setNotice(
      linked
        ? `Tarea y ticket asignados a ${assignee.name}${team ? ` · ${team.name}` : ''}.`
        : `Tarea asignada a ${assignee.name}${team ? ` · ${team.name}` : ''}.`,
    )
    setTitle('')
    setTicketId('')
  }

  if (teams.length === 0) return null

  const canSubmit = Boolean(title.trim() && assigneeId && typeId && dueDate && members.length > 0)

  return (
    <Card className="dash-assign-panel" padding="sm">
      <form className="dash-assign-form" onSubmit={(event) => void onSubmit(event)}>
        <div className="dash-assign-head">
          <h2 className="ops-card-title">Asignar a un equipo</h2>
          {onOpenAssign ? (
            <button type="button" className="ghost-button" onClick={() => onOpenAssign(teamId)}>
              Más opciones
            </button>
          ) : null}
        </div>

        <div className="dash-assign-grid">
          <label className="field-label" htmlFor="dash-assign-team">
            Equipo
            <select
              id="dash-assign-team"
              className="field-select"
              value={teamId}
              onChange={(event) => {
                setTeamId(event.target.value)
                setAssigneeId('')
                setNotice(null)
              }}
            >
              {teams.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label" htmlFor="dash-assign-asesor">
            Asesor
            <select
              id="dash-assign-asesor"
              className="field-select"
              value={assigneeId}
              onChange={(event) => setAssigneeId(event.target.value)}
              required
            >
              <option value="">
                {members.length === 0 ? 'Sin asesores' : 'Elige un asesor'}
              </option>
              {members.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label dash-assign-ticket" htmlFor="dash-assign-ticket">
            Ticket suelto
            <select
              id="dash-assign-ticket"
              className="field-select"
              value={ticketId}
              onChange={(event) => {
                const next = event.target.value
                setTicketId(next)
                const item = teamTickets.find((row) => row.idpeticion === next)
                if (item && !title.trim()) {
                  setTitle(item.descripcion || item.tipopeticion || 'Seguimiento de consulta')
                }
              }}
            >
              <option value="">
                {teamTickets.length === 0 ? 'Ninguno en este equipo' : `Ninguno · ${teamTickets.length} sueltos`}
              </option>
              {teamTickets.map((item) => (
                <option key={item.idpeticion} value={item.idpeticion}>
                  {ticketClientLabel(item)} · {item.tipopeticion || 'Sin tipo'} · {formatFecha(item.fechainicio)}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label" htmlFor="dash-assign-due">
            Para el día
            <input
              id="dash-assign-due"
              className="field-input"
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              required
            />
          </label>
          <label className="field-label dash-assign-task" htmlFor="dash-assign-title">
            Qué hay que hacer
            <input
              id="dash-assign-title"
              className="field-input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Llamar, confirmar cita…"
              required
            />
          </label>
          <button type="submit" className="client-submit dash-assign-submit" disabled={!canSubmit}>
            <UserPlus size={16} aria-hidden />
            Asignar
          </button>
        </div>

        {members.length === 0 ? (
          <p className="section-subtitle">Marca asesores en Equipos para este grupo.</p>
        ) : null}
        {linked ? (
          <p className="dash-assign-preview">
            {ticketClientLabel(linked)}
            {linked.tipopeticion ? ` · ${linked.tipopeticion}` : ''}
            {ticketClientPhone(linked) ? ` · ${ticketClientPhone(linked)}` : ''}
          </p>
        ) : null}
        {notice ? <p className="dash-assign-notice">{notice}</p> : null}
      </form>
    </Card>
  )
}

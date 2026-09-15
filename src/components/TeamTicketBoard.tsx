import { useMemo, useState } from 'react'
import { Sparkles } from 'lucide-react'
import {
  isPersonOnTeam,
  isPersonPendingDelete,
  type AdvisorTeam,
  type AdvisorWorkspace,
} from '../lib/advisorWorkspace'
import { matchesTeamFilter } from '../lib/teamScope'
import { planRandomTeamAssign, teamRepartirHint } from '../lib/ticketOwnerSuggest'
import { reassignTicketOwner } from '../lib/ticketOps'
import type { PeticionPendiente } from '../lib/peticionesPendientes'
import type { Workshop } from '../types'
import TeamTicketCard from './TeamTicketCard'

type Props = {
  workshop: Workshop
  workspace: AdvisorWorkspace
  currentUser: { name: string; email: string }
  team: AdvisorTeam
  tickets: PeticionPendiente[]
  readOnly?: boolean
  onAssignTeam: (peticionId: string, teamId: string | null) => void
}

export default function TeamTicketBoard({
  workshop,
  workspace,
  currentUser,
  team,
  tickets,
  readOnly = false,
  onAssignTeam,
}: Props) {
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const inTeam = useMemo(
    () => tickets.filter((item) => matchesTeamFilter(workspace, item, team.id, 'admin', currentUser.email)),
    [tickets, workspace, team.id, currentUser.email],
  )
  const members = workspace.people.filter(
    (person) => !isPersonPendingDelete(person) && isPersonOnTeam(workspace, team, person.id, person.email),
  )

  const onAutoAssign = async () => {
    if (inTeam.length === 0 || members.length === 0) return
    setBusy(true)
    setError(null)
    setNotice(null)
    const planned = planRandomTeamAssign(members, inTeam)
    let done = 0
    const failed: string[] = []
    for (const row of planned) {
      try {
        await reassignTicketOwner(workshop, workspace, currentUser, 'admin', row.ticket, row.person.email)
        onAssignTeam(row.ticket.idpeticion, team.id)
        done += 1
      } catch {
        failed.push(row.ticket.tipopeticion || row.ticket.idpeticion)
      }
    }
    if (failed.length) setError(`No se pudieron repartir ${failed.length}.`)
    if (done === 0) setError('No hay un asesor claro para estos tickets. Mete gente en el equipo.')
    else setNotice(`${done === 1 ? '1 ticket' : `${done} tickets`} repartidos al azar.`)
    setBusy(false)
  }

  return (
    <div className="team-ticket-board">
      <div className="team-ticket-board-head">
        <div>
          <h3 className="teams-guide-block-title">Tickets de hoy</h3>
          <p className="section-subtitle">
            {inTeam.length === 0
              ? 'Este equipo no tiene tickets de hoy. En Equipos, suelta una tarjeta aquí.'
              : inTeam.length === 1
                ? '1 ticket de hoy en este equipo.'
                : `${inTeam.length} tickets de hoy en este equipo.`}
          </p>
        </div>
        {readOnly ? null : (
          <button
            type="button"
            className="client-submit"
            disabled={busy || inTeam.length === 0 || members.length === 0}
            onClick={() => void onAutoAssign()}
          >
            <Sparkles size={16} aria-hidden />
            {busy ? 'Repartiendo…' : 'Repartir ahora'}
          </button>
        )}
      </div>
      {readOnly ? null : (
        <p className="section-subtitle">
          {teamRepartirHint(inTeam.length, members.length, false)}
        </p>
      )}
      {notice ? <p className="dash-assign-notice">{notice}</p> : null}
      {error ? <p className="ticket-owner-error">{error}</p> : null}

      {inTeam.length > 0 ? (
        <div className="team-ticket-grid">
          {inTeam.map((item) => (
            <TeamTicketCard
              key={item.idpeticion}
              item={item}
              workshop={workshop}
              workspace={workspace}
              currentUser={currentUser}
              tickets={tickets}
              readOnly={readOnly}
              showTeamPicker={!readOnly}
              onAssignTeam={onAssignTeam}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

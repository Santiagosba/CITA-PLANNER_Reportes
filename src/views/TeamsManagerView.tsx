import { useMemo, useState, type FormEvent } from 'react'
import { Plus, Trash2, Users } from 'lucide-react'
import Card from '../components/ui/Card'
import {
  catalogName,
  normalizeEmail,
  personByEmail,
  personById,
  teamForPerson,
  type AdvisorTeam,
} from '../lib/advisorWorkspace'
import { useAdvisorWorkspace } from '../hooks/useAdvisorWorkspace'
import type { Workshop } from '../types'

type Props = {
  workshop: Workshop
  currentUser: { name: string; email: string }
  readOnly?: boolean
}

export default function TeamsManagerView({ workshop, currentUser, readOnly = false }: Props) {
  const workshopId = workshop.containerIdTaller || workshop.id
  const { workspace, addTeam, updateTeam, deleteTeam, addAdvisor, addTaskType, addBoard } =
    useAdvisorWorkspace(workshopId, currentUser, readOnly)
  const myTeamId = useMemo(() => {
    const me = personByEmail(workspace, currentUser.email)
    return me ? teamForPerson(workspace, me.id)?.id ?? null : null
  }, [workspace, currentUser.email])
  const [selectedId, setSelectedId] = useState<string | null>(myTeamId ?? workspace.teams[0]?.id ?? null)
  const [teamName, setTeamName] = useState('')
  const [personName, setPersonName] = useState('')
  const [personEmail, setPersonEmail] = useState('')
  const [typeName, setTypeName] = useState('')
  const [boardName, setBoardName] = useState('')

  const selected = useMemo<AdvisorTeam | undefined>(
    () => workspace.teams.find((team) => team.id === selectedId) ?? workspace.teams[0],
    [selectedId, workspace.teams],
  )

  const onCreateTeam = (event: FormEvent) => {
    event.preventDefault()
    addTeam(teamName)
    setTeamName('')
  }

  const onAddAdvisor = (event: FormEvent) => {
    event.preventDefault()
    addAdvisor(personName, personEmail)
    setPersonName('')
    setPersonEmail('')
  }

  const toggleMember = (personId: string) => {
    if (!selected) return
    const memberIds = selected.memberIds.includes(personId)
      ? selected.memberIds.filter((id) => id !== personId)
      : [...selected.memberIds, personId]
    updateTeam(selected.id, { memberIds })
  }

  const toggleType = (typeId: string) => {
    if (!selected) return
    const taskTypeIds = selected.taskTypeIds.includes(typeId)
      ? selected.taskTypeIds.filter((id) => id !== typeId)
      : [...selected.taskTypeIds, typeId]
    updateTeam(selected.id, { taskTypeIds })
  }

  const toggleBoard = (boardId: string) => {
    if (!selected) return
    const boardIds = selected.boardIds.includes(boardId)
      ? selected.boardIds.filter((id) => id !== boardId)
      : [...selected.boardIds, boardId]
    updateTeam(selected.id, { boardIds })
  }

  return (
    <div className="dashboard-page role-desk">
      <div className="role-desk-grid">
        <Card className="role-desk-col">
          <p className="section-eyebrow">Taller</p>
          <h2 className="ops-card-title">{readOnly ? 'Equipos del taller' : 'Equipos de asesores'}</h2>
          <p className="section-subtitle">
            {readOnly
              ? 'Tu grupo y el resto de compañeros. Solo puedes consultarlos.'
              : 'Crea equipos y elige quién entra en cada uno.'}
          </p>

          <ul className="role-list">
            {workspace.teams.map((team) => (
              <li key={team.id}>
                <button
                  type="button"
                  className={`list-row ${selected?.id === team.id ? 'is-active' : ''}`}
                  onClick={() => setSelectedId(team.id)}
                >
                  <span className="list-row-title">{team.name}</span>
                  <span className="list-row-meta">
                    {team.memberIds.length} asesores · {team.taskTypeIds.length} tipos · {team.boardIds.length} tableros
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {readOnly ? null : (
          <form className="role-inline-form" onSubmit={onCreateTeam}>
            <label className="field-label" htmlFor="new-team-name">
              Nuevo equipo
            </label>
            <input
              id="new-team-name"
              className="field-input"
              value={teamName}
              onChange={(event) => setTeamName(event.target.value)}
              placeholder="Comercial, Triage…"
            />
            <button type="submit" className="client-submit" disabled={!teamName.trim()}>
              <Plus size={16} aria-hidden />
              Crear equipo
            </button>
          </form>
          )}
        </Card>

        <Card className="role-desk-col">
          {selected ? (
            <>
              <div className="role-desk-heading">
                <div>
                  <p className="section-eyebrow">Equipo</p>
                  <h2 className="ops-card-title">{selected.name}</h2>
                </div>
                {readOnly ? (
                  selected.id === myTeamId ? (
                    <span className="badge tone-positive">Tu grupo</span>
                  ) : (
                    <span className="badge tone-muted">Otro grupo</span>
                  )
                ) : (
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => {
                      deleteTeam(selected.id)
                      setSelectedId(workspace.teams.find((team) => team.id !== selected.id)?.id ?? null)
                    }}
                  >
                    <Trash2 size={16} aria-hidden />
                    Borrar
                  </button>
                )}
              </div>

              {readOnly ? null : (
                <>
                  <label className="field-label" htmlFor="team-name">
                    Nombre
                  </label>
                  <input
                    id="team-name"
                    className="field-input"
                    value={selected.name}
                    onChange={(event) => updateTeam(selected.id, { name: event.target.value })}
                  />
                </>
              )}

              <h3 className="role-subhead">Asesores del equipo</h3>
              {readOnly ? (
                <ul className="role-list">
                  {selected.memberIds.map((memberId) => {
                    const person = personById(workspace, memberId)
                    if (!person) return null
                    const isMe = normalizeEmail(person.email) === normalizeEmail(currentUser.email)
                    return (
                      <li key={person.id} className="role-task-row glass glass-lite">
                        <div>
                          <p className="list-row-title">{person.name}</p>
                          <p className="list-row-meta">{person.email}</p>
                        </div>
                        {isMe ? <span className="badge tone-positive">Tú</span> : null}
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <ul className="role-check-list">
                  {workspace.people.map((person) => (
                    <li key={person.id}>
                      <label className="role-check">
                        <input
                          type="checkbox"
                          checked={selected.memberIds.includes(person.id)}
                          onChange={() => toggleMember(person.id)}
                        />
                        <span>
                          <strong>{person.name}</strong>
                          <small>{person.email}</small>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}

              <h3 className="role-subhead">Tipos de tarea</h3>
              {readOnly ? (
                <p className="section-subtitle">
                  {selected.taskTypeIds.map((id) => catalogName(workspace.taskTypes, id)).join(', ') || 'Ningún tipo'}
                </p>
              ) : (
                <ul className="role-check-list">
                  {workspace.taskTypes.map((item) => (
                    <li key={item.id}>
                      <label className="role-check">
                        <input
                          type="checkbox"
                          checked={selected.taskTypeIds.includes(item.id)}
                          onChange={() => toggleType(item.id)}
                        />
                        <span>{item.name}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}

              <h3 className="role-subhead">Tableros</h3>
              {readOnly ? (
                <p className="section-subtitle">
                  {selected.boardIds.map((id) => catalogName(workspace.boards, id)).join(', ') || 'Ningún tablero'}
                </p>
              ) : (
                <ul className="role-check-list">
                  {workspace.boards.map((item) => (
                    <li key={item.id}>
                      <label className="role-check">
                        <input
                          type="checkbox"
                          checked={selected.boardIds.includes(item.id)}
                          onChange={() => toggleBoard(item.id)}
                        />
                        <span>{item.name}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="section-subtitle">
              {readOnly ? 'Todavía no hay equipos en este taller.' : 'Crea un equipo para empezar.'}
            </p>
          )}
        </Card>

        <Card className="role-desk-col">
          <p className="section-eyebrow">{readOnly ? 'Taller' : 'Plantilla'}</p>
          <h2 className="ops-card-title">{readOnly ? 'Compañeros' : 'Asesores y catálogo'}</h2>
          <p className="section-subtitle">
            {readOnly
              ? 'Toda la gente del taller, también de otros grupos.'
              : 'Añade gente y nuevos tipos o tableros para todos los equipos.'}
          </p>

          {readOnly ? (
            <ul className="role-list">
              {workspace.people.map((person) => {
                const isMe = normalizeEmail(person.email) === normalizeEmail(currentUser.email)
                const team = teamForPerson(workspace, person.id)
                return (
                  <li key={person.id} className="role-task-row glass glass-lite">
                    <div>
                      <p className="list-row-title">{person.name}</p>
                      <p className="list-row-meta">
                        {person.email}
                        {team ? ` · ${team.name}` : ''}
                      </p>
                    </div>
                    {isMe ? <span className="badge tone-positive">Tú</span> : null}
                  </li>
                )
              })}
            </ul>
          ) : null}

          {readOnly ? null : (
          <>
          <form className="role-stack-form" onSubmit={onAddAdvisor}>
            <label className="field-label" htmlFor="advisor-name">
              Nuevo asesor
            </label>
            <input
              id="advisor-name"
              className="field-input"
              value={personName}
              onChange={(event) => setPersonName(event.target.value)}
              placeholder="Nombre"
            />
            <input
              className="field-input"
              type="email"
              value={personEmail}
              onChange={(event) => setPersonEmail(event.target.value)}
              placeholder="correo@taller.es"
            />
            <button type="submit" className="ghost-button" disabled={!personName.trim() || !personEmail.trim()}>
              <Users size={16} aria-hidden />
              Añadir asesor
            </button>
          </form>

          <form
            className="role-inline-form"
            onSubmit={(event) => {
              event.preventDefault()
              addTaskType(typeName)
              setTypeName('')
            }}
          >
            <label className="field-label" htmlFor="new-type">
              Nuevo tipo de tarea
            </label>
            <input
              id="new-type"
              className="field-input"
              value={typeName}
              onChange={(event) => setTypeName(event.target.value)}
              placeholder="Presupuesto, recambio…"
            />
            <button type="submit" className="ghost-button" disabled={!typeName.trim()}>
              Añadir tipo
            </button>
          </form>

          <form
            className="role-inline-form"
            onSubmit={(event) => {
              event.preventDefault()
              addBoard(boardName)
              setBoardName('')
            }}
          >
            <label className="field-label" htmlFor="new-board">
              Nuevo tablero
            </label>
            <input
              id="new-board"
              className="field-input"
              value={boardName}
              onChange={(event) => setBoardName(event.target.value)}
              placeholder="Express, flotas…"
            />
            <button type="submit" className="ghost-button" disabled={!boardName.trim()}>
              Añadir tablero
            </button>
          </form>

          {selected ? (
            <p className="list-row-meta">
              Este equipo usa {selected.taskTypeIds.map((id) => catalogName(workspace.taskTypes, id)).join(', ') || 'ningún tipo'}.
            </p>
          ) : null}
          </>
          )}
        </Card>
      </div>
    </div>
  )
}

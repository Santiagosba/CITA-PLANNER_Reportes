import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Eye, EyeOff, Plus, Trash2, Users } from 'lucide-react'
import ApiStatusBanner from '../components/ApiStatusBanner'
import ActionButton, { type ActionStatus } from '../components/ui/ActionButton'
import Card from '../components/ui/Card'
import { HexLoaderScreen } from '../components/ui/HexLoader'
import { MIN_ACCOUNT_PASSWORD, passwordError, updateAccountPassword } from '../lib/accountPasswords'
import {
  catalogName,
  normalizeEmail,
  personByEmail,
  personById,
  teamForPerson,
  teamNamesForPerson,
  teamsForPerson,
  type AdvisorTeam,
} from '../lib/advisorWorkspace'
import { useAdvisorWorkspace } from '../hooks/useAdvisorWorkspace'
import { isLocalPreviewWorkshop } from '../lib/localPreview'
import type { Workshop } from '../types'

type Props = {
  workshop: Workshop
  currentUser: { name: string; email: string }
  readOnly?: boolean
}

export default function TeamsManagerView({ workshop, currentUser, readOnly = false }: Props) {
  const workshopId = workshop.containerIdTaller || workshop.id
  const { workspace, loading, persistError, addTeam, updateTeam, deleteTeam, addAdvisor, toggleAdvisorTeam, addTaskType, addBoard } =
    useAdvisorWorkspace(workshopId, currentUser, true)
  const localPreview = isLocalPreviewWorkshop(workshop)
  const myTeamId = useMemo(() => {
    const me = personByEmail(workspace, currentUser.email)
    return me ? teamForPerson(workspace, me.id)?.id ?? null : null
  }, [workspace, currentUser.email])
  const [selectedId, setSelectedId] = useState<string | null>(myTeamId ?? workspace.teams[0]?.id ?? null)
  const [teamName, setTeamName] = useState('')
  const [nameDraft, setNameDraft] = useState('')
  const [personName, setPersonName] = useState('')
  const [personEmail, setPersonEmail] = useState('')
  const [personPassword, setPersonPassword] = useState('')
  const [personConfirm, setPersonConfirm] = useState('')
  const [personTeamId, setPersonTeamId] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [createStatus, setCreateStatus] = useState<ActionStatus>('idle')
  const [createError, setCreateError] = useState<string | null>(null)
  const [typeName, setTypeName] = useState('')
  const [boardName, setBoardName] = useState('')
  const [notice, setNotice] = useState<string | null>(null)

  const listedTeams = useMemo(() => {
    if (!readOnly) return workspace.teams
    const me = personByEmail(workspace, currentUser.email)
    if (!me) return []
    return teamsForPerson(workspace, me.id)
  }, [readOnly, workspace, currentUser.email])

  const selected = useMemo<AdvisorTeam | undefined>(
    () => listedTeams.find((team) => team.id === selectedId) ?? listedTeams[0],
    [selectedId, listedTeams],
  )

  useEffect(() => {
    if (selectedId && listedTeams.some((team) => team.id === selectedId)) return
    setSelectedId(myTeamId ?? listedTeams[0]?.id ?? null)
  }, [listedTeams, selectedId, myTeamId])

  useEffect(() => {
    setNameDraft(selected?.name ?? '')
  }, [selected?.id, selected?.name])

  useEffect(() => {
    setPersonTeamId(selected?.id ?? workspace.teams[0]?.id ?? '')
  }, [selected?.id, workspace.teams])

  const onCreateTeam = (event: FormEvent) => {
    event.preventDefault()
    const id = addTeam(teamName)
    if (id) {
      setSelectedId(id)
      setNotice(`Equipo «${teamName.trim()}» creado.`)
    }
    setTeamName('')
  }

  const resetCreateForm = () => {
    setPersonName('')
    setPersonEmail('')
    setPersonPassword('')
    setPersonConfirm('')
    setShowPassword(false)
  }

  const onAddAdvisor = async (event: FormEvent) => {
    event.preventDefault()
    const name = personName.trim()
    const email = normalizeEmail(personEmail)
    const teamId = personTeamId || selected?.id || null
    const team = workspace.teams.find((row) => row.id === teamId)
    if (!name || !email.includes('@')) {
      setCreateError('Escribe el nombre y un correo válido.')
      return
    }
    if (!localPreview) {
      const invalid = passwordError(personPassword, personConfirm)
      if (invalid) {
        setCreateError(invalid)
        return
      }
    }

    setCreateStatus('loading')
    setCreateError(null)
    addAdvisor(name, email, teamId)
    if (teamId) setSelectedId(teamId)

    if (localPreview) {
      setCreateStatus('success')
      setNotice(`${name} ya está en ${team?.name || 'el taller'}. En local no se crea cuenta de entrada.`)
      resetCreateForm()
      return
    }

    try {
      await updateAccountPassword(email, personPassword)
      setCreateStatus('success')
      setNotice(`${name} ya está en ${team?.name || 'el taller'}. Puede entrar con ese correo y contraseña.`)
      resetCreateForm()
    } catch (error) {
      setCreateStatus('idle')
      setCreateError(error instanceof Error ? error.message : 'No se pudo crear la cuenta de entrada.')
      setNotice(`${name} ya está en el equipo. Ponle la contraseña en Contraseñas.`)
    }
  }

  const saveTeamName = () => {
    if (!selected) return
    const next = nameDraft.trim()
    if (!next || next === selected.name) return
    updateTeam(selected.id, { name: next })
  }

  const toggleMember = (personId: string) => {
    if (!selected) return
    toggleAdvisorTeam(personId, selected.id)
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

  const onDeleteTeam = () => {
    if (!selected) return
    if (workspace.teams.length <= 1) {
      setNotice('Deja al menos un equipo en el taller.')
      return
    }
    if (!window.confirm(`¿Borrar el equipo «${selected.name}»? Las tareas se quedan, pero sin este grupo.`)) return
    const fallback = workspace.teams.find((team) => team.id !== selected.id)?.id ?? null
    deleteTeam(selected.id)
    setSelectedId(fallback)
  }

  if (loading && workspace.teams.length === 0) {
    return (
      <div className="dashboard-page role-desk">
        <HexLoaderScreen size="md" label="Cargando equipos…" />
      </div>
    )
  }

  return (
    <div className="dashboard-page role-desk">
      {persistError ? (
        <ApiStatusBanner
          message="No se ha podido guardar en el taller. Los cambios quedan en este navegador."
          variant="warning"
        />
      ) : null}

      <div className="role-desk-grid">
        <Card className="role-desk-col">
          <p className="section-eyebrow">Taller</p>
          <h2 className="ops-card-title">{readOnly ? 'Equipos del taller' : 'Equipos de asesores'}</h2>
          <p className="section-subtitle">
            {readOnly
              ? 'Tu grupo y el resto de compañeros. Solo puedes consultarlos.'
              : 'Crea equipos y marca quién entra en cada uno. Una persona puede estar en varios. Los tipos y tableros son los de sus grupos.'}
          </p>

            {listedTeams.length === 0 ? (
            <p className="section-subtitle">
              {readOnly ? 'Aún no estás en ningún equipo.' : 'Todavía no hay equipos.'}
            </p>
          ) : (
            <ul className="role-list">
              {listedTeams.map((team) => (
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
          )}

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
                  <button type="button" className="ghost-button" onClick={onDeleteTeam}>
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
                    value={nameDraft}
                    onChange={(event) => setNameDraft(event.target.value)}
                    onBlur={saveTeamName}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        saveTeamName()
                      }
                    }}
                  />
                </>
              )}

              <h3 className="role-subhead">Asesores del equipo</h3>
              {readOnly ? (
                <ul className="role-list">
                  {selected.memberIds.length === 0 ? (
                    <li className="section-subtitle">Este equipo no tiene asesores.</li>
                  ) : null}
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
              ) : workspace.people.length === 0 ? (
                <p className="section-subtitle">Crea un asesor a la derecha para poder marcarlo aquí.</p>
              ) : (
                <ul className="role-check-list">
                  {workspace.people.map((person) => {
                    const here = selected.memberIds.includes(person.id)
                    const names = teamNamesForPerson(workspace, person.id)
                    return (
                      <li key={person.id}>
                        <label className="role-check">
                          <input
                            type="checkbox"
                            checked={here}
                            onChange={() => toggleMember(person.id)}
                          />
                          <span>
                            <strong>{person.name}</strong>
                            <small>
                              {person.email}
                              {names ? ` · ${names}` : ' · Sin equipo'}
                            </small>
                          </span>
                        </label>
                      </li>
                    )
                  })}
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
          <p className="section-eyebrow">{readOnly ? 'Taller' : 'Cuentas'}</p>
          <h2 className="ops-card-title">{readOnly ? 'Compañeros' : 'Crear asesor'}</h2>
          <p className="section-subtitle">
            {readOnly
              ? 'Toda la gente del taller, también de otros grupos.'
              : 'Nombre, correo, contraseña y un equipo de entrada. Luego puedes marcarle más grupos.'}
          </p>

          {readOnly ? (
            <ul className="role-list">
              {workspace.people
                .filter((person) => listedTeams.some((team) => team.memberIds.includes(person.id)))
                .map((person) => {
                const isMe = normalizeEmail(person.email) === normalizeEmail(currentUser.email)
                const names = teamNamesForPerson(workspace, person.id)
                return (
                  <li key={person.id} className="role-task-row glass glass-lite">
                    <div>
                      <p className="list-row-title">{person.name}</p>
                      <p className="list-row-meta">
                        {person.email}
                        {names ? ` · ${names}` : ''}
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
              <form className="role-stack-form" onSubmit={(event) => void onAddAdvisor(event)}>
                <label className="field-label" htmlFor="advisor-name">
                  Nombre
                </label>
                <input
                  id="advisor-name"
                  className="field-input"
                  value={personName}
                  onChange={(event) => {
                    setPersonName(event.target.value)
                    setCreateError(null)
                    setCreateStatus('idle')
                  }}
                  placeholder="Marta Gil"
                  autoComplete="name"
                />
                <label className="field-label" htmlFor="advisor-email">
                  Correo
                </label>
                <input
                  id="advisor-email"
                  className="field-input"
                  type="email"
                  value={personEmail}
                  onChange={(event) => {
                    setPersonEmail(event.target.value)
                    setCreateError(null)
                    setCreateStatus('idle')
                  }}
                  placeholder="marta@taller.es"
                  autoComplete="off"
                />
                {localPreview ? (
                  <p className="list-row-meta">En la prueba local no hace falta contraseña.</p>
                ) : (
                  <>
                    <label className="field-label" htmlFor="advisor-password">
                      Contraseña
                    </label>
                    <div className="relative">
                      <input
                        id="advisor-password"
                        className="field-input pr-14"
                        type={showPassword ? 'text' : 'password'}
                        value={personPassword}
                        onChange={(event) => {
                          setPersonPassword(event.target.value)
                          setCreateError(null)
                        }}
                        minLength={MIN_ACCOUNT_PASSWORD}
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        className="ghost-button absolute right-1 top-1/2 min-h-0 -translate-y-1/2 border-0 bg-transparent px-2 py-2"
                        aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                        onClick={() => setShowPassword((current) => !current)}
                      >
                        {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                      </button>
                    </div>
                    <label className="field-label" htmlFor="advisor-confirm">
                      Repite la contraseña
                    </label>
                    <input
                      id="advisor-confirm"
                      className="field-input"
                      type={showPassword ? 'text' : 'password'}
                      value={personConfirm}
                      onChange={(event) => {
                        setPersonConfirm(event.target.value)
                        setCreateError(null)
                      }}
                      minLength={MIN_ACCOUNT_PASSWORD}
                      autoComplete="new-password"
                    />
                  </>
                )}
                <label className="field-label" htmlFor="advisor-team">
                  Equipo
                </label>
                <select
                  id="advisor-team"
                  className="field-input"
                  value={personTeamId}
                  onChange={(event) => setPersonTeamId(event.target.value)}
                >
                  {workspace.teams.length === 0 ? <option value="">Sin equipo todavía</option> : null}
                  {workspace.teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
                {createError ? (
                  <p className="alert alert-error" role="alert">
                    {createError}
                  </p>
                ) : null}
                <ActionButton
                  type="submit"
                  status={createStatus}
                  successLabel="Creado"
                  disabled={!personName.trim() || !personEmail.trim()}
                >
                  <Users size={16} aria-hidden />
                  Crear asesor
                </ActionButton>
              </form>

              <h3 className="role-subhead">Tipos y tableros</h3>
              <form
                className="role-inline-form"
                onSubmit={(event) => {
                  event.preventDefault()
                  addTaskType(typeName)
                  setTypeName('')
                  setNotice('Tipo de tarea añadido a todos los equipos.')
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
                  setNotice('Tablero añadido a todos los equipos.')
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

              {notice ? <p className="section-subtitle">{notice}</p> : null}
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

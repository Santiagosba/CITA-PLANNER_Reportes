import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ArrowLeft, ChevronRight, Eye, EyeOff, KeyRound, Plus, RotateCcw, Search, Trash2, Users } from 'lucide-react'
import AccountPasswordFields, { type AccountPasswordForm } from '../components/AccountPasswordFields'
import ApiStatusBanner from '../components/ApiStatusBanner'
import ActionButton, { type ActionStatus } from '../components/ui/ActionButton'
import Card from '../components/ui/Card'
import { HexLoaderScreen } from '../components/ui/HexLoader'
import {
  MIN_ACCOUNT_PASSWORD,
  deleteTallerAccount,
  passwordError,
  restoreTallerAccount,
  revokeTallerAccount,
  scheduleTallerAccountDelete,
  updateAccountPassword,
  updateAccountRole,
  updateOwnPassword,
  type TallerAccountRole,
} from '../lib/accountPasswords'
import { isDemoAccountEmail, isSuperAdminEmail } from '../lib/crmAccess'
import { getCrmHubWebIdFromEnv } from '../lib/hubWebEnv'
import {
  catalogName,
  daysUntilPurge,
  isPersonOnTeam,
  isPersonPendingDelete,
  isPersonPurgeDue,
  normalizeEmail,
  personByEmail,
  personMatchesQuery,
  teamForPerson,
  teamNamesForPerson,
  teamsForPerson,
  type AdvisorPerson,
  type AdvisorTeam,
  type AdvisorWorkspace,
} from '../lib/advisorWorkspace'
import { useAdvisorWorkspace } from '../hooks/useAdvisorWorkspace'
import { isLocalPreviewWorkshop } from '../lib/localPreview'
import type { Workshop } from '../types'

type Screen = 'list' | 'team' | 'create-team' | 'create-person' | 'password' | 'person'
type ListTab = 'gente' | 'equipos'

const emptyPasswordForm = (): AccountPasswordForm => ({
  current: '',
  next: '',
  confirm: '',
  show: false,
})

type Props = {
  workshop: Workshop
  currentUser: { name: string; email: string }
  readOnly?: boolean
  canCreateTallerAdmin?: boolean
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
}

function peopleOnTeam(workspace: AdvisorWorkspace, team: AdvisorTeam): AdvisorPerson[] {
  return workspace.people.filter(
    (person) => !isPersonPendingDelete(person) && isPersonOnTeam(workspace, team, person.id, person.email),
  )
}

function purgeLabel(person: AdvisorPerson): string {
  const days = daysUntilPurge(person)
  if (days == null) return 'Pendiente de borrar'
  if (days <= 0) return 'Se borra hoy'
  if (days === 1) return 'Se borra mañana'
  return `Se borra en ${days} días`
}

function peopleCountLabel(count: number): string {
  if (count === 0) return 'Nadie todavía'
  if (count === 1) return '1 persona'
  return `${count} personas`
}

function accountRoleLabel(person: AdvisorPerson): string {
  if (isSuperAdminEmail(person.email)) return 'Super admin'
  return person.role === 'taller_admin' ? 'Admin' : 'Asesor'
}

function roleBadgeTone(person: AdvisorPerson): 'tone-info' | 'tone-neutral' | 'tone-warning' {
  if (isPersonPendingDelete(person)) return 'tone-warning'
  if (isSuperAdminEmail(person.email) || person.role === 'taller_admin') return 'tone-info'
  return 'tone-neutral'
}

function firstNames(people: AdvisorPerson[], max = 3): string {
  const names = people.map((person) => person.name.split(/\s+/)[0] || person.name)
  if (names.length === 0) return 'Pulsa para ver o meter gente'
  if (names.length <= max) return names.join(', ')
  return `${names.slice(0, max).join(', ')} y ${names.length - max} más`
}

function workshopAccountIds(workshop: Workshop): { idtaller: string; crmIdtaller: string; hubWebId: string | null } {
  const container = String(workshop.containerIdTaller || workshop.originalId || '').trim()
  const operational = String(workshop.originalId || container).trim()
  return {
    idtaller: container,
    crmIdtaller: operational,
    hubWebId: workshop.hubWebId || getCrmHubWebIdFromEnv(),
  }
}

export default function TeamsManagerView({
  workshop,
  currentUser,
  readOnly = false,
  canCreateTallerAdmin = false,
}: Props) {
  const workshopId = workshop.containerIdTaller || workshop.id
  const {
    workspace,
    loading,
    persistError,
    addTeam,
    updateTeam,
    deleteTeam,
    addAdvisor,
    setAdvisorRole,
    scheduleAdvisorDelete,
    restoreAdvisor,
    removeAdvisor,
    toggleAdvisorTeam,
    addTaskType,
    addBoard,
  } = useAdvisorWorkspace(workshopId, currentUser, true)
  const localPreview = isLocalPreviewWorkshop(workshop)
  const myTeamId = useMemo(() => {
    const me = personByEmail(workspace, currentUser.email)
    return me ? teamForPerson(workspace, me.id)?.id ?? null : null
  }, [workspace, currentUser.email])

  const [screen, setScreen] = useState<Screen>('list')
  const [listTab, setListTab] = useState<ListTab>('gente')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null)
  const [personReturn, setPersonReturn] = useState<'list' | 'team'>('list')
  const [teamName, setTeamName] = useState('')
  const [nameDraft, setNameDraft] = useState('')
  const [personName, setPersonName] = useState('')
  const [personEmail, setPersonEmail] = useState('')
  const [personRole, setPersonRole] = useState<TallerAccountRole>('asesor')
  const [personPassword, setPersonPassword] = useState('')
  const [personConfirm, setPersonConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [createStatus, setCreateStatus] = useState<ActionStatus>('idle')
  const [createError, setCreateError] = useState<string | null>(null)
  const [typeName, setTypeName] = useState('')
  const [boardName, setBoardName] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [peopleQuery, setPeopleQuery] = useState('')
  const [accountAction, setAccountAction] = useState<{
    personId: string
    kind: 'revoke' | 'delete' | 'restore' | 'role-admin' | 'role-asesor'
  } | null>(null)
  const [accountStatus, setAccountStatus] = useState<ActionStatus>('idle')
  const [accountError, setAccountError] = useState<string | null>(null)
  const [passwordPersonId, setPasswordPersonId] = useState<string | 'self' | null>(null)
  const [passwordForm, setPasswordForm] = useState<AccountPasswordForm>(emptyPasswordForm)
  const [passwordStatus, setPasswordStatus] = useState<ActionStatus>('idle')
  const [passwordErrorText, setPasswordErrorText] = useState<string | null>(null)

  const listedTeams = useMemo(() => {
    if (!readOnly) return workspace.teams
    const me = personByEmail(workspace, currentUser.email)
    if (!me) return []
    return teamsForPerson(workspace, me.id)
  }, [readOnly, workspace, currentUser.email])

  const selected = useMemo<AdvisorTeam | undefined>(
    () => listedTeams.find((team) => team.id === selectedId),
    [selectedId, listedTeams],
  )

  const selectedPerson = useMemo(
    () => workspace.people.find((person) => person.id === selectedPersonId) ?? null,
    [workspace.people, selectedPersonId],
  )

  const members = useMemo(() => (selected ? peopleOnTeam(workspace, selected) : []), [selected, workspace])
  const outsiders = useMemo(() => {
    if (!selected) return []
    return workspace.people.filter(
      (person) => !isPersonPendingDelete(person) && !isPersonOnTeam(workspace, selected, person.id, person.email),
    )
  }, [selected, workspace])

  const nameDirty = Boolean(selected && nameDraft.trim() && nameDraft.trim() !== selected.name)

  const canManageAccounts = canCreateTallerAdmin || isSuperAdminEmail(currentUser.email)

  const visiblePeople = useMemo(() => {
    const active = workspace.people.filter((person) => !isPersonPendingDelete(person))
    return active.filter((person) => personMatchesQuery(person, peopleQuery))
  }, [workspace.people, peopleQuery])

  const pendingPeople = useMemo(() => {
    const pending = workspace.people.filter((person) => isPersonPendingDelete(person))
    return pending.filter((person) => personMatchesQuery(person, peopleQuery))
  }, [workspace.people, peopleQuery])

  useEffect(() => {
    if (readOnly || loading) return
    const due = workspace.people.filter((person) => isPersonPurgeDue(person))
    if (due.length === 0) return
    let cancelled = false
    const account = workshopAccountIds(workshop)
    void (async () => {
      for (const person of due) {
        try {
          if (!localPreview && !isDemoAccountEmail(person.email)) {
            await deleteTallerAccount(person.email, account.idtaller)
          }
          if (!cancelled) removeAdvisor(person.id)
        } catch {
          /* se reintenta al volver a abrir Cuentas */
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loading, localPreview, readOnly, removeAdvisor, workshop, workspace.people])

  useEffect(() => {
    if (screen !== 'team') return
    if (selected) return
    setScreen('list')
    setSelectedId(null)
  }, [screen, selected])

  useEffect(() => {
    if (screen !== 'person') return
    if (selectedPerson) return
    setScreen(personReturn === 'team' && selected ? 'team' : 'list')
    setSelectedPersonId(null)
  }, [screen, selectedPerson, personReturn, selected])

  useEffect(() => {
    setNameDraft(selected?.name ?? '')
    setMoreOpen(false)
    setConfirmDelete(false)
    setAccountAction(null)
    setAccountError(null)
    setAccountStatus('idle')
  }, [selected?.id, selected?.name])

  const openTeam = (teamId: string, name?: string) => {
    const team = workspace.teams.find((row) => row.id === teamId)
    setSelectedId(teamId)
    setNameDraft(name?.trim() || team?.name || '')
    setScreen('team')
    setNotice(null)
  }

  const openPerson = (personId: string, from: 'list' | 'team' = 'list') => {
    setSelectedPersonId(personId)
    setPersonReturn(from)
    setAccountAction(null)
    setAccountError(null)
    setAccountStatus('idle')
    setScreen('person')
    setNotice(null)
  }

  const backToList = () => {
    setScreen('list')
    setNotice(null)
    setConfirmDelete(false)
    setMoreOpen(false)
    setSelectedPersonId(null)
  }

  const backFromPerson = () => {
    setAccountAction(null)
    setAccountError(null)
    setSelectedPersonId(null)
    setScreen(personReturn === 'team' && selected ? 'team' : 'list')
    setNotice(null)
  }

  const backToTeam = () => {
    setScreen(selected ? 'team' : 'list')
    setCreateError(null)
    setCreateStatus('idle')
  }

  const openCreatePerson = () => {
    resetCreateForm()
    setCreateError(null)
    setCreateStatus('idle')
    setScreen('create-person')
    setNotice(null)
  }

  const openPassword = (personId: string | 'self') => {
    setPasswordPersonId(personId)
    setPasswordForm(emptyPasswordForm())
    setPasswordStatus('idle')
    setPasswordErrorText(null)
    setScreen('password')
    setNotice(null)
  }

  const passwordPerson =
    passwordPersonId && passwordPersonId !== 'self'
      ? workspace.people.find((person) => person.id === passwordPersonId) ?? null
      : null

  const onSavePassword = async (event: FormEvent) => {
    event.preventDefault()
    const invalid = passwordError(passwordForm.next, passwordForm.confirm)
    if (invalid) {
      setPasswordErrorText(invalid)
      return
    }
    const isSelf = passwordPersonId === 'self' || !passwordPerson
    if (isSelf && !passwordForm.current.trim()) {
      setPasswordErrorText('Escribe tu contraseña actual.')
      return
    }
    if (localPreview) {
      setPasswordErrorText('En la prueba local no hay cuentas reales. Entra con tu correo para cambiar contraseñas.')
      return
    }

    setPasswordStatus('loading')
    setPasswordErrorText(null)
    try {
      if (isSelf) {
        await updateOwnPassword(passwordForm.current, passwordForm.next)
        setNotice('Ya está. Tu contraseña se ha cambiado.')
      } else if (passwordPerson) {
        const account = workshopAccountIds(workshop)
        await updateAccountPassword(passwordPerson.email, passwordForm.next, {
          name: passwordPerson.name,
          idtaller: account.idtaller,
          crmIdtaller: account.crmIdtaller,
          hubWebId: account.hubWebId,
          ...(passwordPerson.role ? { role: passwordPerson.role } : {}),
        })
        setNotice(`Ya está. Dile a ${passwordPerson.name} la nueva contraseña.`)
      }
      setPasswordStatus('success')
      setPasswordForm(emptyPasswordForm())
      setPasswordPersonId(null)
      setScreen(selectedPersonId ? 'person' : 'list')
    } catch (error) {
      setPasswordStatus('idle')
      setPasswordErrorText(error instanceof Error ? error.message : 'No se pudo cambiar la contraseña.')
    }
  }

  const onCreateTeam = (event: FormEvent) => {
    event.preventDefault()
    const name = teamName.trim()
    const id = addTeam(name)
    if (!id) return
    setTeamName('')
    setNotice(`Equipo «${name}» creado. Ahora mete a la gente.`)
    openTeam(id, name)
  }

  const resetCreateForm = () => {
    setPersonName('')
    setPersonEmail('')
    setPersonRole('asesor')
    setPersonPassword('')
    setPersonConfirm('')
    setShowPassword(false)
  }

  const onAddAdvisor = async (event: FormEvent) => {
    event.preventDefault()
    const name = personName.trim()
    const email = normalizeEmail(personEmail)
    const teamId = selected?.id ?? null
    if (!name || !email.includes('@')) {
      setCreateError('Escribe el nombre y un correo con @.')
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

    if (localPreview) {
      addAdvisor(name, email, teamId, canManageAccounts ? personRole : 'asesor')
      if (teamId) setSelectedId(teamId)
      setCreateStatus('success')
      setNotice(`${name} ya está en ${selected?.name || 'el taller'}. En local no se crea cuenta de entrada.`)
      resetCreateForm()
      setScreen(selected ? 'team' : 'list')
      return
    }

    try {
      const account = workshopAccountIds(workshop)
      if (!account.idtaller || account.idtaller === 'local-preview') {
        throw new Error('Este taller no tiene un identificador real. Elige el taller (por ejemplo Supra Gamboa) e inténtalo otra vez.')
      }
      const role = canManageAccounts ? personRole : 'asesor'
      await updateAccountPassword(email, personPassword, {
        name,
        idtaller: account.idtaller,
        crmIdtaller: account.crmIdtaller,
        role,
        hubWebId: account.hubWebId,
      })
      addAdvisor(name, email, teamId, role)
      if (teamId) setSelectedId(teamId)
      setCreateStatus('success')
      const roleLine =
        role === 'taller_admin'
          ? `${name} tiene cuenta de admin de este taller.`
          : `${name} tiene cuenta de asesor.`
      setNotice(`${roleLine} Puede entrar con ese correo y contraseña.`)
      resetCreateForm()
      setScreen(selected ? 'team' : 'list')
    } catch (error) {
      setCreateStatus('idle')
      setCreateError(error instanceof Error ? error.message : 'No se pudo crear la cuenta de entrada.')
    }
  }

  const saveTeamName = () => {
    if (!selected || !nameDirty) return
    updateTeam(selected.id, { name: nameDraft.trim() })
    setNotice(`El equipo ahora se llama «${nameDraft.trim()}».`)
  }

  const toggleMember = (person: AdvisorPerson) => {
    if (!selected) return
    const here = isPersonOnTeam(workspace, selected, person.id, person.email)
    toggleAdvisorTeam(person.id, selected.id)
    setNotice(
      here ? `${person.name} ya no está en ${selected.name}.` : `${person.name} ya está en ${selected.name}.`,
    )
  }

  const togglePersonTeam = (person: AdvisorPerson, team: AdvisorTeam) => {
    const here = isPersonOnTeam(workspace, team, person.id, person.email)
    toggleAdvisorTeam(person.id, team.id)
    setNotice(here ? `${person.name} ya no está en ${team.name}.` : `${person.name} ya está en ${team.name}.`)
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

  const onAccountAction = async (
    person: AdvisorPerson,
    kind: 'revoke' | 'delete' | 'restore' | 'role-admin' | 'role-asesor',
  ) => {
    if (normalizeEmail(person.email) === normalizeEmail(currentUser.email)) {
      setAccountError('No puedes quitarte el rol o borrarte a ti mismo.')
      return
    }
    if (isSuperAdminEmail(person.email)) {
      setAccountError('Esa cuenta es de super admin. No se toca.')
      return
    }
    if ((kind === 'role-admin' || kind === 'role-asesor') && !canManageAccounts) {
      setAccountError('Solo el super admin puede dar o quitar el rol de admin.')
      return
    }

    setAccountStatus('loading')
    setAccountError(null)
    const account = workshopAccountIds(workshop)
    const skipRemoteLock = localPreview || isDemoAccountEmail(person.email)
    try {
      if (kind === 'role-admin' || kind === 'role-asesor') {
        const role = kind === 'role-admin' ? 'taller_admin' : 'asesor'
        if (!localPreview) {
          await updateAccountRole(person.email, role, {
            name: person.name,
            idtaller: account.idtaller,
            crmIdtaller: account.crmIdtaller,
          })
        }
        setAdvisorRole(person.id, role)
        setAccountAction(null)
        setAccountStatus('idle')
        setNotice(
          role === 'taller_admin'
            ? `${person.name} ahora es admin de este taller.`
            : `${person.name} ahora es asesor. Ya no ve la vista de admin.`,
        )
        return
      }
      if (kind === 'restore') {
        if (!skipRemoteLock) {
          await restoreTallerAccount(person.email, {
            idtaller: account.idtaller,
            crmIdtaller: account.crmIdtaller,
          })
        }
        restoreAdvisor(person.id)
        setAccountAction(null)
        setAccountStatus('idle')
        setNotice(`${person.name} ya puede entrar otra vez.`)
        return
      }
      if (kind === 'delete') {
        if (!skipRemoteLock) {
          await scheduleTallerAccountDelete(person.email, {
            idtaller: account.idtaller,
            crmIdtaller: account.crmIdtaller,
          })
        }
        scheduleAdvisorDelete(person.id)
        setAccountAction(null)
        setAccountStatus('idle')
        setNotice(`${person.name} no puede entrar. Tienes 15 días para restaurar la cuenta.`)
        return
      }
      if (!localPreview) {
        await revokeTallerAccount(person.email, account.idtaller, account.crmIdtaller)
      }
      removeAdvisor(person.id)
      setAccountAction(null)
      setAccountStatus('idle')
      setSelectedPersonId(null)
      setScreen(personReturn === 'team' && selected ? 'team' : 'list')
      setNotice(`${person.name} ya no está en este taller. No puede entrar aquí.`)
    } catch (error) {
      setAccountStatus('idle')
      setAccountError(error instanceof Error ? error.message : 'No se ha podido completar.')
    }
  }

  const onDeleteTeam = () => {
    if (!selected) return
    const name = selected.name
    const fallback = workspace.teams.find((team) => team.id !== selected.id)?.id ?? null
    deleteTeam(selected.id)
    setSelectedId(fallback)
    setScreen('list')
    setListTab('equipos')
    setConfirmDelete(false)
    setNotice(`Equipo «${name}» borrado.`)
  }

  const renderPersonRow = (person: AdvisorPerson, opts?: { from?: 'list' | 'team'; extra?: string }) => {
    const isMe = normalizeEmail(person.email) === normalizeEmail(currentUser.email)
    const waitingDelete = isPersonPendingDelete(person)
    const names = teamNamesForPerson(workspace, person.id)
    return (
      <li key={person.id}>
        <button
          type="button"
          className={`teams-guide-pick-card teams-guide-person-row${waitingDelete ? ' is-pending' : ''}`}
          onClick={() => openPerson(person.id, opts?.from ?? 'list')}
        >
          <span className={`teams-guide-avatar${waitingDelete ? ' is-muted' : ''}`} aria-hidden>
            {initials(person.name)}
          </span>
          <span className="teams-guide-person-copy">
            <strong>
              {person.name}
              {isMe ? ' · Tú' : ''}
            </strong>
            <small>{opts?.extra || person.email}</small>
          </span>
          <span className={`badge ${roleBadgeTone(person)}`}>
            {waitingDelete ? purgeLabel(person) : accountRoleLabel(person)}
          </span>
          {!waitingDelete && names ? (
            <span className="badge tone-neutral teams-guide-team-chip">{names}</span>
          ) : null}
          <ChevronRight size={22} aria-hidden className="teams-guide-chevron" />
        </button>
      </li>
    )
  }

  const renderFichaActions = (person: AdvisorPerson) => {
    const isMe = normalizeEmail(person.email) === normalizeEmail(currentUser.email)
    if (readOnly) return null
    if (!isMe && isSuperAdminEmail(person.email)) {
      return <p className="section-subtitle">Esta cuenta es de super admin. Aquí no se cambia.</p>
    }
    const pending = accountAction?.personId === person.id ? accountAction.kind : null
    const waitingDelete = isPersonPendingDelete(person)
    const canDelete = !isMe && !waitingDelete
    const canRestore = !isMe && waitingDelete
    const canRevoke = !isMe && !waitingDelete
    const canChangeRole = canManageAccounts && !isMe && !isSuperAdminEmail(person.email) && !waitingDelete
    const isAdminRole = person.role === 'taller_admin'
    const pendingCopy =
      pending === 'delete'
        ? `¿Borrar a ${person.name}? No podrá entrar. Tienes 15 días para restaurarla.`
        : pending === 'restore'
          ? `¿Restaurar a ${person.name}? Volverá a poder entrar.`
          : pending === 'revoke'
            ? `¿Sacar a ${person.name} de este taller? Ya no podrá entrar aquí.`
            : pending === 'role-admin'
              ? `¿Dar a ${person.name} el rol de admin? Verá la vista de admin.`
              : pending === 'role-asesor'
                ? `¿Dejar a ${person.name} como asesor? Ya no verá la vista de admin.`
                : ''
    const pendingConfirm =
      pending === 'delete'
        ? 'Sí, borrar en 15 días'
        : pending === 'restore'
          ? 'Sí, restaurar'
          : pending === 'revoke'
            ? 'Sí, sacar del taller'
            : pending === 'role-admin'
              ? 'Sí, dar admin'
              : pending === 'role-asesor'
                ? 'Sí, dejar como asesor'
                : ''

    if (pending) {
      return (
        <div className="teams-guide-ficha-block">
          <p className="section-subtitle">{pendingCopy}</p>
          <div className="teams-guide-person-account-row">
            <button
              type="button"
              className={`client-submit${pending === 'delete' || pending === 'revoke' ? ' teams-guide-danger-btn' : ''}`}
              disabled={accountStatus === 'loading'}
              onClick={() => void onAccountAction(person, pending)}
            >
              {accountStatus === 'loading' ? 'Un momento…' : pendingConfirm}
            </button>
            <button
              type="button"
              className="ghost-button"
              disabled={accountStatus === 'loading'}
              onClick={() => {
                setAccountAction(null)
                setAccountError(null)
              }}
            >
              No, dejarlo
            </button>
          </div>
          {accountError ? (
            <p className="alert alert-error" role="alert">
              {accountError}
            </p>
          ) : null}
        </div>
      )
    }

    return (
      <div className="teams-guide-ficha-actions">
        {canRestore ? (
          <button
            type="button"
            className="client-submit"
            onClick={() => {
              setAccountAction({ personId: person.id, kind: 'restore' })
              setAccountError(null)
            }}
          >
            <RotateCcw size={18} aria-hidden />
            Restaurar usuario
          </button>
        ) : null}

        {waitingDelete ? null : (
          <button type="button" className="ghost-button" onClick={() => openPassword(isMe ? 'self' : person.id)}>
            <KeyRound size={18} aria-hidden />
            {isMe ? 'Cambiar mi contraseña' : 'Cambiar contraseña'}
          </button>
        )}

        {canChangeRole ? (
          <div className="teams-guide-ficha-block">
            <p className="field-label">Rol en este taller</p>
            <div className="teams-guide-person-account-row">
              <button
                type="button"
                className={`ghost-button${isAdminRole ? '' : ' is-selected-role'}`}
                disabled={!isAdminRole}
                onClick={() => {
                  setAccountAction({ personId: person.id, kind: 'role-asesor' })
                  setAccountError(null)
                }}
              >
                Asesor
              </button>
              <button
                type="button"
                className={`ghost-button${isAdminRole ? ' is-selected-role' : ''}`}
                disabled={isAdminRole}
                onClick={() => {
                  setAccountAction({ personId: person.id, kind: 'role-admin' })
                  setAccountError(null)
                }}
              >
                Admin
              </button>
            </div>
            <p className="section-subtitle">
              {isAdminRole ? 'Ahora es admin. Pulsa Asesor para quitárselo.' : 'Ahora es asesor. Pulsa Admin para dárselo.'}
            </p>
          </div>
        ) : null}

        {!waitingDelete && workspace.teams.length > 0 ? (
          <div className="teams-guide-ficha-block">
            <p className="field-label">Equipos</p>
            <ul className="teams-guide-chips">
              {workspace.teams.map((team) => {
                const on = isPersonOnTeam(workspace, team, person.id, person.email)
                return (
                  <li key={team.id}>
                    <button
                      type="button"
                      className={`teams-guide-chip ${on ? 'is-on' : ''}`}
                      onClick={() => togglePersonTeam(person, team)}
                    >
                      <strong>{team.name}</strong>
                      <small>{on ? 'Está aquí' : 'Meter'}</small>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ) : null}

        {canRevoke || canDelete ? (
          <div className="teams-guide-ficha-block teams-guide-danger">
            <p className="field-label">Quitar o borrar</p>
            <div className="teams-guide-person-account-row">
              {canRevoke ? (
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    setAccountAction({ personId: person.id, kind: 'revoke' })
                    setAccountError(null)
                  }}
                >
                  Sacar del taller
                </button>
              ) : null}
              {canDelete ? (
                <button
                  type="button"
                  className="client-submit teams-guide-danger-btn"
                  onClick={() => {
                    setAccountAction({ personId: person.id, kind: 'delete' })
                    setAccountError(null)
                  }}
                >
                  <Trash2 size={18} aria-hidden />
                  Borrar en 15 días
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    )
  }

  if (loading && workspace.teams.length === 0 && workspace.people.length === 0) {
    return (
      <div className="dashboard-page role-desk">
        <HexLoaderScreen size="md" label={readOnly ? 'Cargando equipos…' : 'Cargando cuentas…'} />
      </div>
    )
  }

  return (
    <div className="dashboard-page role-desk teams-guide">
      {persistError ? (
        <ApiStatusBanner
          message="No se ha podido guardar en el taller. Los cambios quedan en este navegador."
          variant="warning"
        />
      ) : null}

      {notice ? (
        <p className="teams-guide-notice" role="status">
          {notice}
        </p>
      ) : null}

      {screen === 'list' ? (
        <Card className="teams-guide-panel" padding="lg">
          {readOnly ? (
            <>
              <h2 className="ops-card-title">Tus equipos</h2>
              <p className="section-subtitle">Pulsa un grupo para ver quién está dentro. Aquí no se cambia nada.</p>
            </>
          ) : (
            <>
              <div className="nav-segment teams-guide-tabs" role="tablist" aria-label="Cuentas">
                <button
                  type="button"
                  role="tab"
                  aria-selected={listTab === 'gente'}
                  className={`nav-segment-btn${listTab === 'gente' ? ' is-active' : ''}`}
                  onClick={() => setListTab('gente')}
                >
                  Gente
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={listTab === 'equipos'}
                  className={`nav-segment-btn${listTab === 'equipos' ? ' is-active' : ''}`}
                  onClick={() => setListTab('equipos')}
                >
                  Equipos
                </button>
              </div>

              {listTab === 'gente' ? (
                <>
                  <div className="teams-guide-toolbar">
                    <div className="view-page-search-field teams-guide-search">
                      <Search size={20} aria-hidden className="view-page-search-icon" />
                      <input
                        id="people-search"
                        className="view-page-search-input"
                        type="search"
                        value={peopleQuery}
                        onChange={(event) => setPeopleQuery(event.target.value)}
                        placeholder="Buscar por nombre, correo o rol"
                        autoComplete="off"
                        aria-label="Buscar persona"
                      />
                    </div>
                    <button type="button" className="client-submit" onClick={openCreatePerson}>
                      <Users size={18} aria-hidden />
                      Crear cuenta
                    </button>
                  </div>

                  {workspace.people.length === 0 ? (
                    <p className="section-subtitle">Aún no hay cuentas. Crea la primera.</p>
                  ) : visiblePeople.length === 0 && pendingPeople.length === 0 ? (
                    <p className="section-subtitle">Nadie coincide con «{peopleQuery.trim()}».</p>
                  ) : (
                    <ul className="teams-guide-people">{visiblePeople.map((person) => renderPersonRow(person))}</ul>
                  )}

                  {pendingPeople.length > 0 ? (
                    <div className="teams-guide-block">
                      <h3 className="teams-guide-block-title">Pendiente de borrar</h3>
                      <p className="section-subtitle">No pueden entrar. Ábrela y pulsa Restaurar si te arrepientes.</p>
                      <ul className="teams-guide-people">
                        {pendingPeople.map((person) =>
                          renderPersonRow(person, { extra: `${person.email} · ${purgeLabel(person)}` }),
                        )}
                      </ul>
                    </div>
                  ) : null}
                </>
              ) : null}
            </>
          )}

          {readOnly || listTab === 'equipos' ? (
            <div className="teams-guide-block">
              {readOnly ? null : (
                <p className="section-subtitle">Agrupa a la gente. Una persona puede estar en varios equipos.</p>
              )}
              {listedTeams.length === 0 ? (
                <p className="section-subtitle">
                  {readOnly ? 'Aún no estás en ningún equipo.' : 'Todavía no hay equipos.'}
                </p>
              ) : (
                <ul className="teams-guide-pick">
                  {listedTeams.map((team) => {
                    const people = peopleOnTeam(workspace, team)
                    const mine = team.id === myTeamId
                    return (
                      <li key={team.id}>
                        <button type="button" className="teams-guide-pick-card" onClick={() => openTeam(team.id)}>
                          <span className="teams-guide-avatar" aria-hidden>
                            {initials(team.name)}
                          </span>
                          <span className="teams-guide-pick-copy">
                            <strong>{team.name}</strong>
                            <small>
                              {peopleCountLabel(people.length)}
                              {people.length > 0 ? ` · ${firstNames(people)}` : ''}
                            </small>
                          </span>
                          {mine ? <span className="badge tone-positive">Tu grupo</span> : null}
                          <ChevronRight size={22} aria-hidden className="teams-guide-chevron" />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
              {readOnly ? null : (
                <form className="teams-guide-form teams-guide-inline-create" onSubmit={onCreateTeam}>
                  <label className="field-label" htmlFor="new-team-name">
                    Nuevo equipo
                  </label>
                  <div className="teams-guide-name-row">
                    <input
                      id="new-team-name"
                      className="field-input"
                      value={teamName}
                      onChange={(event) => setTeamName(event.target.value)}
                      placeholder="Por ejemplo: Recepción"
                    />
                    <button type="submit" className="client-submit" disabled={!teamName.trim()}>
                      <Plus size={18} aria-hidden />
                      Crear
                    </button>
                  </div>
                </form>
              )}
            </div>
          ) : null}
        </Card>
      ) : null}

      {screen === 'create-team' && !readOnly ? (
        <Card className="teams-guide-panel" padding="lg">
          <button type="button" className="ghost-button teams-guide-back" onClick={backToList}>
            <ArrowLeft size={18} aria-hidden />
            Volver
          </button>
          <h2 className="ops-card-title">Nuevo equipo</h2>
          <form className="teams-guide-form" onSubmit={onCreateTeam}>
            <label className="field-label" htmlFor="create-team-name">
              Nombre
            </label>
            <input
              id="create-team-name"
              className="field-input"
              value={teamName}
              onChange={(event) => setTeamName(event.target.value)}
              placeholder="Comercial, Recambios…"
              autoFocus
            />
            <button type="submit" className="client-submit" disabled={!teamName.trim()}>
              Crear y abrir
            </button>
          </form>
        </Card>
      ) : null}

      {screen === 'person' && selectedPerson ? (
        <Card className="teams-guide-panel" padding="lg">
          <button type="button" className="ghost-button teams-guide-back" onClick={backFromPerson}>
            <ArrowLeft size={18} aria-hidden />
            Volver
          </button>
          <div className="teams-guide-ficha-head">
            <span
              className={`teams-guide-avatar${isPersonPendingDelete(selectedPerson) ? ' is-muted' : ''}`}
              aria-hidden
            >
              {initials(selectedPerson.name)}
            </span>
            <div>
              <h2 className="ops-card-title">
                {selectedPerson.name}
                {normalizeEmail(selectedPerson.email) === normalizeEmail(currentUser.email) ? ' · Tú' : ''}
              </h2>
              <p className="section-subtitle">{selectedPerson.email}</p>
              <div className="teams-guide-person-account-row">
                <span className={`badge ${roleBadgeTone(selectedPerson)}`}>
                  {isPersonPendingDelete(selectedPerson) ? purgeLabel(selectedPerson) : accountRoleLabel(selectedPerson)}
                </span>
              </div>
            </div>
          </div>
          {renderFichaActions(selectedPerson)}
        </Card>
      ) : null}

      {screen === 'team' && selected ? (
        <Card className="teams-guide-panel" padding="lg">
          <button
            type="button"
            className="ghost-button teams-guide-back"
            onClick={() => {
              setListTab('equipos')
              backToList()
            }}
          >
            <ArrowLeft size={18} aria-hidden />
            Volver
          </button>
          <div className="teams-guide-title-row">
            <div>
              <h2 className="ops-card-title">{selected.name}</h2>
              <p className="section-subtitle">{peopleCountLabel(members.length)} en este equipo.</p>
            </div>
            {selected.id === myTeamId ? <span className="badge tone-positive">Tu grupo</span> : null}
          </div>

          {readOnly ? null : (
            <div className="teams-guide-block">
              <label className="field-label" htmlFor="team-name">
                Nombre del equipo
              </label>
              <div className="teams-guide-name-row">
                <input
                  id="team-name"
                  key={selected.id}
                  className="field-input"
                  value={nameDraft}
                  onChange={(event) => setNameDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      saveTeamName()
                    }
                  }}
                />
                <button type="button" className="client-submit" disabled={!nameDirty} onClick={saveTeamName}>
                  Guardar
                </button>
              </div>
            </div>
          )}

          <div className="teams-guide-block">
            <h3 className="teams-guide-block-title">Quién está aquí</h3>
            {members.length === 0 ? (
              <p className="section-subtitle">
                {readOnly ? 'Este equipo no tiene asesores.' : 'Todavía no hay nadie. Mete a alguien abajo.'}
              </p>
            ) : (
              <ul className="teams-guide-people">
                {members.map((person) => {
                  const isMe = normalizeEmail(person.email) === normalizeEmail(currentUser.email)
                  return (
                    <li key={person.id} className="teams-guide-person is-in">
                      <button
                        type="button"
                        className="teams-guide-person-open"
                        onClick={() => openPerson(person.id, 'team')}
                      >
                        <span className="teams-guide-avatar" aria-hidden>
                          {initials(person.name)}
                        </span>
                        <span className="teams-guide-person-copy">
                          <strong>
                            {person.name}
                            {isMe ? ' · Tú' : ''}
                          </strong>
                          <small>
                            {person.email}
                            {` · ${accountRoleLabel(person)}`}
                          </small>
                        </span>
                      </button>
                      {readOnly ? (
                        <span className="badge tone-positive">Está aquí</span>
                      ) : (
                        <button type="button" className="ghost-button" onClick={() => toggleMember(person)}>
                          Sacar
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {readOnly ? (
            <p className="list-row-meta">
              Este equipo usa{' '}
              {selected.taskTypeIds.map((id) => catalogName(workspace.taskTypes, id).trim()).join(', ') || 'ningún tipo'}
              {' · '}
              {selected.boardIds.map((id) => catalogName(workspace.boards, id).trim()).join(', ') || 'ningún tablero'}.
            </p>
          ) : (
            <>
              {outsiders.length > 0 ? (
                <div className="teams-guide-block">
                  <h3 className="teams-guide-block-title">Meter a alguien</h3>
                  <ul className="teams-guide-people">
                    {outsiders.map((person) => (
                      <li key={person.id} className="teams-guide-person">
                        <span className="teams-guide-avatar is-muted" aria-hidden>
                          {initials(person.name)}
                        </span>
                        <span className="teams-guide-person-copy">
                          <strong>{person.name}</strong>
                          <small>{person.email}</small>
                        </span>
                        <button type="button" className="client-submit" onClick={() => toggleMember(person)}>
                          Meter
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <button type="button" className="ghost-button teams-guide-secondary" onClick={openCreatePerson}>
                <Users size={18} aria-hidden />
                Crear cuenta y meterla aquí
              </button>

              <button
                type="button"
                className="ghost-button teams-guide-secondary"
                aria-expanded={moreOpen}
                onClick={() => setMoreOpen((open) => !open)}
              >
                {moreOpen ? 'Ocultar tipos y tableros' : 'Tipos, tableros y borrar equipo'}
              </button>

              {moreOpen ? (
                <div className="teams-guide-more">
                  <h3 className="teams-guide-block-title">Tipos de tarea</h3>
                  <ul className="teams-guide-chips">
                    {workspace.taskTypes.map((item) => {
                      const on = selected.taskTypeIds.includes(item.id)
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            className={`teams-guide-chip ${on ? 'is-on' : ''}`}
                            onClick={() => toggleType(item.id)}
                          >
                            <strong>{item.name}</strong>
                            <small>{on ? 'Lo usa' : 'No lo usa'}</small>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                  <form
                    className="teams-guide-form is-compact"
                    onSubmit={(event) => {
                      event.preventDefault()
                      const name = typeName.trim()
                      if (!name) return
                      addTaskType(name)
                      setTypeName('')
                      setNotice(`Tipo «${name}» añadido.`)
                    }}
                  >
                    <label className="field-label" htmlFor="new-type">
                      Nuevo tipo
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

                  <h3 className="teams-guide-block-title">Tableros</h3>
                  <ul className="teams-guide-chips">
                    {workspace.boards.map((item) => {
                      const on = selected.boardIds.includes(item.id)
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            className={`teams-guide-chip ${on ? 'is-on' : ''}`}
                            onClick={() => toggleBoard(item.id)}
                          >
                            <strong>{item.name}</strong>
                            <small>{on ? 'Lo usa' : 'No lo usa'}</small>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                  <form
                    className="teams-guide-form is-compact"
                    onSubmit={(event) => {
                      event.preventDefault()
                      const name = boardName.trim()
                      if (!name) return
                      addBoard(name)
                      setBoardName('')
                      setNotice(`Tablero «${name}» añadido.`)
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

                  <div className="teams-guide-danger">
                    <h3 className="teams-guide-block-title">Borrar este equipo</h3>
                    <p className="section-subtitle">Las tareas se quedan. Se pierde el grupo {selected.name}.</p>
                    {confirmDelete ? (
                      <div className="teams-guide-name-row">
                        <button type="button" className="client-submit teams-guide-danger-btn" onClick={onDeleteTeam}>
                          Sí, borrar {selected.name}
                        </button>
                        <button type="button" className="ghost-button" onClick={() => setConfirmDelete(false)}>
                          No, dejarlo
                        </button>
                      </div>
                    ) : (
                      <button type="button" className="ghost-button" onClick={() => setConfirmDelete(true)}>
                        Quiero borrar este equipo
                      </button>
                    )}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </Card>
      ) : null}

      {screen === 'create-person' && !readOnly ? (
        <Card className="teams-guide-panel" padding="lg">
          <button type="button" className="ghost-button teams-guide-back" onClick={backToTeam}>
            <ArrowLeft size={18} aria-hidden />
            Volver
          </button>
          <h2 className="ops-card-title">{selected ? `Nueva cuenta en ${selected.name}` : 'Nueva cuenta'}</h2>
          <p className="section-subtitle">
            {canManageAccounts
              ? 'Pon nombre, correo, rol y contraseña. Luego podrá entrar.'
              : 'Pon nombre, correo y contraseña. Entra como asesor de este taller.'}
          </p>

          <form className="teams-guide-form" onSubmit={(event) => void onAddAdvisor(event)}>
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
              autoFocus
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
            {canManageAccounts ? (
              <fieldset className="teams-guide-role">
                <legend className="field-label">Rol</legend>
                <label className={`teams-guide-role-option${personRole === 'asesor' ? ' is-selected' : ''}`}>
                  <input
                    type="radio"
                    name="advisor-role"
                    value="asesor"
                    checked={personRole === 'asesor'}
                    onChange={() => setPersonRole('asesor')}
                  />
                  <span>
                    <strong>Asesor</strong>
                    <span className="section-subtitle">Trabaja consultas. Solo ve este taller.</span>
                  </span>
                </label>
                <label className={`teams-guide-role-option${personRole === 'taller_admin' ? ' is-selected' : ''}`}>
                  <input
                    type="radio"
                    name="advisor-role"
                    value="taller_admin"
                    checked={personRole === 'taller_admin'}
                    onChange={() => setPersonRole('taller_admin')}
                  />
                  <span>
                    <strong>Admin</strong>
                    <span className="section-subtitle">Gestiona gente y equipos de este taller.</span>
                  </span>
                </label>
              </fieldset>
            ) : null}
            {localPreview ? (
              <p className="section-subtitle">En la prueba local no hace falta contraseña.</p>
            ) : (
              <>
                <label className="field-label" htmlFor="advisor-password">
                  Contraseña
                </label>
                <div className="teams-guide-password">
                  <input
                    id="advisor-password"
                    className="field-input"
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
                    className="ghost-button"
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    onClick={() => setShowPassword((current) => !current)}
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    {showPassword ? 'Ocultar' : 'Ver'}
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
            {createError ? (
              <p className="alert alert-error" role="alert">
                {createError}
              </p>
            ) : null}
            <ActionButton
              type="submit"
              status={createStatus}
              successLabel="Creada"
              disabled={!personName.trim() || !personEmail.trim() || (!localPreview && !personPassword)}
            >
              <Users size={18} aria-hidden />
              Crear cuenta
            </ActionButton>
          </form>
        </Card>
      ) : null}

      {screen === 'password' && !readOnly ? (
        <Card className="teams-guide-panel" padding="lg">
          <button
            type="button"
            className="ghost-button teams-guide-back"
            onClick={() => {
              setPasswordPersonId(null)
              setPasswordErrorText(null)
              setScreen(selectedPersonId ? 'person' : 'list')
            }}
          >
            <ArrowLeft size={18} aria-hidden />
            Volver
          </button>
          <h2 className="ops-card-title">
            {passwordPerson ? `Contraseña de ${passwordPerson.name}` : 'Tu contraseña'}
          </h2>
          <p className="section-subtitle">
            {passwordPerson
              ? `${passwordPerson.email}. Entra después con esta contraseña.`
              : `${currentUser.email}. Escribe la actual y la nueva.`}
          </p>
          <form className="teams-guide-form" onSubmit={(event) => void onSavePassword(event)}>
            <AccountPasswordFields
              id="account-password"
              form={passwordForm}
              needCurrent={!passwordPerson}
              onChange={(patch) => {
                setPasswordForm((current) => ({ ...current, ...patch }))
                setPasswordErrorText(null)
                setPasswordStatus('idle')
              }}
            />
            {passwordErrorText ? (
              <p className="alert alert-error" role="alert">
                {passwordErrorText}
              </p>
            ) : null}
            <ActionButton
              type="submit"
              status={passwordStatus}
              successLabel="Guardada"
              disabled={!passwordForm.next || !passwordForm.confirm}
            >
              <KeyRound size={18} aria-hidden />
              Guardar contraseña
            </ActionButton>
          </form>
        </Card>
      ) : null}
    </div>
  )
}

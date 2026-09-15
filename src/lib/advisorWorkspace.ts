/**
 * Equipos, tipos de tarea, tableros y asignaciones del taller.
 * Caché local + `operations.crm_advisor_workspace` para compartirlo entre admin y asesores.
 */

import { DEMO_ASESORES } from './demoAsesores'

export type AdvisorAccountRole = 'asesor' | 'taller_admin'

export type AdvisorPerson = {
  id: string
  name: string
  email: string
  role?: AdvisorAccountRole
  deletedAt?: string
  purgeAt?: string
}

export const ACCOUNT_PURGE_DAYS = 15

export function isPersonPendingDelete(person: Pick<AdvisorPerson, 'deletedAt'>): boolean {
  return Boolean(person.deletedAt)
}

export function isPersonPurgeDue(person: Pick<AdvisorPerson, 'purgeAt'>, now = Date.now()): boolean {
  if (!person.purgeAt) return false
  const at = Date.parse(person.purgeAt)
  return Number.isFinite(at) && at <= now
}

export function daysUntilPurge(person: Pick<AdvisorPerson, 'purgeAt'>, now = Date.now()): number | null {
  if (!person.purgeAt) return null
  const at = Date.parse(person.purgeAt)
  if (!Number.isFinite(at)) return null
  return Math.max(0, Math.ceil((at - now) / 86_400_000))
}

function foldText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

export function personMatchesQuery(person: AdvisorPerson, query: string): boolean {
  const needle = foldText(query.trim())
  if (!needle) return true
  const role = person.role === 'taller_admin' ? 'admin' : person.role === 'asesor' ? 'asesor' : ''
  return foldText(`${person.name} ${person.email} ${role}`).includes(needle)
}

export type AdvisorTeam = {
  id: string
  name: string
  memberIds: string[]
  taskTypeIds: string[]
  boardIds: string[]
}

export type CatalogItem = {
  id: string
  name: string
}

export type AssignedTaskStatus = 'pendiente' | 'hecho'

export type AssignedTask = {
  id: string
  title: string
  notes: string
  taskTypeId: string
  boardId: string | null
  teamId: string | null
  assigneeId: string
  dueDate: string
  createdAt: string
  completedAt: string | null
  createdByEmail: string
  status: AssignedTaskStatus
  peticionId: string | null
}

export type AdvisorWorkspace = {
  version: 1
  people: AdvisorPerson[]
  teams: AdvisorTeam[]
  taskTypes: CatalogItem[]
  boards: CatalogItem[]
  tasks: AssignedTask[]
  /** Ticket → equipo que el admin ha fijado. Si no está, se infiere. */
  ticketTeams: Record<string, string>
  /** Orden de tickets por columna (equipo o sueltos). */
  ticketOrder: Record<string, string[]>
}

/** Conserva acentos, eñes y diéresis. Solo recorta espacios. */
export function sanitizeTeamName(name: string): string {
  return String(name || '').replace(/\s+/g, ' ').trim()
}

export function ticketTeamsOf(workspace: Pick<AdvisorWorkspace, 'ticketTeams' | 'teams'>): Record<string, string> {
  const raw = workspace.ticketTeams && typeof workspace.ticketTeams === 'object' ? workspace.ticketTeams : {}
  const known = new Set(workspace.teams.map((team) => team.id))
  const next: Record<string, string> = {}
  for (const [peticionId, teamId] of Object.entries(raw)) {
    if (!peticionId || typeof teamId !== 'string' || !known.has(teamId)) continue
    next[peticionId] = teamId
  }
  return next
}

export function assignedTicketTeamId(
  workspace: Pick<AdvisorWorkspace, 'ticketTeams' | 'teams'>,
  peticionId: string | null | undefined,
): string | null {
  const id = String(peticionId || '').trim()
  if (!id) return null
  return ticketTeamsOf(workspace)[id] ?? null
}

export function setTicketTeam(
  workspace: AdvisorWorkspace,
  peticionId: string,
  teamId: string | null,
): AdvisorWorkspace {
  const id = String(peticionId || '').trim()
  if (!id) return workspace
  const current = ticketTeamsOf(workspace)
  const next = { ...current }
  if (!teamId || !workspace.teams.some((team) => team.id === teamId)) {
    if (!(id in next)) return { ...workspace, ticketTeams: current }
    delete next[id]
  } else if (next[id] === teamId) {
    return { ...workspace, ticketTeams: current }
  } else {
    next[id] = teamId
  }
  return { ...workspace, ticketTeams: next }
}

export function setTicketTeams(
  workspace: AdvisorWorkspace,
  peticionIds: string[],
  teamId: string | null,
): AdvisorWorkspace {
  return peticionIds.reduce((current, peticionId) => setTicketTeam(current, peticionId, teamId), workspace)
}

export const TICKET_ORDER_LOOSE = 'sueltos'

export function ticketOrderOf(workspace: Pick<AdvisorWorkspace, 'ticketOrder' | 'teams'>): Record<string, string[]> {
  const raw = workspace.ticketOrder && typeof workspace.ticketOrder === 'object' ? workspace.ticketOrder : {}
  const known = new Set(workspace.teams.map((team) => team.id))
  known.add(TICKET_ORDER_LOOSE)
  const next: Record<string, string[]> = {}
  for (const [key, ids] of Object.entries(raw)) {
    if (!known.has(key) || !Array.isArray(ids)) continue
    next[key] = ids.filter((id): id is string => typeof id === 'string' && Boolean(id.trim()))
  }
  return next
}

export function sortTicketsByOrder<T extends { idpeticion: string }>(tickets: T[], order?: string[]): T[] {
  if (!order?.length || tickets.length < 2) return tickets
  const rank = new Map(order.map((id, index) => [id, index]))
  return [...tickets].sort((a, b) => {
    const left = rank.get(a.idpeticion)
    const right = rank.get(b.idpeticion)
    if (left == null && right == null) return 0
    if (left == null) return 1
    if (right == null) return -1
    return left - right
  })
}

export function placeTicketInOrder(
  workspace: AdvisorWorkspace,
  peticionId: string,
  teamId: string | null,
  index: number,
  siblings: string[] = [],
): AdvisorWorkspace {
  const id = String(peticionId || '').trim()
  if (!id) return workspace
  const column =
    teamId && workspace.teams.some((team) => team.id === teamId) ? teamId : TICKET_ORDER_LOOSE
  const assigned = setTicketTeam(workspace, id, column === TICKET_ORDER_LOOSE ? null : column)
  const order = ticketOrderOf(assigned)
  const next: Record<string, string[]> = {}
  for (const [key, ids] of Object.entries(order)) {
    if (key === column) continue
    const kept = ids.filter((item) => item !== id)
    if (kept.length) next[key] = kept
  }
  const list = (siblings.length ? siblings : (order[column] ?? [])).filter((item) => item && item !== id)
  const at = Math.max(0, Math.min(Math.floor(index), list.length))
  list.splice(at, 0, id)
  next[column] = list
  return { ...assigned, ticketOrder: next }
}

const STORAGE_PREFIX = 'avi_advisor_workspace_v1:'
export const ADVISOR_WORKSPACE_CHANGED = 'avi-advisor-workspace-changed'

export const SHOWCASE_ADVISORS: AdvisorPerson[] = [
  { id: 'demo-asesor-marta', name: 'Marta Gil', email: 'marta.gil@taller.demo' },
  { id: 'demo-asesor-nuria', name: 'Nuria Beltrán', email: 'nuria.beltran@taller.demo' },
]

export const TEAM_RECEPCION_ID = 'team-recepcion'
export const TEAM_COMERCIAL_ID = 'team-comercial'

export function normalizeEmail(email: string): string {
  return String(email || '').trim().toLowerCase()
}

export function localTodayIso(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function newId(prefix: string): string {
  const rand = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())
  return `${prefix}-${rand}`
}

export function isExampleAssignedTask(task: Pick<AssignedTask, 'id' | 'peticionId'>): boolean {
  const id = String(task.id || '')
  const peticionId = String(task.peticionId || '')
  return id.startsWith('task-local-') || id.startsWith('demo-task-') || peticionId.startsWith('demo-ticket-')
}

export function keepExampleAssignedTasks(workshopId: string): boolean {
  return workshopId === 'local-preview'
}

function dropExampleTasks(workspace: AdvisorWorkspace): AdvisorWorkspace {
  const tasks = workspace.tasks.filter((task) => !isExampleAssignedTask(task))
  return tasks.length === workspace.tasks.length ? workspace : { ...workspace, tasks }
}

function exampleAssignedTasks(): AssignedTask[] {
  const today = localTodayIso()
  const createdAt = new Date().toISOString()
  return [
    {
      id: 'task-local-1',
      title: 'Llamar a Mariano: ruido al arrancar',
      notes: 'Ejemplo local. Entra como Ana para verla en Tareas.',
      taskTypeId: 'tt-llamada',
      boardId: 'mechanics',
      teamId: TEAM_RECEPCION_ID,
      assigneeId: 'demo-asesor-ana',
      dueDate: today,
      createdAt,
      completedAt: null,
      createdByEmail: 'santy@gmail.com',
      status: 'pendiente',
      peticionId: null,
    },
    {
      id: 'task-local-2',
      title: 'Confirmar cita de flota',
      notes: 'Del grupo: asignada a Luis.',
      taskTypeId: 'tt-cita',
      boardId: 'parts',
      teamId: TEAM_COMERCIAL_ID,
      assigneeId: 'demo-asesor-luis',
      dueDate: today,
      createdAt,
      completedAt: null,
      createdByEmail: 'santy@gmail.com',
      status: 'pendiente',
      peticionId: null,
    },
    {
      id: 'task-local-3',
      title: 'Peritaje Mapfre de Carmen',
      notes: 'De otra compañera, fuera del grupo de Ana.',
      taskTypeId: 'tt-peritaje',
      boardId: 'insurance',
      teamId: TEAM_RECEPCION_ID,
      assigneeId: 'demo-asesor-carmen',
      dueDate: today,
      createdAt,
      completedAt: null,
      createdByEmail: 'santy@gmail.com',
      status: 'pendiente',
      peticionId: null,
    },
    {
      id: 'task-local-4',
      title: 'WhatsApp sin dueño',
      notes: 'Nadie la ha cogido todavía.',
      taskTypeId: 'tt-whatsapp',
      boardId: null,
      teamId: TEAM_RECEPCION_ID,
      assigneeId: '',
      dueDate: today,
      createdAt,
      completedAt: null,
      createdByEmail: 'santy@gmail.com',
      status: 'pendiente',
      peticionId: null,
    },
    {
      id: 'task-local-5',
      title: 'WhatsApp de Marta: foto del testigo',
      notes: 'De Recepción. Entra como Marta para verla.',
      taskTypeId: 'tt-whatsapp',
      boardId: 'mechanics',
      teamId: TEAM_RECEPCION_ID,
      assigneeId: 'demo-asesor-marta',
      dueDate: today,
      createdAt,
      completedAt: null,
      createdByEmail: 'santy@gmail.com',
      status: 'pendiente',
      peticionId: null,
    },
    {
      id: 'task-local-6',
      title: 'Seguimiento comercial de Nuria',
      notes: 'De Comercial. Entra como Nuria para verla.',
      taskTypeId: 'tt-seguimiento',
      boardId: 'sales',
      teamId: TEAM_COMERCIAL_ID,
      assigneeId: 'demo-asesor-nuria',
      dueDate: today,
      createdAt,
      completedAt: null,
      createdByEmail: 'santy@gmail.com',
      status: 'pendiente',
      peticionId: null,
    },
  ]
}

function seedCatalog() {
  const taskTypes: CatalogItem[] = [
    { id: 'tt-llamada', name: 'Llamada' },
    { id: 'tt-cita', name: 'Cita' },
    { id: 'tt-seguimiento', name: 'Seguimiento' },
    { id: 'tt-peritaje', name: 'Peritaje' },
    { id: 'tt-whatsapp', name: 'WhatsApp' },
  ]
  const boards: CatalogItem[] = [
    { id: 'mechanics', name: 'Mecánica & Diagnosis' },
    { id: 'bodywork', name: 'Carrocería & Pintura' },
    { id: 'insurance', name: 'Peritaje de Seguros' },
    { id: 'parts', name: 'Recambios & Flotas' },
    { id: 'sales', name: 'Ventas VN / VO' },
  ]
  return { taskTypes, boards }
}

function seedPeople(): AdvisorPerson[] {
  const fromDemo = DEMO_ASESORES.map((asesor) => ({
    id: asesor.id,
    name: `${asesor.firstName} ${asesor.lastName}`.trim(),
    email: normalizeEmail(asesor.email),
  }))
  return [...fromDemo, ...SHOWCASE_ADVISORS]
}

function showcaseTeams(taskTypes: CatalogItem[], boards: CatalogItem[]): AdvisorTeam[] {
  const type = (id: string) => taskTypes.find((item) => item.id === id)?.id
  const board = (id: string) => boards.find((item) => item.id === id)?.id
  return [
    {
      id: TEAM_RECEPCION_ID,
      name: 'Recepción',
      memberIds: ['demo-asesor-ana', 'demo-asesor-carmen', 'demo-asesor-marta'],
      taskTypeIds: ['tt-llamada', 'tt-whatsapp', 'tt-peritaje'].map(type).filter(Boolean) as string[],
      boardIds: ['mechanics', 'bodywork', 'insurance'].map(board).filter(Boolean) as string[],
    },
    {
      id: TEAM_COMERCIAL_ID,
      name: 'Comercial',
      memberIds: ['demo-asesor-luis', 'demo-asesor-nuria'],
      taskTypeIds: ['tt-cita', 'tt-seguimiento'].map(type).filter(Boolean) as string[],
      boardIds: ['sales', 'parts'].map(board).filter(Boolean) as string[],
    },
  ]
}

export function seedAdvisorWorkspace(opts?: { examples?: boolean }): AdvisorWorkspace {
  const people = seedPeople()
  const { taskTypes, boards } = seedCatalog()
  return {
    version: 1,
    people,
    teams: showcaseTeams(taskTypes, boards),
    taskTypes,
    boards,
    tasks: opts?.examples ? exampleAssignedTasks() : [],
    ticketTeams: {},
    ticketOrder: {},
  }
}

/** Taller real: catálogo de tipos/tableros, sin gente ni equipos de demo. */
export function emptyAdvisorWorkspace(): AdvisorWorkspace {
  const { taskTypes, boards } = seedCatalog()
  return {
    version: 1,
    people: [],
    teams: [],
    taskTypes,
    boards,
    tasks: [],
    ticketTeams: {},
    ticketOrder: {},
  }
}

export function isShowcaseWorkspace(workspace: AdvisorWorkspace): boolean {
  const hasShowcaseTeam = workspace.teams.some(
    (team) => team.id === TEAM_RECEPCION_ID || team.id === TEAM_COMERCIAL_ID,
  )
  const hasDemoPerson = workspace.people.some((person) => String(person.id).startsWith('demo-asesor-'))
  return hasShowcaseTeam && hasDemoPerson
}

export function advisorWorkspaceStorageKey(workshopId: string): string {
  return `${STORAGE_PREFIX}${workshopId}`
}

function isWorkspace(value: unknown): value is AdvisorWorkspace {
  if (!value || typeof value !== 'object') return false
  const row = value as AdvisorWorkspace
  return (
    row.version === 1 &&
    Array.isArray(row.people) &&
    Array.isArray(row.teams) &&
    Array.isArray(row.taskTypes) &&
    Array.isArray(row.boards) &&
    Array.isArray(row.tasks)
  )
}

function ensureDemoPeople(workspace: AdvisorWorkspace): AdvisorWorkspace {
  let people = workspace.people
  const extras: AdvisorPerson[] = [
    ...DEMO_ASESORES.map((asesor) => ({
      id: asesor.id,
      name: `${asesor.firstName} ${asesor.lastName}`.trim(),
      email: normalizeEmail(asesor.email),
    })),
    ...SHOWCASE_ADVISORS,
  ]
  for (const advisor of extras) {
    const email = normalizeEmail(advisor.email)
    if (people.some((person) => normalizeEmail(person.email) === email || person.id === advisor.id)) continue
    people = [...people, advisor]
  }
  return people === workspace.people ? workspace : { ...workspace, people }
}

/** Añade Recepción y Comercial si faltan, sin borrar equipos que el admin ya haya creado. */
export function ensureShowcaseTeams(workspace: AdvisorWorkspace): AdvisorWorkspace {
  const withPeople = ensureDemoPeople(workspace)
  const catalog = seedCatalog()
  const wanted = showcaseTeams(
    withPeople.taskTypes.length ? withPeople.taskTypes : catalog.taskTypes,
    withPeople.boards.length ? withPeople.boards : catalog.boards,
  )
  const missing = wanted.filter((team) => !withPeople.teams.some((row) => row.id === team.id))
  let teams = withPeople.teams
  if (missing.length > 0) {
    const taken = new Set(missing.flatMap((team) => team.memberIds))
    teams = [
      ...teams.map((team) =>
        team.id === 'team-prueba'
          ? { ...team, memberIds: team.memberIds.filter((id) => !taken.has(id)) }
          : team,
      ),
      ...missing,
    ]
    teams = teams.filter((team) => team.id !== 'team-prueba' || team.memberIds.length > 0)
  }
  teams = teams.map((team) => {
    const seed = wanted.find((row) => row.id === team.id)
    if (!seed) return team
    const memberIds = team.memberIds.length ? team.memberIds : seed.memberIds
    const taskTypeIds = team.taskTypeIds.length ? team.taskTypeIds : seed.taskTypeIds
    const boardIds = team.boardIds.length ? team.boardIds : seed.boardIds
    if (memberIds === team.memberIds && taskTypeIds === team.taskTypeIds && boardIds === team.boardIds) {
      return team
    }
    return { ...team, memberIds, taskTypeIds, boardIds }
  })
  if (missing.length === 0 && withPeople === workspace && teams === withPeople.teams) {
    return reconcileTeamMembers(workspace)
  }
  return reconcileTeamMembers({ ...withPeople, teams })
}

/** Si el id del miembro ya no existe, lo apunta a la persona con el mismo correo. */
export function reconcileTeamMembers(workspace: AdvisorWorkspace): AdvisorWorkspace {
  const known = [
    ...DEMO_ASESORES.map((asesor) => ({
      id: asesor.id,
      email: normalizeEmail(asesor.email),
    })),
    ...SHOWCASE_ADVISORS.map((asesor) => ({
      id: asesor.id,
      email: normalizeEmail(asesor.email),
    })),
  ]
  const resolveId = (id: string): string => {
    if (personById(workspace, id)) return id
    const hint = known.find((row) => row.id === id)
    const live = hint ? personByEmail(workspace, hint.email) : undefined
    return live?.id ?? id
  }
  let changed = false
  const teams = workspace.teams.map((team) => {
    const memberIds = [...new Set(team.memberIds.map(resolveId))]
    if (memberIds.length !== team.memberIds.length || memberIds.some((id, index) => id !== team.memberIds[index])) {
      changed = true
    }
    return memberIds === team.memberIds ? team : { ...team, memberIds }
  })
  return changed ? { ...workspace, teams } : workspace
}

function ensureDefaultCatalog(workspace: AdvisorWorkspace): AdvisorWorkspace {
  if (workspace.taskTypes.length > 0 && workspace.boards.length > 0) return workspace
  const seed = emptyAdvisorWorkspace()
  return {
    ...workspace,
    taskTypes: workspace.taskTypes.length > 0 ? workspace.taskTypes : seed.taskTypes,
    boards: workspace.boards.length > 0 ? workspace.boards : seed.boards,
  }
}

function refreshDemoTaskDates(workspace: AdvisorWorkspace): AdvisorWorkspace {
  const today = localTodayIso()
  let changed = false
  const tasks = workspace.tasks.map((task) => {
    if (!task.id.startsWith('demo-task-') && !task.id.startsWith('task-local-')) return task
    if (task.status === 'pendiente' && task.dueDate < today) {
      changed = true
      return { ...task, dueDate: today }
    }
    return task
  })
  return changed ? { ...workspace, tasks } : workspace
}

function ensureTicketTeams(workspace: AdvisorWorkspace): AdvisorWorkspace {
  const ticketTeams = ticketTeamsOf(workspace)
  const prev = workspace.ticketTeams
  if (prev && Object.keys(prev).length === Object.keys(ticketTeams).length) {
    let same = true
    for (const [key, value] of Object.entries(ticketTeams)) {
      if (prev[key] !== value) {
        same = false
        break
      }
    }
    if (same) return workspace.ticketTeams ? workspace : { ...workspace, ticketTeams }
  }
  return { ...workspace, ticketTeams }
}

function ensureTicketOrder(workspace: AdvisorWorkspace): AdvisorWorkspace {
  const ticketOrder = ticketOrderOf(workspace)
  if (workspace.ticketOrder) return { ...workspace, ticketOrder }
  return { ...workspace, ticketOrder }
}

/** Completa el catálogo. Los equipos de demo solo se inyectan en la vista local. */
export function hydrateAdvisorWorkspace(
  workspace: AdvisorWorkspace,
  opts?: { keepExamples?: boolean; showcase?: boolean },
): AdvisorWorkspace {
  const withCatalog = ensureDefaultCatalog(workspace)
  const withTeams = opts?.showcase ? ensureShowcaseTeams(withCatalog) : reconcileTeamMembers(withCatalog)
  const next = refreshDemoTaskDates(withTeams)
  const cleaned = opts?.keepExamples ? next : dropExampleTasks(next)
  return ensureTicketOrder(ensureTicketTeams(cleaned))
}

export function parseAdvisorWorkspace(value: unknown): AdvisorWorkspace | null {
  if (!isWorkspace(value)) return null
  return hydrateAdvisorWorkspace(value)
}

export function rawWorkspaceNeedsShowcase(_value: unknown): boolean {
  return false
}

export function rawWorkspaceHasExampleTasks(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const tasks = (value as { tasks?: unknown }).tasks
  if (!Array.isArray(tasks)) return false
  return tasks.some((row) => {
    if (!row || typeof row !== 'object') return false
    const task = row as { id?: unknown; peticionId?: unknown }
    return isExampleAssignedTask({
      id: String(task.id ?? ''),
      peticionId: task.peticionId == null ? null : String(task.peticionId),
    })
  })
}

export function loadAdvisorWorkspace(workshopId: string): AdvisorWorkspace {
  const keepExamples = keepExampleAssignedTasks(workshopId)
  const showcase = keepExamples
  const seed = () => (showcase ? seedAdvisorWorkspace({ examples: true }) : emptyAdvisorWorkspace())
  if (!workshopId || typeof localStorage === 'undefined') {
    return hydrateAdvisorWorkspace(seed(), { keepExamples, showcase })
  }
  try {
    const raw = localStorage.getItem(advisorWorkspaceStorageKey(workshopId))
    if (!raw) return hydrateAdvisorWorkspace(seed(), { keepExamples, showcase })
    const parsed = JSON.parse(raw) as unknown
    if (!isWorkspace(parsed)) return hydrateAdvisorWorkspace(seed(), { keepExamples, showcase })
    return hydrateAdvisorWorkspace(parsed, { keepExamples, showcase })
  } catch {
    return hydrateAdvisorWorkspace(seed(), { keepExamples, showcase })
  }
}

export function saveAdvisorWorkspace(workshopId: string, workspace: AdvisorWorkspace): void {
  if (!workshopId || typeof localStorage === 'undefined') return
  localStorage.setItem(advisorWorkspaceStorageKey(workshopId), JSON.stringify(workspace))
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(ADVISOR_WORKSPACE_CHANGED, { detail: { workshopId } }))
  }
}

export function ensurePersonInWorkspace(
  workspace: AdvisorWorkspace,
  person: { name: string; email: string },
): AdvisorWorkspace {
  const email = normalizeEmail(person.email)
  if (!email) return workspace
  if (workspace.people.some((row) => normalizeEmail(row.email) === email)) return workspace
  const nextPerson: AdvisorPerson = {
    id: newId('person'),
    name: person.name.trim() || email,
    email,
  }
  return { ...workspace, people: [...workspace.people, nextPerson] }
}

export function personById(workspace: AdvisorWorkspace, id: string): AdvisorPerson | undefined {
  return workspace.people.find((person) => person.id === id)
}

export function personByEmail(workspace: AdvisorWorkspace, email: string): AdvisorPerson | undefined {
  const key = normalizeEmail(email)
  return workspace.people.find((person) => normalizeEmail(person.email) === key)
}

export function catalogName(items: CatalogItem[], id: string | null | undefined): string {
  if (!id) return 'Sin asignar'
  return items.find((item) => item.id === id)?.name || 'Sin asignar'
}

export function teamForPerson(workspace: AdvisorWorkspace, personId: string): AdvisorTeam | undefined {
  return teamsForPerson(workspace, personId)[0]
}

export function teamsForPerson(workspace: AdvisorWorkspace, personId: string): AdvisorTeam[] {
  if (!personId) return []
  const person = personById(workspace, personId)
  const email = normalizeEmail(person?.email ?? '')
  return workspace.teams.filter((team) => isPersonOnTeam(workspace, team, personId, email))
}

export function teamsForEmail(workspace: AdvisorWorkspace, email: string): AdvisorTeam[] {
  const key = normalizeEmail(email)
  if (!key) return []
  const person = personByEmail(workspace, key)
  return workspace.teams.filter((team) => isPersonOnTeam(workspace, team, person?.id ?? '', key))
}

export function isPersonOnTeam(
  workspace: AdvisorWorkspace,
  team: AdvisorTeam,
  personId: string,
  email = '',
): boolean {
  if (personId && team.memberIds.includes(personId)) return true
  const key = normalizeEmail(email)
  if (!key) return false
  if (team.memberIds.some((id) => normalizeEmail(personById(workspace, id)?.email ?? '') === key)) {
    return true
  }
  const known = [...DEMO_ASESORES.map((row) => ({ id: row.id, email: row.email })), ...SHOWCASE_ADVISORS].find(
    (row) => normalizeEmail(row.email) === key || row.id === personId,
  )
  return Boolean(known && team.memberIds.includes(known.id))
}

export function teamMemberEmails(workspace: AdvisorWorkspace, team: AdvisorTeam): string[] {
  const emails = new Set<string>()
  for (const id of team.memberIds) {
    const person = personById(workspace, id)
    if (person?.email) emails.add(normalizeEmail(person.email))
    const known = [...DEMO_ASESORES, ...SHOWCASE_ADVISORS].find((row) => row.id === id)
    if (known) emails.add(normalizeEmail(known.email))
  }
  return [...emails]
}

export function teamNamesForPerson(workspace: AdvisorWorkspace, personId: string): string {
  return teamsForPerson(workspace, personId)
    .map((team) => team.name)
    .join(', ')
}

export function teamLabelForEmail(workspace: AdvisorWorkspace, email: string): string {
  const names = teamsForEmail(workspace, email).map((team) => team.name.trim()).filter(Boolean)
  if (names.length === 0) return 'Sin equipo'
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} y ${names[1]}`
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`
}

export function typesForTeam(workspace: AdvisorWorkspace, team: AdvisorTeam | undefined): CatalogItem[] {
  if (!team) return workspace.taskTypes
  return workspace.taskTypes.filter((item) => team.taskTypeIds.includes(item.id))
}

export function boardsForTeam(workspace: AdvisorWorkspace, team: AdvisorTeam | undefined): CatalogItem[] {
  if (!team) return workspace.boards
  return workspace.boards.filter((item) => team.boardIds.includes(item.id))
}

export function isTaskDueOnOrBefore(task: AssignedTask, dayIso: string): boolean {
  return task.dueDate <= dayIso
}

function localDateFromIso(iso: string | null | undefined): string | null {
  if (!iso) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function taskCompletedOn(task: AssignedTask): string | null {
  if (task.status !== 'hecho') return null
  return localDateFromIso(task.completedAt) ?? task.dueDate
}

export function isTaskOnTodayBoard(task: AssignedTask, dayIso: string): boolean {
  if (isExampleAssignedTask(task)) return false
  if (task.status === 'hecho') return taskCompletedOn(task) === dayIso
  return isTaskDueOnOrBefore(task, dayIso)
}

export function tasksOnTodayBoard(
  workspace: AdvisorWorkspace,
  dayIso: string,
  extra?: (task: AssignedTask) => boolean,
): AssignedTask[] {
  return workspace.tasks.filter((task) => {
    if (!isTaskOnTodayBoard(task, dayIso)) return false
    return extra ? extra(task) : true
  })
}

/** Todas las tareas asignadas de verdad (sin ejemplos), para el historial. */
export function assignedTasksHistory(
  workspace: AdvisorWorkspace,
  extra?: (task: AssignedTask) => boolean,
): AssignedTask[] {
  return workspace.tasks.filter((task) => {
    if (isExampleAssignedTask(task)) return false
    return extra ? extra(task) : true
  })
}

export function tasksForAdvisorDay(workspace: AdvisorWorkspace, email: string, dayIso: string): AssignedTask[] {
  const person = personByEmail(workspace, email)
  if (!person) return []
  return tasksOnTodayBoard(workspace, dayIso, (task) => task.assigneeId === person.id)
}

export function createTeam(workspace: AdvisorWorkspace, name: string): AdvisorWorkspace {
  const trimmed = sanitizeTeamName(name)
  if (!trimmed) return workspace
  const team: AdvisorTeam = {
    id: newId('team'),
    name: trimmed,
    memberIds: [],
    taskTypeIds: workspace.taskTypes.map((item) => item.id),
    boardIds: workspace.boards.map((item) => item.id),
  }
  return { ...workspace, teams: [...workspace.teams, team] }
}

export function createdTeamId(previous: AdvisorWorkspace, next: AdvisorWorkspace): string {
  return next.teams.find((team) => !previous.teams.some((row) => row.id === team.id))?.id ?? ''
}

export function patchTeam(
  workspace: AdvisorWorkspace,
  teamId: string,
  patch: Partial<Pick<AdvisorTeam, 'name' | 'memberIds' | 'taskTypeIds' | 'boardIds'>>,
): AdvisorWorkspace {
  const nextPatch = patch.name != null ? { ...patch, name: sanitizeTeamName(patch.name) } : patch
  if (nextPatch.name != null && !nextPatch.name) return workspace
  return {
    ...workspace,
    teams: workspace.teams.map((team) => (team.id === teamId ? { ...team, ...nextPatch } : team)),
  }
}

export function removeTeam(workspace: AdvisorWorkspace, teamId: string): AdvisorWorkspace {
  const nextTeams = workspace.teams.filter((team) => team.id !== teamId)
  return {
    ...workspace,
    teams: nextTeams,
    tasks: workspace.tasks.map((task) => (task.teamId === teamId ? { ...task, teamId: null } : task)),
    ticketTeams: ticketTeamsOf({ teams: nextTeams, ticketTeams: workspace.ticketTeams }),
    ticketOrder: ticketOrderOf({ teams: nextTeams, ticketOrder: workspace.ticketOrder }),
  }
}

/** Un asesor puede estar en varios equipos. */
export function addPersonToTeam(workspace: AdvisorWorkspace, personId: string, teamId: string): AdvisorWorkspace {
  if (!personId || !teamId) return workspace
  return {
    ...workspace,
    teams: workspace.teams.map((team) =>
      team.id === teamId && !team.memberIds.includes(personId)
        ? { ...team, memberIds: [...team.memberIds, personId] }
        : team,
    ),
  }
}

export function removePersonFromTeam(workspace: AdvisorWorkspace, personId: string, teamId: string): AdvisorWorkspace {
  if (!personId || !teamId) return workspace
  return {
    ...workspace,
    teams: workspace.teams.map((team) =>
      team.id === teamId && team.memberIds.includes(personId)
        ? { ...team, memberIds: team.memberIds.filter((id) => id !== personId) }
        : team,
    ),
  }
}

export function togglePersonOnTeam(workspace: AdvisorWorkspace, personId: string, teamId: string): AdvisorWorkspace {
  const team = workspace.teams.find((row) => row.id === teamId)
  if (!team) return workspace
  return team.memberIds.includes(personId)
    ? removePersonFromTeam(workspace, personId, teamId)
    : addPersonToTeam(workspace, personId, teamId)
}

/** Deja al asesor solo en ese equipo. `teamId` vacío lo saca de todos. */
export function setPersonTeam(workspace: AdvisorWorkspace, personId: string, teamId: string | null): AdvisorWorkspace {
  if (!personId) return workspace
  return {
    ...workspace,
    teams: workspace.teams.map((team) => {
      const has = team.memberIds.includes(personId)
      if (team.id === teamId) {
        return has ? team : { ...team, memberIds: [...team.memberIds, personId] }
      }
      return has ? { ...team, memberIds: team.memberIds.filter((id) => id !== personId) } : team
    }),
  }
}

export function removePerson(workspace: AdvisorWorkspace, personId: string): AdvisorWorkspace {
  if (!personId || !workspace.people.some((person) => person.id === personId)) return workspace
  return {
    ...workspace,
    people: workspace.people.filter((person) => person.id !== personId),
    teams: workspace.teams.map((team) =>
      team.memberIds.includes(personId)
        ? { ...team, memberIds: team.memberIds.filter((id) => id !== personId) }
        : team,
    ),
    tasks: workspace.tasks.map((task) => (task.assigneeId === personId ? { ...task, assigneeId: '' } : task)),
  }
}

export function addPerson(
  workspace: AdvisorWorkspace,
  name: string,
  email: string,
  teamId?: string | null,
  role?: AdvisorAccountRole,
): AdvisorWorkspace {
  const normalized = normalizeEmail(email)
  const trimmedName = name.trim()
  if (!normalized || !trimmedName) return workspace
  const existing = workspace.people.find((person) => normalizeEmail(person.email) === normalized)
  if (existing) {
    const withRole = role && existing.role !== role ? { ...workspace, people: workspace.people.map((person) => (person.id === existing.id ? { ...person, role } : person)) } : workspace
    return teamId ? addPersonToTeam(withRole, existing.id, teamId) : withRole
  }
  const person: AdvisorPerson = { id: newId('person'), name: trimmedName, email: normalized, ...(role ? { role } : {}) }
  const withPerson = { ...workspace, people: [...workspace.people, person] }
  return teamId ? addPersonToTeam(withPerson, person.id, teamId) : withPerson
}

export function setPersonRole(
  workspace: AdvisorWorkspace,
  personId: string,
  role: AdvisorAccountRole,
): AdvisorWorkspace {
  if (!workspace.people.some((person) => person.id === personId)) return workspace
  return {
    ...workspace,
    people: workspace.people.map((person) => (person.id === personId ? { ...person, role } : person)),
  }
}

export function schedulePersonDelete(
  workspace: AdvisorWorkspace,
  personId: string,
  now = new Date(),
): AdvisorWorkspace {
  if (!workspace.people.some((person) => person.id === personId)) return workspace
  const purge = new Date(now.getTime() + ACCOUNT_PURGE_DAYS * 86_400_000)
  return {
    ...workspace,
    people: workspace.people.map((person) =>
      person.id === personId
        ? { ...person, deletedAt: now.toISOString(), purgeAt: purge.toISOString() }
        : person,
    ),
  }
}

export function restorePerson(workspace: AdvisorWorkspace, personId: string): AdvisorWorkspace {
  if (!workspace.people.some((person) => person.id === personId)) return workspace
  return {
    ...workspace,
    people: workspace.people.map((person) => {
      if (person.id !== personId) return person
      const next = { ...person }
      delete next.deletedAt
      delete next.purgeAt
      return next
    }),
  }
}

export function purgeExpiredPeople(
  workspace: AdvisorWorkspace,
  now = Date.now(),
): { workspace: AdvisorWorkspace; purged: AdvisorPerson[] } {
  const purged = workspace.people.filter((person) => isPersonPurgeDue(person, now))
  return {
    workspace: purged.reduce((current, person) => removePerson(current, person.id), workspace),
    purged,
  }
}

export function addCatalogItem(
  workspace: AdvisorWorkspace,
  kind: 'taskTypes' | 'boards',
  name: string,
): AdvisorWorkspace {
  const trimmed = name.trim()
  if (!trimmed) return workspace
  const prefix = kind === 'taskTypes' ? 'tt' : 'board'
  const item: CatalogItem = { id: newId(prefix), name: trimmed }
  const teams = workspace.teams.map((team) =>
    kind === 'taskTypes'
      ? { ...team, taskTypeIds: [...team.taskTypeIds, item.id] }
      : { ...team, boardIds: [...team.boardIds, item.id] },
  )
  return { ...workspace, [kind]: [...workspace[kind], item], teams }
}

export function addAssignedTask(
  workspace: AdvisorWorkspace,
  input: Omit<AssignedTask, 'id' | 'createdAt' | 'completedAt' | 'status'> & { status?: AssignedTaskStatus },
): AdvisorWorkspace {
  const task: AssignedTask = {
    ...input,
    id: newId('task'),
    createdAt: new Date().toISOString(),
    completedAt: input.status === 'hecho' ? new Date().toISOString() : null,
    status: input.status ?? 'pendiente',
  }
  return { ...workspace, tasks: [...workspace.tasks, task] }
}

export function setAssignedTaskStatus(
  workspace: AdvisorWorkspace,
  taskId: string,
  status: AssignedTaskStatus,
): AdvisorWorkspace {
  return {
    ...workspace,
    tasks: workspace.tasks.map((task) =>
      task.id === taskId
        ? {
            ...task,
            status,
            completedAt: status === 'hecho' ? task.completedAt || new Date().toISOString() : null,
          }
        : task,
    ),
  }
}

export function setAssignedTaskAssignee(
  workspace: AdvisorWorkspace,
  taskId: string,
  assigneeId: string,
): AdvisorWorkspace {
  return {
    ...workspace,
    tasks: workspace.tasks.map((task) => {
      if (task.id !== taskId) return task
      const nextTeamId = assigneeId ? teamForPerson(workspace, assigneeId)?.id ?? task.teamId : task.teamId
      return { ...task, assigneeId, teamId: nextTeamId }
    }),
  }
}

export type AdvisorWorkStats = {
  person: AdvisorPerson
  assigned: number
  done: number
  pending: number
  peticiones: number
  peticionesHechas: number
}

export function computeAdvisorStats(
  workspace: AdvisorWorkspace,
  opts: {
    fromIso?: string
    toIso?: string
    peticionEmails: Map<string, { total: number; hechas: number }>
  },
): AdvisorWorkStats[] {
  return workspace.people.map((person) => {
    const tasks = workspace.tasks.filter((task) => {
      if (isExampleAssignedTask(task)) return false
      if (task.assigneeId !== person.id) return false
      if (opts.fromIso && task.dueDate < opts.fromIso) return false
      if (opts.toIso && task.dueDate > opts.toIso) return false
      return true
    })
    const emailStats = opts.peticionEmails.get(normalizeEmail(person.email))
    return {
      person,
      assigned: tasks.length,
      done: tasks.filter((task) => task.status === 'hecho').length,
      pending: tasks.filter((task) => task.status === 'pendiente').length,
      peticiones: emailStats?.total ?? 0,
      peticionesHechas: emailStats?.hechas ?? 0,
    }
  })
}

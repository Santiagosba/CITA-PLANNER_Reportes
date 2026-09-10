/**
 * Equipos, tipos de tarea, tableros y asignaciones del taller.
 * Caché local + `operations.crm_advisor_workspace` para compartirlo entre admin y asesores.
 */

import { DEMO_ASESORES } from './demoAsesores'

export type AdvisorPerson = {
  id: string
  name: string
  email: string
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
}

const STORAGE_PREFIX = 'avi_advisor_workspace_v1:'
export const ADVISOR_WORKSPACE_CHANGED = 'avi-advisor-workspace-changed'

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

export function seedAdvisorWorkspace(): AdvisorWorkspace {
  const people: AdvisorPerson[] = DEMO_ASESORES.map((asesor) => ({
    id: asesor.id,
    name: `${asesor.firstName} ${asesor.lastName}`.trim(),
    email: normalizeEmail(asesor.email),
  }))
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
  return {
    version: 1,
    people,
    teams: [
      {
        id: 'team-prueba',
        name: 'Equipo de prueba',
        memberIds: people.map((person) => person.id),
        taskTypeIds: taskTypes.map((item) => item.id),
        boardIds: boards.map((item) => item.id),
      },
    ],
    taskTypes,
    boards,
    tasks: [
      {
        id: 'task-local-1',
        title: 'Llamar a Mariano: ruido al arrancar',
        notes: 'Ejemplo local. Entra como Ana para verla en Tareas de hoy.',
        taskTypeId: 'tt-llamada',
        boardId: 'mechanics',
        teamId: 'team-prueba',
        assigneeId: 'demo-asesor-ana',
        dueDate: localTodayIso(),
        createdAt: new Date().toISOString(),
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
        teamId: 'team-prueba',
        assigneeId: 'demo-asesor-luis',
        dueDate: localTodayIso(),
        createdAt: new Date().toISOString(),
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
        teamId: 'team-prueba',
        assigneeId: 'demo-asesor-carmen',
        dueDate: localTodayIso(),
        createdAt: new Date().toISOString(),
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
        teamId: 'team-prueba',
        assigneeId: '',
        dueDate: localTodayIso(),
        createdAt: new Date().toISOString(),
        createdByEmail: 'santy@gmail.com',
        status: 'pendiente',
        peticionId: null,
      },
    ],
  }
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
  for (const asesor of DEMO_ASESORES) {
    const email = normalizeEmail(asesor.email)
    if (people.some((person) => normalizeEmail(person.email) === email)) continue
    people = [
      ...people,
      {
        id: asesor.id,
        name: `${asesor.firstName} ${asesor.lastName}`.trim(),
        email,
      },
    ]
  }
  return people === workspace.people ? workspace : { ...workspace, people }
}

function ensureDefaultCatalog(workspace: AdvisorWorkspace): AdvisorWorkspace {
  if (workspace.taskTypes.length > 0 && workspace.boards.length > 0) return workspace
  const seed = seedAdvisorWorkspace()
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

/** Completa huecos de demo sin reescribir equipos ni tareas que ya existan. */
export function hydrateAdvisorWorkspace(workspace: AdvisorWorkspace): AdvisorWorkspace {
  return refreshDemoTaskDates(ensureDefaultCatalog(ensureDemoPeople(workspace)))
}

export function parseAdvisorWorkspace(value: unknown): AdvisorWorkspace | null {
  if (!isWorkspace(value)) return null
  return hydrateAdvisorWorkspace(value)
}

export function loadAdvisorWorkspace(workshopId: string): AdvisorWorkspace {
  if (!workshopId || typeof localStorage === 'undefined') return hydrateAdvisorWorkspace(seedAdvisorWorkspace())
  try {
    const raw = localStorage.getItem(advisorWorkspaceStorageKey(workshopId))
    if (!raw) return hydrateAdvisorWorkspace(seedAdvisorWorkspace())
    const parsed = JSON.parse(raw) as unknown
    if (!isWorkspace(parsed)) return hydrateAdvisorWorkspace(seedAdvisorWorkspace())
    return hydrateAdvisorWorkspace(parsed)
  } catch {
    return hydrateAdvisorWorkspace(seedAdvisorWorkspace())
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
  return workspace.teams.find((team) => team.memberIds.includes(personId))
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

export function tasksForAdvisorDay(workspace: AdvisorWorkspace, email: string, dayIso: string): AssignedTask[] {
  const person = personByEmail(workspace, email)
  if (!person) return []
  return workspace.tasks.filter((task) => {
    if (task.assigneeId !== person.id) return false
    if (task.status === 'hecho') return task.dueDate === dayIso
    return isTaskDueOnOrBefore(task, dayIso)
  })
}

export function createTeam(workspace: AdvisorWorkspace, name: string): AdvisorWorkspace {
  const trimmed = name.trim()
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
  return {
    ...workspace,
    teams: workspace.teams.map((team) => (team.id === teamId ? { ...team, ...patch } : team)),
  }
}

export function removeTeam(workspace: AdvisorWorkspace, teamId: string): AdvisorWorkspace {
  return {
    ...workspace,
    teams: workspace.teams.filter((team) => team.id !== teamId),
    tasks: workspace.tasks.map((task) => (task.teamId === teamId ? { ...task, teamId: null } : task)),
  }
}

export function addPersonToTeam(workspace: AdvisorWorkspace, personId: string, teamId: string): AdvisorWorkspace {
  if (!personId || !teamId) return workspace
  return {
    ...workspace,
    teams: workspace.teams.map((team) => {
      if (team.id !== teamId || team.memberIds.includes(personId)) return team
      return { ...team, memberIds: [...team.memberIds, personId] }
    }),
  }
}

export function addPerson(
  workspace: AdvisorWorkspace,
  name: string,
  email: string,
  teamId?: string | null,
): AdvisorWorkspace {
  const normalized = normalizeEmail(email)
  const trimmedName = name.trim()
  if (!normalized || !trimmedName) return workspace
  const existing = workspace.people.find((person) => normalizeEmail(person.email) === normalized)
  if (existing) {
    return teamId ? addPersonToTeam(workspace, existing.id, teamId) : workspace
  }
  const person: AdvisorPerson = { id: newId('person'), name: trimmedName, email: normalized }
  const withPerson = { ...workspace, people: [...workspace.people, person] }
  return teamId ? addPersonToTeam(withPerson, person.id, teamId) : withPerson
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
  input: Omit<AssignedTask, 'id' | 'createdAt' | 'status'> & { status?: AssignedTaskStatus },
): AdvisorWorkspace {
  const task: AssignedTask = {
    ...input,
    id: newId('task'),
    createdAt: new Date().toISOString(),
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
    tasks: workspace.tasks.map((task) => (task.id === taskId ? { ...task, status } : task)),
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

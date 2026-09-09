/**
 * Equipos, tipos de tarea, tableros y asignaciones del taller.
 * Persistencia local por taller hasta que exista tabla en Hub.
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
        id: 'team-general',
        name: 'Triage y comercial',
        memberIds: people.filter((person) => person.id !== 'demo-asesor-carmen').map((person) => person.id),
        taskTypeIds: taskTypes.map((item) => item.id),
        boardIds: boards.map((item) => item.id),
      },
      {
        id: 'team-peritaje',
        name: 'Peritaje',
        memberIds: ['demo-asesor-carmen'],
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
        teamId: 'team-general',
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
        teamId: 'team-general',
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
        teamId: 'team-peritaje',
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
        teamId: 'team-general',
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

function storageKey(workshopId: string): string {
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

export function loadAdvisorWorkspace(workshopId: string): AdvisorWorkspace {
  if (!workshopId || typeof localStorage === 'undefined') return seedAdvisorWorkspace()
  try {
    const raw = localStorage.getItem(storageKey(workshopId))
    if (!raw) return seedAdvisorWorkspace()
    const parsed = JSON.parse(raw) as unknown
    if (!isWorkspace(parsed)) return seedAdvisorWorkspace()
    if (parsed.tasks.length === 0) {
      return { ...parsed, tasks: seedAdvisorWorkspace().tasks }
    }
    return parsed
  } catch {
    return seedAdvisorWorkspace()
  }
}

export function saveAdvisorWorkspace(workshopId: string, workspace: AdvisorWorkspace): void {
  if (!workshopId || typeof localStorage === 'undefined') return
  localStorage.setItem(storageKey(workshopId), JSON.stringify(workspace))
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
  const teams = workspace.teams.map((team, index) =>
    index === 0 ? { ...team, memberIds: [...team.memberIds, nextPerson.id] } : team,
  )
  return { ...workspace, people: [...workspace.people, nextPerson], teams }
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
  if (!team || team.taskTypeIds.length === 0) return workspace.taskTypes
  return workspace.taskTypes.filter((item) => team.taskTypeIds.includes(item.id))
}

export function boardsForTeam(workspace: AdvisorWorkspace, team: AdvisorTeam | undefined): CatalogItem[] {
  if (!team || team.boardIds.length === 0) return workspace.boards
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
  return { ...workspace, teams: workspace.teams.filter((team) => team.id !== teamId) }
}

export function addPerson(workspace: AdvisorWorkspace, name: string, email: string): AdvisorWorkspace {
  const normalized = normalizeEmail(email)
  const trimmedName = name.trim()
  if (!normalized || !trimmedName) return workspace
  if (workspace.people.some((person) => normalizeEmail(person.email) === normalized)) return workspace
  return {
    ...workspace,
    people: [...workspace.people, { id: newId('person'), name: trimmedName, email: normalized }],
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

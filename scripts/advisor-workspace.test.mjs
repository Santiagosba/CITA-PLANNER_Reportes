import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

function setup() {
  const saved = new Map()
  const localStorage = { getItem: (key) => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) }
  const window = new EventTarget()
  const modules = { './demoAsesores': { DEMO_ASESORES: [
    { id: 'demo-asesor-ana', firstName: 'Ana', lastName: 'Ruiz', email: 'ana@demo.test' },
    { id: 'demo-asesor-luis', firstName: 'Luis', lastName: 'Mora', email: 'luis@demo.test' },
    { id: 'demo-asesor-carmen', firstName: 'Carmen', lastName: 'Vidal', email: 'carmen@demo.test' },
  ] } }
  const load = (path) => {
    const source = readFileSync(new URL(`../src/${path}.ts`, import.meta.url), 'utf8')
    const exports = {}
    const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } })
    vm.runInNewContext(outputText, { exports, require: (name) => {
      assert.ok(modules[name], name)
      return modules[name]
    }, localStorage, window, CustomEvent, crypto })
    return exports
  }
  const lib = load('lib/advisorWorkspace')
  modules['../lib/advisorWorkspace'] = lib
  modules['../lib/advisorWorkspaceStore'] = {
    advisorWorkspacePersistState: () => ({ persistError: null, remote: false }),
    peekAdvisorWorkspace: (id) => lib.loadAdvisorWorkspace(id),
    hydrateAdvisorWorkspaceStore: async (id) => lib.loadAdvisorWorkspace(id),
    commitAdvisorWorkspace: (id, update) => {
      const keepExamples = id === 'local-preview'
      const next = lib.hydrateAdvisorWorkspace(update(lib.loadAdvisorWorkspace(id)), {
        keepExamples,
        showcase: keepExamples,
      })
      lib.saveAdvisorWorkspace(id, next)
      return next
    },
    retainAdvisorWorkspaceLive: () => {},
    releaseAdvisorWorkspaceLive: () => {},
  }
  function mount(workshopId) {
    const states = []
    let cursor = 0
    const effects = []
    const cleanup = []
    modules.react = {
      useState: (init) => {
        const index = cursor++
        if (states[index] === undefined) states[index] = typeof init === 'function' ? init() : init
        return [
          states[index],
          (next) => {
            states[index] = typeof next === 'function' ? next(states[index]) : next
          },
        ]
      },
      useCallback: (fn) => fn,
      useMemo: (fn) => fn(),
      useEffect: (fn) => effects.push(fn),
    }
    const actions = load('hooks/useAdvisorWorkspace').useAdvisorWorkspace(workshopId)
    for (const effect of effects) cleanup.push(effect())
    return { actions, current: () => states[0], unmount: () => cleanup.forEach((fn) => fn?.()) }
  }
  return { lib, mount, window, localStorage }
}

test('dashboard receives assignments from another mounted view without losing earlier edits', () => {
  const { mount, lib } = setup()
  const dashboard = mount('local-preview')
  const assign = mount('local-preview')
  const first = dashboard.current().tasks[0]
  assign.actions.assignTask({ ...first, title: 'Assigned today' })
  dashboard.actions.setTaskStatus(first.id, 'hecho')
  assert.ok(dashboard.current().tasks.some((task) => task.title === 'Assigned today'))
  assert.equal(assign.current().tasks.find((task) => task.id === first.id).status, 'hecho')
  assert.ok(lib.tasksForAdvisorDay(dashboard.current(), 'ana@demo.test', lib.localTodayIso()).some((task) => task.title === 'Assigned today'))
})

test('storage events sync only the matching workshop and listeners are cleaned up', () => {
  const { mount, lib, window, localStorage } = setup()
  const dashboard = mount('local-preview')
  const other = mount('two')
  const next = lib.setAssignedTaskStatus(dashboard.current(), 'task-local-1', 'hecho')
  const key = lib.advisorWorkspaceStorageKey('local-preview')
  localStorage.setItem(key, JSON.stringify(next))
  const event = new Event('storage')
  Object.assign(event, { key, storageArea: localStorage })
  window.dispatchEvent(event)
  assert.equal(dashboard.current().tasks[0].status, 'hecho')
  assert.equal(other.current().teams.length, 0)
  dashboard.unmount()
  lib.saveAdvisorWorkspace('local-preview', lib.setAssignedTaskStatus(next, 'task-local-1', 'pendiente'))
  assert.equal(dashboard.current().tasks[0].status, 'hecho')
})

test('completed demo tasks stay completed after reopening the dashboard', () => {
  const { lib } = setup()
  const workspace = lib.loadAdvisorWorkspace('local-preview')
  workspace.tasks = workspace.tasks.map((task) => ({ ...task, status: 'hecho' }))
  lib.saveAdvisorWorkspace('local-preview', workspace)
  assert.ok(lib.loadAdvisorWorkspace('local-preview').tasks.every((task) => task.status === 'hecho'))
})

test('a real workshop starts empty without Recepción or Comercial', () => {
  const { lib } = setup()
  const workspace = lib.loadAdvisorWorkspace('e6f001b2-2501-42f7-888c-bd96a02d4ee1')
  assert.equal(workspace.teams.length, 0)
  assert.equal(workspace.people.length, 0)
  assert.ok(workspace.taskTypes.length > 0)
  assert.equal(lib.hydrateAdvisorWorkspace(lib.emptyAdvisorWorkspace()).teams.length, 0)
})

test('showcase teams assign each advisor to one group', () => {
  const { lib } = setup()
  const workspace = lib.seedAdvisorWorkspace({ examples: true })
  assert.ok(workspace.teams.some((team) => team.id === lib.TEAM_RECEPCION_ID))
  assert.ok(workspace.teams.some((team) => team.id === lib.TEAM_COMERCIAL_ID))
  assert.equal(lib.teamForPerson(workspace, 'demo-asesor-ana')?.id, lib.TEAM_RECEPCION_ID)
  assert.equal(lib.teamForPerson(workspace, 'demo-asesor-luis')?.id, lib.TEAM_COMERCIAL_ID)
  const both = lib.addPersonToTeam(workspace, 'demo-asesor-ana', lib.TEAM_COMERCIAL_ID)
  assert.equal(lib.teamsForPerson(both, 'demo-asesor-ana').length, 2)
  const moved = lib.setPersonTeam(workspace, 'demo-asesor-ana', lib.TEAM_COMERCIAL_ID)
  assert.equal(lib.teamForPerson(moved, 'demo-asesor-ana')?.id, lib.TEAM_COMERCIAL_ID)
  assert.equal(moved.teams.find((team) => team.id === lib.TEAM_RECEPCION_ID).memberIds.includes('demo-asesor-ana'), false)
})

test('team names keep accents and assigned tickets stay in that team', () => {
  const { lib } = setup()
  const source = readFileSync(new URL('../src/lib/teamScope.ts', import.meta.url), 'utf8')
  const exports = {}
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } })
  vm.runInNewContext(outputText, { exports, require: (name) => {
    if (name === './advisorWorkspace') return lib
    throw new Error(name)
  } })
  const named = lib.createTeam(lib.emptyAdvisorWorkspace(), '  Recepción  ')
  assert.equal(named.teams[0].name, 'Recepción')
  const renamed = lib.patchTeam(named, named.teams[0].id, { name: 'Mecánica' })
  assert.equal(renamed.teams[0].name, 'Mecánica')
  const workspace = lib.seedAdvisorWorkspace()
  const ticket = { idpeticion: 't-1', gestionemail: 'luis@demo.test', tipopeticion: 'Cita' }
  assert.equal(exports.matchesTeamFilter(workspace, ticket, lib.TEAM_RECEPCION_ID, 'admin', 'santy@gmail.com'), false)
  const pinned = lib.setTicketTeam(workspace, ticket.idpeticion, lib.TEAM_RECEPCION_ID)
  assert.equal(exports.matchesTeamFilter(pinned, ticket, lib.TEAM_RECEPCION_ID, 'admin', 'santy@gmail.com'), true)
  assert.equal(exports.ticketTeamLabel(pinned, ticket), 'Recepción')
  const loose = { idpeticion: 't-2', gestionemail: '', tipopeticion: 'WhatsApp' }
  assert.equal(exports.ticketDropColumnId(workspace, loose), exports.TEAM_FILTER_LOOSE)
  assert.equal(exports.ticketDropColumnId(pinned, ticket), lib.TEAM_RECEPCION_ID)
})

test('auto assign in a team prefers the phone owner then the least loaded member', () => {
  const { lib } = setup()
  const ticketClient = { phoneMatchKey: (value) => String(value || '').replace(/\D/g, '').slice(-9) }
  const scope = {}
  const suggest = {}
  const load = (path, exports, requireMap) => {
    const source = readFileSync(new URL(`../src/${path}.ts`, import.meta.url), 'utf8')
    const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } })
    vm.runInNewContext(outputText, { exports, require: (name) => requireMap[name] })
  }
  load('lib/teamScope', scope, { './advisorWorkspace': lib })
  load('lib/ticketOwnerSuggest', suggest, { './advisorWorkspace': lib, './teamScope': scope, './ticketClient': ticketClient })
  const workspace = lib.seedAdvisorWorkspace()
  const team = workspace.teams.find((row) => row.id === lib.TEAM_RECEPCION_ID)
  const open = { idpeticion: 'open-1', caller: '600111222', tipopeticion: 'WhatsApp', gestionemail: '' }
  const previous = { idpeticion: 'old-1', caller: '600111222', tipopeticion: 'WhatsApp', gestionemail: 'carmen@demo.test' }
  const byPhone = suggest.suggestTicketOwnerForTeam(workspace, team, open, [open, previous])
  assert.equal(byPhone.person.email, 'carmen@demo.test')
  assert.equal(byPhone.reason, 'cliente')
  const fresh = { idpeticion: 'open-2', caller: '600000000', tipopeticion: 'WhatsApp', gestionemail: '' }
  const loaded = [
    { idpeticion: 'a', caller: '1', tipopeticion: 'WhatsApp', gestionemail: 'ana@demo.test', gestionado: false },
    { idpeticion: 'c', caller: '2', tipopeticion: 'WhatsApp', gestionemail: 'carmen@demo.test', gestionado: false },
    { idpeticion: 'c2', caller: '3', tipopeticion: 'WhatsApp', gestionemail: 'carmen@demo.test', gestionado: false },
    { idpeticion: 'm', caller: '4', tipopeticion: 'WhatsApp', gestionemail: 'marta.gil@taller.demo', gestionado: false },
    { idpeticion: 'm2', caller: '5', tipopeticion: 'WhatsApp', gestionemail: 'marta.gil@taller.demo', gestionado: false },
  ]
  const byLoad = suggest.suggestTicketOwnerForTeam(workspace, team, fresh, loaded)
  assert.equal(byLoad.person.email, 'ana@demo.test')
  assert.equal(byLoad.reason, 'equipo')
  assert.equal(suggest.teamRepartirHint(0, 0, false), 'Mete gente en este equipo para poder repartir.')
  assert.equal(suggest.teamRepartirHint(0, 2, false), 'Suelta tarjetas aquí para repartirlas.')
  assert.equal(suggest.teamRepartirHint(3, 2, false), 'Se reparte al azar entre el equipo.')
  assert.equal(suggest.teamRepartirHint(0, 2, true), 'Puedes deshacer este reparto.')
  const ana = workspace.people[0]
  const luis = workspace.people[1]
  const planned = suggest.planRandomTeamAssign(
    [ana, luis],
    [{ idpeticion: 'r1' }, { idpeticion: 'r2' }, { idpeticion: 'r3' }, { idpeticion: 'r4' }],
    () => 0.2,
  )
  assert.equal(planned.length, 4)
  assert.ok(planned.every((row) => row.person.email === ana.email || row.person.email === luis.email))
})

test('team filter keeps loose tickets for the matching group', () => {
  const { lib } = setup()
  const source = readFileSync(new URL('../src/lib/teamScope.ts', import.meta.url), 'utf8')
  const exports = {}
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } })
  vm.runInNewContext(outputText, { exports, require: (name) => {
    if (name === './advisorWorkspace') return lib
    throw new Error(name)
  } })
  const workspace = lib.seedAdvisorWorkspace()
  const loose = { gestionemail: '', tipopeticion: 'WhatsApp' }
  const ana = { gestionemail: 'ana@demo.test', tipopeticion: 'WhatsApp' }
  const luis = { gestionemail: 'luis@demo.test', tipopeticion: 'Cita' }
  const voz = { gestionemail: '', tipopeticion: 'Voz Laura' }
  const citaMec = { gestionemail: '', tipopeticion: 'Cita mecánica' }
  const itv = { gestionemail: '', tipopeticion: 'ITV' }
  assert.equal(exports.matchesTeamFilter(workspace, ana, lib.TEAM_RECEPCION_ID, 'admin', 'santy@gmail.com'), true)
  assert.equal(exports.matchesTeamFilter(workspace, luis, lib.TEAM_RECEPCION_ID, 'admin', 'santy@gmail.com'), false)
  assert.equal(exports.matchesTeamFilter(workspace, loose, lib.TEAM_RECEPCION_ID, 'asesor', 'ana@demo.test'), true)
  assert.equal(exports.matchesTeamFilter(workspace, luis, exports.TEAM_FILTER_ALL, 'asesor', 'ana@demo.test'), false)
  assert.equal(exports.matchesTeamFilter(workspace, voz, lib.TEAM_RECEPCION_ID, 'admin', 'santy@gmail.com'), true)
  assert.equal(exports.matchesTeamFilter(workspace, citaMec, lib.TEAM_COMERCIAL_ID, 'admin', 'santy@gmail.com'), true)
  assert.equal(exports.matchesTeamFilter(workspace, itv, lib.TEAM_RECEPCION_ID, 'admin', 'santy@gmail.com'), true)
})

test('ensureShowcaseTeams keeps extra teams and adds the two demo groups', () => {
  const { lib } = setup()
  const seed = lib.seedAdvisorWorkspace()
  const custom = {
    ...seed,
    teams: [{ id: 'team-extra', name: 'Flotas', memberIds: [], taskTypeIds: [], boardIds: [] }],
  }
  const next = lib.ensureShowcaseTeams(custom)
  assert.ok(next.teams.some((team) => team.id === 'team-extra'))
  assert.ok(next.teams.some((team) => team.id === lib.TEAM_RECEPCION_ID))
  assert.ok(next.teams.some((team) => team.id === lib.TEAM_COMERCIAL_ID))
})

test('daily selection includes overdue tasks, excludes future tasks and other advisors', () => {
  const { lib } = setup()
  const workspace = lib.seedAdvisorWorkspace({ examples: true })
  const first = workspace.tasks[0]
  workspace.tasks = [
    { ...first, id: 'today', dueDate: '2026-09-10' },
    { ...first, id: 'overdue', dueDate: '2026-09-09' },
    { ...first, id: 'future', dueDate: '2026-09-11' },
    { ...first, id: 'other', dueDate: '2026-09-10', assigneeId: 'demo-asesor-luis' },
  ]
  assert.equal(lib.tasksForAdvisorDay(workspace, 'ana@demo.test', '2026-09-10').map((task) => task.id).join(','), 'today,overdue')
})

test('removePerson drops the advisor and leaves their tasks without owner', () => {
  const { lib } = setup()
  const workspace = {
    ...lib.emptyAdvisorWorkspace(),
    people: [{ id: 'ana', name: 'Ana', email: 'ana@taller.es' }],
    teams: [{ id: 'recepcion', name: 'Recepción', memberIds: ['ana'], taskTypeIds: [], boardIds: [] }],
    tasks: [{ id: 't1', title: 'Llamar', taskTypeId: 'tt', assigneeId: 'ana', dueDate: '2026-04-10', completed: false }],
  }
  const next = lib.removePerson(workspace, 'ana')
  assert.equal(next.people.length, 0)
  assert.deepEqual(next.teams[0].memberIds, [])
  assert.equal(next.tasks[0].assigneeId, '')
})

test('schedulePersonDelete waits 15 days and restorePerson clears the mark', () => {
  const { lib } = setup()
  const now = new Date('2026-04-01T10:00:00.000Z')
  const workspace = {
    ...lib.emptyAdvisorWorkspace(),
    people: [{ id: 'ana', name: 'Ana', email: 'ana@taller.es', role: 'asesor' }],
    teams: [{ id: 'recepcion', name: 'Recepción', memberIds: ['ana'], taskTypeIds: [], boardIds: [] }],
  }
  const pending = lib.schedulePersonDelete(workspace, 'ana', now)
  assert.equal(lib.isPersonPendingDelete(pending.people[0]), true)
  assert.equal(lib.daysUntilPurge(pending.people[0], now.getTime()), 15)
  assert.equal(lib.isPersonPurgeDue(pending.people[0], now.getTime()), false)
  assert.deepEqual(pending.teams[0].memberIds, ['ana'])
  const restored = lib.restorePerson(pending, 'ana')
  assert.equal(lib.isPersonPendingDelete(restored.people[0]), false)
  assert.equal(restored.people[0].purgeAt, undefined)
  const due = lib.schedulePersonDelete(workspace, 'ana', now)
  const after = lib.purgeExpiredPeople(due, Date.parse('2026-04-16T10:00:00.000Z'))
  assert.equal(after.purged.length, 1)
  assert.equal(after.workspace.people.length, 0)
  assert.deepEqual(after.workspace.teams[0].memberIds, [])
})

test('personMatchesQuery finds name email or role', () => {
  const { lib } = setup()
  const person = { id: '1', name: 'Ana Ruiz', email: 'ana@taller.es', role: 'taller_admin' }
  assert.equal(lib.personMatchesQuery(person, 'ruiz'), true)
  assert.equal(lib.personMatchesQuery(person, 'admin'), true)
  assert.equal(lib.personMatchesQuery(person, 'luis'), false)
})

test('teamLabelForEmail names the team in plain Spanish', () => {
  const { lib } = setup()
  const workspace = {
    ...lib.emptyAdvisorWorkspace(),
    people: [
      { id: 'ana', name: 'Ana', email: 'ana@taller.es' },
      { id: 'luis', name: 'Luis', email: 'luis@taller.es' },
    ],
    teams: [
      { id: 'recepcion', name: 'Recepción', memberIds: ['ana'], taskTypeIds: [], boardIds: [] },
      { id: 'comercial', name: 'Comercial', memberIds: ['ana'], taskTypeIds: [], boardIds: [] },
    ],
  }
  assert.equal(lib.teamLabelForEmail(workspace, 'ana@taller.es'), 'Recepción y Comercial')
  assert.equal(lib.teamLabelForEmail(workspace, 'luis@taller.es'), 'Sin equipo')
})

test('ticketsOwnedByEmail lists every ticket of that advisor', () => {
  const { lib } = setup()
  const source = readFileSync(new URL('../src/lib/ownerScope.ts', import.meta.url), 'utf8')
  const exports = {}
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } })
  vm.runInNewContext(outputText, { exports, require: (name) => {
    if (name === './advisorWorkspace') return lib
    if (name === './peticionesPendientes') return {}
    throw new Error(name)
  } })
  const rows = [
    { idpeticion: 'a', gestionemail: 'Ana@Demo.test', gestionado: false },
    { idpeticion: 'b', gestionemail: 'luis@demo.test', gestionado: false },
    { idpeticion: 'c', gestionemail: 'ana@demo.test', gestionado: true },
    { idpeticion: 'd', gestionemail: '', gestionado: false },
  ]
  const ana = exports.ticketsOwnedByEmail(rows, 'ana@demo.test')
  assert.equal(ana.length, 2)
  assert.equal(ana[0].idpeticion, 'a')
  assert.equal(ana[1].idpeticion, 'c')
  assert.equal(exports.ticketsOwnedByEmail(rows, '').length, 0)
})

test('tickets keep the order they were dropped in', () => {
  const { lib } = setup()
  const workspace = lib.seedAdvisorWorkspace()
  const team = workspace.teams[0]
  let next = lib.placeTicketInOrder(workspace, 't-a', team.id, 0, [])
  next = lib.placeTicketInOrder(next, 't-b', team.id, 1, ['t-a'])
  next = lib.placeTicketInOrder(next, 't-c', team.id, 0, ['t-a', 't-b'])
  const ordered = lib.sortTicketsByOrder(
    [{ idpeticion: 't-a' }, { idpeticion: 't-b' }, { idpeticion: 't-c' }],
    next.ticketOrder[team.id],
  )
  assert.equal(ordered.map((row) => row.idpeticion).join(','), 't-c,t-a,t-b')
  next = lib.placeTicketInOrder(next, 't-c', null, 0, [])
  assert.equal(next.ticketTeams['t-c'], undefined)
  assert.equal(next.ticketOrder[lib.TICKET_ORDER_LOOSE].join(','), 't-c')
  assert.equal(next.ticketOrder[team.id].includes('t-c'), false)
})

test('setPersonRole gives and takes admin without touching teams', () => {
  const { lib } = setup()
  const workspace = {
    ...lib.emptyAdvisorWorkspace(),
    people: [{ id: 'ana', name: 'Ana', email: 'ana@taller.es', role: 'asesor' }],
    teams: [{ id: 'recepcion', name: 'Recepción', memberIds: ['ana'], taskTypeIds: [], boardIds: [] }],
  }
  const admin = lib.setPersonRole(workspace, 'ana', 'taller_admin')
  assert.equal(admin.people[0].role, 'taller_admin')
  assert.deepEqual(admin.teams[0].memberIds, ['ana'])
  const asesor = lib.setPersonRole(admin, 'ana', 'asesor')
  assert.equal(asesor.people[0].role, 'asesor')
})

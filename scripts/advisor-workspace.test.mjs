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
  function mount(workshopId) {
    let state
    const effects = []
    const cleanup = []
    modules.react = {
      useState: (init) => [state = init(), (next) => { state = next }],
      useCallback: (fn) => fn,
      useMemo: (fn) => fn(),
      useEffect: (fn) => effects.push(fn),
    }
    const actions = load('hooks/useAdvisorWorkspace').useAdvisorWorkspace(workshopId)
    for (const effect of effects) cleanup.push(effect())
    return { actions, current: () => state, unmount: () => cleanup.forEach((fn) => fn?.()) }
  }
  return { lib, mount, window, localStorage }
}

test('dashboard receives assignments from another mounted view without losing earlier edits', () => {
  const { mount, lib } = setup()
  const dashboard = mount('workshop')
  const assign = mount('workshop')
  const first = dashboard.current().tasks[0]
  assign.actions.assignTask({ ...first, title: 'Assigned today' })
  dashboard.actions.setTaskStatus(first.id, 'hecho')
  assert.ok(dashboard.current().tasks.some((task) => task.title === 'Assigned today'))
  assert.equal(assign.current().tasks.find((task) => task.id === first.id).status, 'hecho')
  assert.ok(lib.tasksForAdvisorDay(dashboard.current(), 'ana@demo.test', lib.localTodayIso()).some((task) => task.title === 'Assigned today'))
})

test('storage events sync only the matching workshop and listeners are cleaned up', () => {
  const { mount, lib, window, localStorage } = setup()
  const dashboard = mount('one')
  const other = mount('two')
  const next = lib.setAssignedTaskStatus(dashboard.current(), 'task-local-1', 'hecho')
  const key = lib.advisorWorkspaceStorageKey('one')
  localStorage.setItem(key, JSON.stringify(next))
  const event = new Event('storage')
  Object.assign(event, { key, storageArea: localStorage })
  window.dispatchEvent(event)
  assert.equal(dashboard.current().tasks[0].status, 'hecho')
  assert.equal(other.current().tasks[0].status, 'pendiente')
  dashboard.unmount()
  lib.saveAdvisorWorkspace('one', lib.setAssignedTaskStatus(next, 'task-local-1', 'pendiente'))
  assert.equal(dashboard.current().tasks[0].status, 'hecho')
})

test('completed demo tasks stay completed after reopening the dashboard', () => {
  const { lib } = setup()
  const workspace = lib.loadAdvisorWorkspace('one')
  workspace.tasks = workspace.tasks.map((task) => ({ ...task, status: 'hecho' }))
  lib.saveAdvisorWorkspace('one', workspace)
  assert.ok(lib.loadAdvisorWorkspace('one').tasks.every((task) => task.status === 'hecho'))
})

test('daily selection includes overdue tasks, excludes future tasks and other advisors', () => {
  const { lib } = setup()
  const workspace = lib.loadAdvisorWorkspace('one')
  const first = workspace.tasks[0]
  workspace.tasks = [
    { ...first, id: 'today', dueDate: '2026-09-10' },
    { ...first, id: 'overdue', dueDate: '2026-09-09' },
    { ...first, id: 'future', dueDate: '2026-09-11' },
    { ...first, id: 'other', dueDate: '2026-09-10', assigneeId: 'demo-asesor-luis' },
  ]
  assert.equal(lib.tasksForAdvisorDay(workspace, 'ana@demo.test', '2026-09-10').map((task) => task.id).join(','), 'today,overdue')
})

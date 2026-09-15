import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

function load(path, modules = {}) {
  const source = readFileSync(new URL(`../src/${path}.ts`, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  })
  const exports = {}
  vm.runInNewContext(
    outputText,
    {
      exports,
      require: (name) => {
        assert.ok(modules[name], `Unexpected import: ${name}`)
        return modules[name]
      },
    },
    { filename: `${path}.js` },
  )
  return exports
}

const today = '2026-09-15'
const lib = load('lib/boardLiveRange', {
  './advisorWorkspace': { localTodayIso: () => today },
  './dateRangePresets': {
    toDateInputValue: (d) => {
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${y}-${m}-${day}`
    },
  },
  './peticionesPendientes': {},
})

test('today tickets stay first even if a future one is newer', () => {
  const items = [
    { id: 'future', fechainicio: '2026-09-18T09:00:00' },
    { id: 'today-late', cita: { fecha: '2026-09-15' }, fechainicio: '2026-09-15T18:00:00' },
    { id: 'overdue', fechainicio: '2026-09-10T08:00:00' },
    { id: 'today-early', cita: { fecha: '2026-09-15' }, fechainicio: '2026-09-15T08:00:00' },
  ]
  const ordered = [...items].sort((a, b) => lib.compareBoardWorkDay(a, b, today))
  const ids = ordered.map((row) => row.id)
  assert.ok(ids.indexOf('today-late') < ids.indexOf('overdue'))
  assert.ok(ids.indexOf('today-early') < ids.indexOf('overdue'))
  assert.ok(ids.indexOf('overdue') < ids.indexOf('future'))
})

test('board work lanes are today, atrasado and proximo', () => {
  assert.equal(lib.boardWorkLane({ fechainicio: '2026-09-15T12:00:00' }, today), 'today')
  assert.equal(lib.boardWorkLane({ fechainicio: '2026-09-01' }, today), 'atrasado')
  assert.equal(lib.boardWorkLane({ cita: { fecha: '2026-09-20' } }, today), 'proximo')
  assert.equal(lib.boardWorkLaneLabel('today'), 'Hoy')
})

test('the board only keeps tickets of the current day', () => {
  assert.equal(lib.isLiveBoardTicket({ fechainicio: '2026-09-15T10:00:00', gestionado: false }, today), true)
  assert.equal(
    lib.isLiveBoardTicket({ cita: { fecha: '2026-09-15' }, fechainicio: '2026-09-01', gestionado: false }, today),
    true,
  )
  assert.equal(lib.isLiveBoardTicket({ fechainicio: '2026-09-10T08:00:00', gestionado: false }, today), false)
  assert.equal(lib.isLiveBoardTicket({ fechainicio: '2026-09-20T09:00:00', gestionado: false }, today), false)
  assert.equal(lib.isTodayManualEntry('2026-09-15T11:00:00', today), true)
  assert.equal(lib.isTodayManualEntry('2026-09-14T11:00:00', today), false)
})

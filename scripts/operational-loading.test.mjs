import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

function load(path, modules = {}) {
  const source = readFileSync(new URL(`../src/${path}.ts`, import.meta.url), 'utf8').replaceAll('import.meta.env.DEV', 'true')
  const exports = {}
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } })
  vm.runInNewContext(outputText, { exports, require: (name) => {
    assert.ok(modules[name], `Unexpected import ${name}`)
    return modules[name]
  }, setTimeout, clearTimeout, Error })
  return exports
}

const { withLoadDeadline } = load('lib/loadDeadline')

function setup(resolve = async () => ({ ids: ['workshop'] }), copy = [], enrich = async () => []) {
  let index = 0
  const slots = []
  const memo = (fn, deps) => {
    const id = index++
    if (!slots[id] || deps.some((dep, i) => dep !== slots[id].deps[i])) slots[id] = { value: fn(), deps }
    return slots[id].value
  }
  let requests = 0
  const modules = {
    react: {
      useState: (initial) => {
        const id = index++
        if (!(id in slots)) slots[id] = initial
        return [slots[id], (value) => { slots[id] = typeof value === 'function' ? value(slots[id]) : value }]
      },
      useRef: (initial) => { const id = index++; return slots[id] ??= { current: initial } },
      useMemo: memo,
      useCallback: (fn, deps) => memo(() => fn, deps),
      useEffect: () => {},
    },
    '../lib/loadDeadline': { withLoadDeadline: (pending) => withLoadDeadline(pending, 20) },
    '../lib/peticionesPendientes': {
      resolveAvioldTallerIdsDetailed: () => { requests++; return resolve() },
      fetchPendingPeticiones: async (_ids, _range, options) => {
        assert.equal(options.includeClientNames, false)
        return [{ idpeticion: 'live' }]
      },
      enrichPeticionClientNames: enrich,
      mergePeticionClientNames: (current, enriched) => current.map((row) => ({ ...row, clienteNombre: enriched.find((item) => item.idpeticion === row.idpeticion)?.clienteNombre })),
      fetchTiposPeticion: async () => [],
      getPeticionesSourceNotice: () => null,
    },
    '../lib/demoTickets': {
      DEMO_TICKETS_NOTICE: 'Demo', isDemoTicketId: (id) => id === 'demo',
      mergeLiveAndDemoTickets: (rows, workshop) => workshop.source === 'demo' ? [...rows, { idpeticion: 'demo' }] : rows,
    },
    '../lib/ticketOps': { PETICIONES_PATCHED_EVENT: 'patched' },
    '../lib/workingCopy': { COPY_FALLBACK_NOTICE: 'Copy', loadPeticionesCopy: () => copy, savePeticionesCopy: () => {}, workshopCopyId: () => 'workshop' },
  }
  const { useOperationalData } = load('hooks/useOperationalData', modules)
  const workshop = { id: 'workshop', originalId: 'workshop' }
  return { workshop, requests: () => requests, render: () => { index = 0; return useOperationalData(workshop, {}) } }
}

test('refresh callbacks stay stable across loading and completed renders', async () => {
  const app = setup()
  const initial = app.render()
  const pending = initial.refresh()
  assert.equal(app.render().refresh, initial.refresh)
  await pending
  const completed = app.render()
  assert.equal(completed.loading, false)
  assert.equal(completed.refresh, initial.refresh)
  assert.equal(completed.refreshSilent, initial.refreshSilent)
  assert.equal(app.requests(), 1)
})

test('local preview loads demo tickets without contacting a backend', async () => {
  const app = setup(() => new Promise(() => {}))
  Object.assign(app.workshop, { id: 'local-preview', source: 'demo' })
  await app.render().refresh()
  assert.equal(app.render().loading, false)
  assert.equal(app.render().items[0].idpeticion, 'demo')
  assert.equal(app.requests(), 0)
})

test('overlapping refreshes share one request', async () => {
  const app = setup()
  const view = app.render()
  await Promise.all([view.refresh(), view.refreshSilent(), view.refresh()])
  assert.equal(app.requests(), 1)
  assert.equal(app.render().loading, false)
})

test('a hung backend exits loading with an error and allows retry', async () => {
  const app = setup(() => new Promise(() => {}))
  await app.render().refresh()
  assert.equal(app.render().loading, false)
  assert.match(app.render().error, /tiempo de espera/)
  await app.render().refresh()
  assert.equal(app.requests(), 2)
})

test('deadline returns successful data and rejects a hung operation', async () => {
  assert.equal(await withLoadDeadline(Promise.resolve('ok'), 20), 'ok')
  await assert.rejects(withLoadDeadline(new Promise(() => {}), 5), /tiempo de espera/)
})

test('cached data exposes the failure and a successful retry clears the warning', async () => {
  let fail = true
  const app = setup(async () => {
    if (fail) throw new Error('La API rechazó la consulta del taller')
    return { ids: ['workshop'] }
  }, [{ idpeticion: 'cached' }])
  await app.render().refresh()
  assert.equal(app.render().loading, false)
  assert.equal(app.render().items[0].idpeticion, 'cached')
  assert.match(app.render().sourceNotice, /Motivo: La API rechazó la consulta del taller/)
  fail = false
  await app.render().refresh()
  assert.equal(app.render().items[0].idpeticion, 'live')
  assert.equal(app.render().sourceNotice, null)
  assert.equal(app.render().error, null)
})

test('tickets display before slow name enrichment completes', async () => {
  let finishNames
  const names = new Promise((resolve) => { finishNames = resolve })
  const app = setup(undefined, [], () => names)
  await app.render().refresh()
  assert.equal(app.render().loading, false)
  assert.equal(app.render().items[0].idpeticion, 'live')
  finishNames([{ idpeticion: 'live', clienteNombre: 'Cliente' }])
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(app.render().items[0].clienteNombre, 'Cliente')
  assert.equal(app.render().sourceNotice, null)
})

test('failed name enrichment keeps live tickets and never falls back to the saved copy', async () => {
  const app = setup(undefined, [{ idpeticion: 'old' }], async () => { throw new Error('Calendar unavailable') })
  await app.render().refresh()
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(app.render().items[0].idpeticion, 'live')
  assert.equal(app.render().error, null)
  assert.equal(app.render().sourceNotice, null)
})

test('automatic refresh reuses fresh data while manual refresh requests new data', async () => {
  const app = setup()
  await app.render().refresh()
  await app.render().refreshSilent()
  assert.equal(app.requests(), 1)
  await app.render().refresh()
  assert.equal(app.requests(), 2)
})

test('late names from an earlier refresh cannot overwrite newer data', async () => {
  let finishOld
  let calls = 0
  const old = new Promise((resolve) => { finishOld = resolve })
  const app = setup(undefined, [], () => ++calls === 1 ? old : Promise.resolve([{ idpeticion: 'live', clienteNombre: 'Nuevo' }]))
  await app.render().refresh()
  await app.render().refresh()
  await new Promise((resolve) => setTimeout(resolve, 0))
  finishOld([{ idpeticion: 'live', clienteNombre: 'Antiguo' }])
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(app.render().items[0].clienteNombre, 'Nuevo')
})

test('real data loader skips the calendar on first paint and name merging preserves edits', async () => {
  let calendarCalls = 0
  const api = load('lib/peticionesPendientes', {
    './supabase': {}, './supabaseFetchAll': {}, './licenciaGrupo': {},
    './ticketClient': load('lib/ticketClient'),
    './sqlServerApi': {
      isSqlServerPeticionesSource: () => true,
      sqlFetchPendingPeticiones: async () => [{ idpeticion: 'one', caller: '612345678', gestionado: false }],
      sqlFetchCitas: async () => { calendarCalls++; return [{ idcita: 'cita', nombre: 'Ana', movil: '612345678' }] },
    },
  })
  const rows = await api.fetchPendingPeticiones(['workshop'], {}, { includeClientNames: false })
  assert.equal(calendarCalls, 0)
  const enriched = await api.enrichPeticionClientNames(rows, ['workshop'])
  assert.equal(calendarCalls, 1)
  const edited = [{ ...rows[0], gestionado: true, gestionobservaciones: 'Editado mientras cargaba' }]
  const merged = api.mergePeticionClientNames(edited, enriched)
  assert.equal(merged[0].clienteNombre, 'Ana')
  assert.equal(merged[0].gestionado, true)
  assert.equal(merged[0].gestionobservaciones, 'Editado mientras cargaba')
  await api.enrichPeticionClientNames(merged, ['workshop'])
  assert.equal(calendarCalls, 1)
})

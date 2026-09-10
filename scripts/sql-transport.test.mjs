import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
function setup(responses) {
  let count = 0
  const exports = {}
  const { outputText } = ts.transpileModule(readFileSync(new URL('../src/lib/sqlTransport.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } })
  vm.runInNewContext(outputText, { exports, setTimeout: (fn) => setTimeout(fn, 0), fetch: async () => {
    const result = responses[Math.min(count++, responses.length - 1)]
    if (result instanceof Error) throw result
    return result.clone()
  } })
  return { run: exports.fetchSqlResponse, count: () => count }
}
test('recovers from the empty 500 produced while the API restarts', async () => {
  const app = setup([new Response('', { status: 500 }), new Response('[]')])
  assert.equal((await app.run('/api/talleres/resolve')).status, 200)
  assert.equal(app.count(), 2)
})
test('outage retries are bounded and preserve the final error response', async () => {
  const app = setup([new Response('{"error":"API unavailable"}', { status: 503 })])
  assert.equal((await app.run('/api/peticiones-pendientes')).status, 503)
  assert.equal(app.count(), 3)
})
test('does not retry authentication failures, JSON SQL errors or writes', async () => {
  for (const status of [401, 403, 500]) {
    const app = setup([new Response('{}', { status, headers: { 'Content-Type': 'application/json' } })])
    assert.equal((await app.run('/api/test')).status, status)
    assert.equal(app.count(), 1)
  }
  const write = setup([new Response('', { status: 503 })])
  await write.run('/api/peticiones/id/gestion', { method: 'PATCH' })
  assert.equal(write.count(), 1)
})
test('network errors recover, but aborted requests stop immediately', async () => {
  const app = setup([new TypeError('fetch failed'), new Response('[]')])
  assert.equal((await app.run('/api/test')).status, 200)
  const aborted = setup([new TypeError('aborted')])
  await assert.rejects(aborted.run('/api/test', { signal: AbortSignal.abort() }))
  assert.equal(aborted.count(), 1)
})

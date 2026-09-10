import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

// Execute the actual TypeScript clients with an isolated, mocked Auth service.
function setup({ token = 'old-token', valid = false, refreshError, fetchStatus = 200 } = {}) {
  let currentToken = token
  const calls = { refresh: 0, signOut: 0, fetch: 0 }
  const auth = {
    getSession: async () => ({ data: { session: currentToken ? { access_token: currentToken } : null } }),
    getUser: async () => valid
      ? { data: { user: { id: 'user' } }, error: null }
      : { data: { user: null }, error: { status: 401 } },
    refreshSession: async () => {
      calls.refresh++
      await Promise.resolve()
      if (refreshError) return { data: { session: null }, error: refreshError }
      currentToken = 'new-token'
      return { data: { session: { access_token: currentToken } }, error: null }
    },
    signOut: async ({ scope }) => {
      assert.equal(scope, 'local')
      calls.signOut++
      currentToken = null
      return { error: null }
    },
  }
  const modules = { './supabase': { supabase: { auth } } }
  const fetch = async (_input, init) => {
    calls.fetch++
    assert.ok(init.headers.get('Authorization'))
    const status = init.headers.get('Authorization') === 'Bearer new-token' ? 200 : fetchStatus
    return new Response(JSON.stringify(status === 401 ? { error: 'Sesión no válida', code: 'invalid-token' } : []), { status })
  }
  function load(file) {
    const source = readFileSync(new URL(`../src/lib/${file}.ts`, import.meta.url), 'utf8')
      .replaceAll('import.meta.env', '({})')
    const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } })
    const exports = {}
    vm.runInNewContext(outputText, {
      exports, require: (name) => {
        assert.ok(modules[name], `Unexpected import: ${name}`)
        return modules[name]
      },
      Headers, URL, URLSearchParams, fetch, setTimeout,
    }, { filename: `${file}.js` })
    return exports
  }
  modules['./sqlTransport'] = load('sqlTransport')
  const guard = load('sessionGuard')
  modules['./sessionGuard'] = guard
  return { guard, sql: load('sqlServerApi'), auth, calls }
}

test('missing session stops locally without a request or refresh', async () => {
  const { guard, sql, calls } = setup({ token: null })
  assert.equal(await guard.handleExpiredSession(), false)
  await assert.rejects(sql.sqlFetchTiposPeticion(), { code: 'session-expired' })
  assert.deepEqual(calls, { refresh: 0, signOut: 0, fetch: 0 })
})

test('valid Supabase session rejected by backend is not refreshed or retried', async () => {
  const { sql, calls } = setup({ valid: true, fetchStatus: 401 })
  await assert.rejects(sql.sqlFetchTiposPeticion(), { code: 'api-down' })
  assert.deepEqual(calls, { refresh: 0, signOut: 0, fetch: 1 })
})

test('concurrent and late 401 responses share the renewed token', async () => {
  const { guard, calls } = setup()
  const results = await Promise.all(Array.from({ length: 5 }, () => guard.handleExpiredSession('old-token')))
  assert.ok(results.every(Boolean))
  assert.equal(await guard.handleExpiredSession('old-token'), true)
  assert.equal(calls.refresh, 1)
})

test('SQL request retries once with the renewed token', async () => {
  const { sql, calls } = setup({ fetchStatus: 401 })
  assert.deepEqual(await sql.sqlFetchTiposPeticion(), [])
  assert.deepEqual(calls, { refresh: 1, signOut: 0, fetch: 2 })
})

test('revoked refresh token signs out and stops subsequent requests', async () => {
  const { sql, calls } = setup({ fetchStatus: 401, refreshError: { code: 'refresh_token_not_found', status: 400 } })
  await assert.rejects(sql.sqlFetchTiposPeticion(), { code: 'session-expired' })
  await assert.rejects(sql.sqlFetchTiposPeticion(), { code: 'session-expired' })
  assert.deepEqual(calls, { refresh: 1, signOut: 1, fetch: 1 })
})

test('temporary refresh failure preserves the session', async () => {
  const { sql, calls } = setup({ fetchStatus: 401, refreshError: { status: 503 } })
  await assert.rejects(sql.sqlFetchTiposPeticion(), { code: 'api-down' })
  assert.equal(calls.signOut, 0)
  assert.equal(calls.fetch, 1)
})

test('temporary identity validation failure preserves the session', async () => {
  const { sql, auth, calls } = setup({ fetchStatus: 401 })
  auth.getUser = async () => ({ data: { user: null }, error: { status: 503 } })
  await assert.rejects(sql.sqlFetchTiposPeticion(), { code: 'api-down' })
  assert.deepEqual(calls, { refresh: 0, signOut: 0, fetch: 1 })
})

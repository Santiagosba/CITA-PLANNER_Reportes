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

const avi = load('lib/aviAdminGate')
const access = load('lib/crmAccess', {
  './aviAdminGate': avi,
  '../types': {},
})

test('santy is super admin and can browse all workshops', () => {
  const santy = { email: 'santy@gmail.com', app_metadata: { role: 'aviadmin' } }
  assert.equal(access.isSuperAdminUser(santy), true)
  assert.equal(access.isTallerAdminUser(santy), true)
})

test('santy stays super admin even without aviadmin metadata', () => {
  const santy = { email: 'santy@gmail.com', app_metadata: { role: 'admin' } }
  assert.equal(access.isSuperAdminUser(santy), true)
})

test('santy is super admin when email is only in identities', () => {
  const santy = {
    identities: [{ identity_data: { email: 'santy@gmail.com' } }],
    app_metadata: { role: 'admin' },
  }
  assert.equal(access.isSuperAdminUser(santy), true)
})

test('a cloned taller admin is not super admin', () => {
  const admin = {
    email: 'admin.gamboa@taller.prueba',
    app_metadata: {
      role: 'taller_admin',
      crm_idtalleres: ['95e412d7-08b3-46f8-8128-0a52bf409bc3'],
    },
  }
  assert.equal(access.isSuperAdminUser(admin), false)
  assert.equal(access.isTallerAdminUser(admin), true)
})

test('generic app_metadata.admin is not a super admin', () => {
  const admin = { email: 'jefe@taller.es', app_metadata: { role: 'admin' } }
  assert.equal(access.isSuperAdminUser(admin), false)
  assert.equal(access.isTallerAdminUser(admin), true)
})

test('an advisor only keeps the assigned operational workshop', () => {
  const user = {
    email: 'asesor@taller.prueba',
    app_metadata: { role: 'asesor', crm_idtalleres: ['95e412d7-08b3-46f8-8128-0a52bf409bc3'] },
  }
  assert.equal(access.isSuperAdminUser(user), false)
  assert.equal(access.isTallerAdminUser(user), false)
  const workshops = [
    { id: 'supra', originalId: '95e412d7-08b3-46f8-8128-0a52bf409bc3', containerIdTaller: 'e6f001b2-2501-42f7-888c-bd96a02d4ee1', name: 'Supra Gamboa', source: 'aviold' },
    { id: 'kia', originalId: '7980cd72-d2bb-493f-ace5-0b3210843ae2', containerIdTaller: 'e6f001b2-2501-42f7-888c-bd96a02d4ee1', name: 'Gamboa Ventas KIA', source: 'aviold' },
  ]
  const scoped = access.filterWorkshopsForUser(workshops, user)
  assert.equal(scoped.length, 1)
  assert.equal(scoped[0].name, 'Supra Gamboa')
})

test('a license admin keeps every workshop of the group', () => {
  const user = {
    email: 'carlos@gmail.com',
    app_metadata: {
      role: 'taller_admin',
      crm_idtalleres: ['95e412d7-08b3-46f8-8128-0a52bf409bc3'],
    },
  }
  assert.equal(access.isLicenseAdminUser(user), true)
  const workshops = [
    { id: 'supra', originalId: '95e412d7-08b3-46f8-8128-0a52bf409bc3', containerIdTaller: 'e6f001b2-2501-42f7-888c-bd96a02d4ee1', name: 'Supra Gamboa', source: 'aviold' },
    { id: 'kia', originalId: '7980cd72-d2bb-493f-ace5-0b3210843ae2', containerIdTaller: 'e6f001b2-2501-42f7-888c-bd96a02d4ee1', name: 'Gamboa Ventas KIA', source: 'aviold' },
  ]
  const scoped = access.filterWorkshopsForUser(workshops, user)
  assert.equal(scoped.length, 2)
})

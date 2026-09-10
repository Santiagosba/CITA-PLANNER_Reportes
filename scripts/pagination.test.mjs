import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
const require = createRequire(import.meta.url)
function load(file, modules = {}) {
  const source = readFileSync(new URL('../src/' + file, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } })
  const exports = {}
  vm.runInNewContext(outputText, { exports, require: (name) => modules[name] ?? require(name) })
  return exports
}
const paging = load('lib/pageBounds.ts')
const Pager = load('components/PaginatedItems.tsx', { '../lib/pageBounds': paging }).default
test('a 10000-ticket list mounts only 50 rows and exposes the full count', () => {
  const items = Array.from({ length: 10000 }, (_, id) => id)
  let mounted = 0
  const html = renderToStaticMarkup(React.createElement(Pager, { items, label: 'Historial', resetKey: 'taller' }, (visible) => {
    mounted = visible.length
    return React.createElement('ul', null, visible.map((id) => React.createElement('li', { key: id }, 'Ticket ' + id)))
  }))
  assert.equal(mounted, 50)
  assert.equal((html.match(/<li>/g) ?? []).length, 50)
  assert.match(html, /10000/)
  assert.match(html, /Siguiente/)
})
test('all records remain reachable without duplicates including the last partial page', () => {
  const rows = Array.from({ length: 123 }, (_, id) => id)
  const all = []
  for (let i = 0; i < paging.pageBounds(rows.length, 0).pages; i++) {
    const p = paging.pageBounds(rows.length, i)
    all.push(...rows.slice(p.start, p.end))
  }
  assert.deepEqual(all, rows)
  assert.equal(paging.pageBounds(123, 99).start, 100)
  assert.equal(paging.pageBounds(0, 99).end, 0)
})

import fs from 'node:fs'
import path from 'node:path'
import postcss from 'postcss'

const cssPath = 'src/styles/avi-crm.css'
const css = fs.readFileSync(cssPath, 'utf8')

function walkFiles(dir, acc = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    if (fs.statSync(full).isDirectory()) walkFiles(full, acc)
    else if (/\.(tsx?|jsx?|html)$/.test(name)) acc.push(full)
  }
  return acc
}

const files = walkFiles('src')
if (fs.existsSync('index.html')) files.push('index.html')
const source = files.map((file) => fs.readFileSync(file, 'utf8')).join('\n')

const used = new Set()
for (const match of source.matchAll(/['"`]([^'"`]*?)['"`]/g)) {
  for (const token of match[1].split(/[\s./]+/)) {
    if (/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(token)) used.add(token)
  }
}
for (const match of source.matchAll(/class(?:Name)?=\{?[`'"]([^`'"]+)[`'"]/g)) {
  for (const token of match[1].split(/\s+/)) used.add(token)
}

const dynamicPrefixes = new Set(['is-', 'tone-', 'kind-', 'app-', 'edge-', 'lg-', 'dir-', 'phase-', 'pl-'])
for (const match of source.matchAll(/[`'"]([a-zA-Z][a-zA-Z0-9_-]*)\$\{/g)) {
  dynamicPrefixes.add(match[1])
}

const cssClasses = new Set()
for (const match of css.matchAll(/\.([a-zA-Z][a-zA-Z0-9_-]*)/g)) cssClasses.add(match[1])

function isDynamic(name) {
  return [...dynamicPrefixes].some((prefix) => name.startsWith(prefix))
}

function selectorClasses(selector) {
  return [...selector.matchAll(/\.([a-zA-Z][a-zA-Z0-9_-]*)/g)].map((match) => match[1])
}

function selectorIsDead(selector) {
  const names = selectorClasses(selector)
  if (names.length === 0) return false
  return names.some((name) => !used.has(name) && !isDynamic(name))
}

const root = postcss.parse(css, { from: cssPath })
let removedRules = 0

root.walkRules((rule) => {
  const selectors = rule.selectors.filter((selector) => !selectorIsDead(selector))
  if (selectors.length === 0) {
    rule.remove()
    removedRules += 1
    return
  }
  if (selectors.length !== rule.selectors.length) rule.selectors = selectors
})

root.walkAtRules((atrule) => {
  if (atrule.name === 'media' || atrule.name === 'supports') {
    if (!atrule.nodes || atrule.nodes.length === 0) atrule.remove()
  }
})

const next = root.toResult({ annotation: false }).css.replace(/\n{3,}/g, '\n\n')
fs.writeFileSync(cssPath, next.endsWith('\n') ? next : `${next}\n`)

const before = css.split('\n').length
const after = next.split('\n').length
const dead = [...cssClasses].filter((name) => !used.has(name) && !isDynamic(name)).sort()
console.log(
  JSON.stringify(
    {
      beforeLines: before,
      afterLines: after,
      removedLines: before - after,
      removedRules,
      deadClasses: dead.length,
    },
    null,
    2,
  ),
)

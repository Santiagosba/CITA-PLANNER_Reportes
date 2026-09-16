import fs from 'node:fs'
import path from 'node:path'

const css = fs.readFileSync('src/styles/avi-crm.css', 'utf8')
const classes = new Set()
for (const match of css.matchAll(/\.([a-zA-Z][a-zA-Z0-9_-]*)/g)) {
  classes.add(match[1])
}

function walk(dir, acc = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    if (fs.statSync(full).isDirectory()) walk(full, acc)
    else if (/\.(tsx?|jsx?|html)$/.test(name)) acc.push(full)
  }
  return acc
}

const files = walk('src')
if (fs.existsSync('index.html')) files.push('index.html')
const source = files.map((file) => fs.readFileSync(file, 'utf8')).join('\n')

const unused = [...classes].filter((name) => !source.includes(name)).sort()
console.log(
  JSON.stringify(
    {
      classes: classes.size,
      unused: unused.length,
      used: classes.size - unused.length,
    },
    null,
    2,
  ),
)
fs.writeFileSync('scripts/.unused-css-classes.txt', unused.join('\n'))
console.log(unused.slice(0, 120).join('\n'))

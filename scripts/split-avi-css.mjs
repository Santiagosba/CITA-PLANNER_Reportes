import fs from 'node:fs'

const src = fs.readFileSync('src/styles/avi-crm.css', 'utf8')
const lines = src.split('\n')

const slices = [
  {
    file: 'src/styles/avi-crm.css',
    from: 1,
    to: 365,
    prefix: '/* AVI CRM — tokens, reset y cristal. El resto está en styles/features/. */\n',
  },
  {
    file: 'src/styles/features/shell.css',
    from: 366,
    to: 2923,
    prefix: '/* Shell: sidebar, workspace, logo y matrícula. */\n',
  },
  {
    file: 'src/styles/features/ops.css',
    from: 2924,
    to: 4901,
    prefix: '/* Dashboard, triage y calendario. */\n',
  },
  {
    file: 'src/styles/features/boards.css',
    from: 4902,
    to: 5998,
    prefix: '/* Gestor de tableros. */\n',
  },
  {
    file: 'src/styles/features/lead-os.css',
    from: 5999,
    to: 12866,
    prefix: '/* Ficha, teléfono, barra de tareas y liquid glass. */\n',
  },
  {
    file: 'src/styles/features/desks.css',
    from: 12867,
    to: lines.length,
    prefix: '/* Laura, equipos, licencias y selector de grupo. */\n',
  },
]

fs.mkdirSync('src/styles/features', { recursive: true })

for (const slice of slices) {
  const body = lines.slice(slice.from - 1, slice.to).join('\n').replace(/\n{3,}/g, '\n\n').trim()
  fs.writeFileSync(slice.file, `${slice.prefix}\n${body}\n`)
  console.log(slice.file, fs.readFileSync(slice.file, 'utf8').split('\n').length)
}

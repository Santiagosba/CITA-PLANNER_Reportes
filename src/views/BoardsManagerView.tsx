import {
  Car,
  GripVertical,
  Package,
  Plus,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Wrench,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import ApiStatusBanner from '../components/ApiStatusBanner'
import { HexLoaderScreen } from '../components/ui/HexLoader'
import VehiclePlate from '../components/ui/VehiclePlate'
import { resolveDateRange } from '../lib/dateRangePresets'
import { formatFecha, isPeticionPendiente, type PeticionPendiente } from '../lib/peticionesPendientes'
import { useOperationalData } from '../hooks/useOperationalData'
import type { Workshop } from '../types'

type DepartmentId = 'mechanics' | 'bodywork' | 'insurance' | 'parts' | 'sales'
type PriorityId = 'urgente' | 'alta' | 'media' | 'baja' | 'hecho'
type OrderMap = Record<string, string[]>

type Department = {
  id: DepartmentId
  label: string
  description: string
  icon: LucideIcon
  keywords: string[]
}

type PriorityColumn = {
  id: PriorityId
  label: string
  hint: string
  tone: 'danger' | 'warning' | 'brand' | 'muted' | 'positive'
}

type ManualEntry = {
  id: string
  departmentId: DepartmentId
  priority: PriorityId
  title: string
  phone: string
  note: string
  createdAt: string
}

type BoardCard =
  | { kind: 'peticion'; item: PeticionPendiente }
  | { kind: 'manual'; entry: ManualEntry }

type PriorityMap = Record<string, PriorityId>

type DragLive = {
  id: string
  card: BoardCard
  fromCol: PriorityId
  height: number
  width: number
  grabX: number
  grabY: number
}

type HoverSlot = { col: PriorityId; index: number }

const DEPARTMENTS: Department[] = [
  {
    id: 'mechanics',
    label: 'Mecánica & Diagnosis',
    description: 'Mantenimientos oficiales, diagnosis electrónica, motores y alta tensión EV',
    icon: Wrench,
    keywords: ['mec', 'revisi', 'diagn', 'aver', 'motor', 'manten', 'aceite', 'itv', 'ev', 'híbrid', 'hibrid'],
  },
  {
    id: 'bodywork',
    label: 'Carrocería & Pintura',
    description: 'Reparación de chapa, bancadas rápidas, sustitución de lunas y pintura en cabina',
    icon: Car,
    keywords: ['chapa', 'pint', 'carrocer', 'golpe', 'cristal', 'luna', 'lunas', 'bancada'],
  },
  {
    id: 'insurance',
    label: 'Peritaje de Seguros',
    description: 'Apertura de siniestros, fotoperitaciones y acuerdos Mapfre, Mutua, Allianz',
    icon: ShieldCheck,
    keywords: ['seguro', 'perit', 'siniestro', 'mapfre', 'mutua', 'allianz', 'foto'],
  },
  {
    id: 'parts',
    label: 'Recambios & Flotas',
    description: 'Pedidos de piezas originales OEM, consumibles y mantenimiento de flotas',
    icon: Package,
    keywords: ['recambio', 'pieza', 'neum', 'flota', 'oem', 'consumible', 'pedido'],
  },
  {
    id: 'sales',
    label: 'Ventas VN / VO',
    description: 'Tasación de vehículo usado, renovación comercial y pruebas dinámicas',
    icon: ShoppingBag,
    keywords: ['venta', 'vehículo', 'vehiculo', 'ocasión', 'ocasion', 'tasac', 'vn', 'vo', 'usado'],
  },
]

const COLUMNS: PriorityColumn[] = [
  { id: 'urgente', label: 'Urgente', hint: 'Atender ya', tone: 'danger' },
  { id: 'alta', label: 'Alta', hint: 'Hoy / mañana', tone: 'warning' },
  { id: 'media', label: 'Media', hint: 'En cola', tone: 'brand' },
  { id: 'baja', label: 'Baja', hint: 'Cuando se pueda', tone: 'muted' },
  { id: 'hecho', label: 'Hecho', hint: 'Resuelto', tone: 'positive' },
]

const LIFT_PX = 6

type Props = {
  workshop: Workshop
}

function priorityKey(workshopId: string) {
  return `avi_board_priority_${workshopId}`
}

function manualKey(workshopId: string) {
  return `avi_board_manual_${workshopId}`
}

function orderKey(workshopId: string) {
  return `avi_board_order_${workshopId}`
}

function colOrderKey(dept: DepartmentId, col: PriorityId) {
  return `${dept}:${col}`
}

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function saveJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* ignore */
  }
}

function detectDepartment(item: PeticionPendiente): DepartmentId {
  const text = `${item.tipopeticion || ''} ${item.descripcion || ''}`.toLowerCase()
  const hit = DEPARTMENTS.find((department) =>
    department.keywords.some((keyword) => text.includes(keyword)),
  )
  return hit?.id ?? 'mechanics'
}

function defaultPriority(item: PeticionPendiente): PriorityId {
  if (!isPeticionPendiente(item)) return 'hecho'
  if (item.gestionado) return 'media'
  const text = `${item.tipopeticion || ''} ${item.descripcion || ''}`.toLowerCase()
  if (/urgent|aver[ií]a|siniestro|remolc|no arranca|parado/.test(text)) return 'urgente'
  if (/cita|mec[aá]nic|revisi[oó]n|perit/.test(text)) return 'alta'
  return 'media'
}

function badgeTone(tone: PriorityColumn['tone']): string {
  switch (tone) {
    case 'danger':
      return 'tone-negative'
    case 'warning':
      return 'tone-warning'
    case 'positive':
      return 'tone-positive'
    case 'muted':
      return 'tone-muted'
    default:
      return 'tone-neutral'
  }
}

function cardId(card: BoardCard): string {
  return card.kind === 'peticion' ? card.item.idpeticion : card.entry.id
}

function cardTime(card: BoardCard): string {
  return card.kind === 'peticion' ? card.item.fechainicio ?? '' : card.entry.createdAt
}

function applyOrder(cards: BoardCard[], order: string[] | undefined): BoardCard[] {
  if (!cards.length) return []
  const byId = new Map(cards.map((card) => [cardId(card), card]))
  const seen = new Set<string>()
  const next: BoardCard[] = []
  for (const id of order ?? []) {
    const card = byId.get(id)
    if (!card) continue
    next.push(card)
    seen.add(id)
  }
  const rest = cards.filter((card) => !seen.has(cardId(card)))
  rest.sort((a, b) => String(cardTime(b)).localeCompare(String(cardTime(a))))
  return [...next, ...rest]
}

function insertId(ids: string[], id: string, index: number): string[] {
  const next = ids.filter((item) => item !== id)
  next.splice(Math.max(0, Math.min(index, next.length)), 0, id)
  return next
}

function liveCards(list: HTMLElement): HTMLElement[] {
  return [...list.querySelectorAll<HTMLElement>('[data-card-id]:not(.is-dragging-source)')]
}

function hitHover(clientX: number, clientY: number, current: HoverSlot | null): HoverSlot | null {
  const columns = document.querySelectorAll<HTMLElement>('[data-kanban-col]')
  for (const column of columns) {
    const rect = column.getBoundingClientRect()
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
      continue
    }
    const list = column.querySelector<HTMLElement>('.kanban-cards')
    const col = column.dataset.kanbanCol as PriorityId
    if (!list) return { col, index: 0 }

    const slot = list.querySelector<HTMLElement>('.kanban-card-slot')
    if (slot) {
      const slotRect = slot.getBoundingClientRect()
      if (clientY >= slotRect.top && clientY <= slotRect.bottom) {
        return current?.col === col ? current : { col, index: current?.index ?? 0 }
      }
    }

    const cards = liveCards(list)
    let index = cards.length
    for (let i = 0; i < cards.length; i += 1) {
      const cardRect = cards[i].getBoundingClientRect()
      if (clientY < cardRect.top + cardRect.height / 2) {
        index = i
        break
      }
    }
    return { col, index }
  }
  return null
}

function ensureSlot(height: number): HTMLElement {
  let slot = document.querySelector<HTMLElement>('.kanban-card-slot.is-live')
  if (!slot) {
    slot = document.createElement('div')
    slot.className = 'kanban-card-slot is-live'
  }
  slot.style.height = `${height}px`
  return slot
}

function placeSlot(col: PriorityId, index: number, height: number) {
  const list = document.querySelector<HTMLElement>(`[data-kanban-col="${col}"] .kanban-cards`)
  if (!list) return
  const cards = liveCards(list)
  const slot = ensureSlot(height)
  const prev = new Map<HTMLElement, DOMRect>()
  cards.forEach((el) => prev.set(el, el.getBoundingClientRect()))

  const before = cards[index] ?? null
  if (before) list.insertBefore(slot, before)
  else list.appendChild(slot)

  cards.forEach((el) => {
    const beforeRect = prev.get(el)
    if (!beforeRect) return
    const after = el.getBoundingClientRect()
    const dy = beforeRect.top - after.top
    const dx = beforeRect.left - after.left
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return
    el.animate(
      [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
      { duration: 140, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    )
  })
}

function setDropColumn(col: PriorityId | null) {
  document.querySelectorAll<HTMLElement>('[data-kanban-col]').forEach((el) => {
    el.classList.toggle('is-drop-target', el.dataset.kanbanCol === col)
  })
}

function clearLiveDragDom() {
  document.querySelector('.kanban-card-slot.is-live')?.remove()
  document.querySelectorAll('.is-dragging-source').forEach((el) => el.classList.remove('is-dragging-source'))
  setDropColumn(null)
}

function BoardTicket({
  card,
  column,
  ghost,
  onPointerDown,
}: {
  card: BoardCard
  column: PriorityColumn
  ghost?: boolean
  onPointerDown?: (e: ReactPointerEvent<HTMLElement>) => void
}) {
  const id = cardId(card)
  const tone = badgeTone(column.tone)

  if (card.kind === 'manual') {
    const entry = card.entry
    return (
      <article
        data-card-id={ghost ? undefined : id}
        className={`kanban-card glass-inline glass-lite${ghost ? ' is-ghost' : ''}`}
        onPointerDown={onPointerDown}
      >
        <div className="kanban-card-top">
          <span className="kanban-drag-handle" aria-hidden>
            <GripVertical size={16} />
          </span>
          <span className="ops-feed-placeholder">MANUAL</span>
          <span className={`badge ${tone}`}>{column.label}</span>
        </div>
        <strong>{entry.title}</strong>
        {entry.phone ? <span className="kanban-card-meta">{entry.phone}</span> : null}
        {entry.note ? <p className="kanban-card-desc">{entry.note}</p> : null}
        <footer>
          <time>{formatFecha(entry.createdAt)}</time>
        </footer>
      </article>
    )
  }

  const item = card.item
  const cita = item.cita
  const customer = cita ? [cita.nombre, cita.apellidos].filter(Boolean).join(' ') : ''
  const title = customer || item.caller || 'Cliente sin identificar'
  const vehicle = cita ? [cita.marca, cita.modelo].filter(Boolean).join(' ') : ''

  return (
    <article
      data-card-id={ghost ? undefined : id}
      className={`kanban-card glass-inline glass-lite${ghost ? ' is-ghost' : ''}`}
      onPointerDown={onPointerDown}
    >
      <div className="kanban-card-top">
        <span className="kanban-drag-handle" aria-hidden>
          <GripVertical size={16} />
        </span>
        {cita?.matricula ? (
          <VehiclePlate value={cita.matricula} compact />
        ) : (
          <span className="ops-feed-placeholder">
            {cita ? 'SIN MATRÍCULA' : 'SIN CITA'}
          </span>
        )}
        <span className={`badge ${tone}`}>{column.label}</span>
      </div>
      <strong>{title}</strong>
      <span className="kanban-card-meta">
        {item.tipopeticion || 'Sin tipo'}
        {item.caller ? ` · ${item.caller}` : ''}
      </span>
      {vehicle ? <span className="kanban-card-meta">{vehicle}</span> : null}
      {item.descripcion ? <p className="kanban-card-desc">{item.descripcion}</p> : null}
      <footer>
        <time>{formatFecha(item.fechainicio)}</time>
      </footer>
    </article>
  )
}

export default function BoardsManagerView({ workshop }: Props) {
  const range = resolveDateRange('mes', '', '')
  const { items, loading, error, sourceNotice, refresh } = useOperationalData(workshop, range)
  const [activeDepartment, setActiveDepartment] = useState<DepartmentId>('mechanics')
  const [priorities, setPriorities] = useState<PriorityMap>(() => loadJson(priorityKey(workshop.id), {}))
  const [manualEntries, setManualEntries] = useState<ManualEntry[]>(() =>
    loadJson(manualKey(workshop.id), []),
  )
  const [orders, setOrders] = useState<OrderMap>(() => loadJson(orderKey(workshop.id), {}))
  const [drag, setDrag] = useState<DragLive | null>(null)
  const [showNewEntry, setShowNewEntry] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftPhone, setDraftPhone] = useState('')
  const [draftNote, setDraftNote] = useState('')

  const ghostRef = useRef<HTMLDivElement>(null)
  const lastPtrRef = useRef({ x: 0, y: 0 })
  const dragRef = useRef<DragLive | null>(null)
  const hoverRef = useRef<HoverSlot | null>(null)
  const rafRef = useRef(0)
  const pendingRef = useRef<{
    id: string
    card: BoardCard
    fromCol: PriorityId
    startX: number
    startY: number
    grabX: number
    grabY: number
    width: number
    height: number
  } | null>(null)
  const columnsRef = useRef<Record<PriorityId, BoardCard[]>>({
    urgente: [],
    alta: [],
    media: [],
    baja: [],
    hecho: [],
  })
  const deptRef = useRef(activeDepartment)
  const workshopIdRef = useRef(workshop.id)

  useEffect(() => {
    setPriorities(loadJson(priorityKey(workshop.id), {}))
    setManualEntries(loadJson(manualKey(workshop.id), []))
    setOrders(loadJson(orderKey(workshop.id), {}))
    workshopIdRef.current = workshop.id
  }, [workshop.id])

  const grouped = useMemo(() => {
    const map: Record<DepartmentId, PeticionPendiente[]> = {
      mechanics: [],
      bodywork: [],
      insurance: [],
      parts: [],
      sales: [],
    }
    for (const item of items) map[detectDepartment(item)].push(item)
    return map
  }, [items])

  const active = DEPARTMENTS.find((department) => department.id === activeDepartment)!
  const ActiveIcon = active.icon

  const departmentCounts = useMemo(() => {
    const counts: Record<DepartmentId, number> = {
      mechanics: 0,
      bodywork: 0,
      insurance: 0,
      parts: 0,
      sales: 0,
    }
    for (const department of DEPARTMENTS) {
      counts[department.id] =
        grouped[department.id].length +
        manualEntries.filter((entry) => entry.departmentId === department.id).length
    }
    return counts
  }, [grouped, manualEntries])

  const columns = useMemo(() => {
    const buckets: Record<PriorityId, BoardCard[]> = {
      urgente: [],
      alta: [],
      media: [],
      baja: [],
      hecho: [],
    }

    for (const item of grouped[activeDepartment]) {
      const priority = priorities[item.idpeticion] ?? defaultPriority(item)
      buckets[priority].push({ kind: 'peticion', item })
    }

    for (const entry of manualEntries) {
      if (entry.departmentId !== activeDepartment) continue
      buckets[entry.priority].push({ kind: 'manual', entry })
    }

    for (const col of COLUMNS) {
      buckets[col.id] = applyOrder(buckets[col.id], orders[colOrderKey(activeDepartment, col.id)])
    }

    return buckets
  }, [grouped, activeDepartment, priorities, manualEntries, orders])

  useEffect(() => {
    columnsRef.current = columns
  }, [columns])

  useEffect(() => {
    deptRef.current = activeDepartment
  }, [activeDepartment])

  useEffect(() => {
    dragRef.current = drag
  }, [drag])

  useLayoutEffect(() => {
    if (!drag) {
      clearLiveDragDom()
      return
    }
    const source = document.querySelector<HTMLElement>(`[data-card-id="${drag.id}"]`)
    source?.classList.add('is-dragging-source')
    const startIndex = Math.max(
      0,
      columnsRef.current[drag.fromCol].findIndex((card) => cardId(card) === drag.id),
    )
    hoverRef.current = { col: drag.fromCol, index: startIndex }
    placeSlot(drag.fromCol, startIndex, drag.height)
    setDropColumn(drag.fromCol)
    moveGhost(lastPtrRef.current.x, lastPtrRef.current.y, drag)
  }, [drag])

  const placeCard = useCallback((id: string, to: PriorityId, index: number) => {
    const dept = deptRef.current
    const workshopId = workshopIdRef.current

    if (id.startsWith('manual-')) {
      setManualEntries((prev) => {
        const next = prev.map((entry) => (entry.id === id ? { ...entry, priority: to } : entry))
        saveJson(manualKey(workshopId), next)
        return next
      })
    } else {
      setPriorities((prev) => {
        const next = { ...prev, [id]: to }
        saveJson(priorityKey(workshopId), next)
        return next
      })
    }

    setOrders((prev) => {
      const next = { ...prev }
      for (const col of COLUMNS) {
        const key = colOrderKey(dept, col.id)
        let ids = columnsRef.current[col.id].map(cardId).filter((item) => item !== id)
        if (col.id === to) ids = insertId(ids, id, index)
        next[key] = ids
      }
      saveJson(orderKey(workshopId), next)
      return next
    })
  }, [])

  const moveGhost = (clientX: number, clientY: number, live: DragLive) => {
    const el = ghostRef.current
    if (!el) return
    el.style.width = `${live.width}px`
    el.style.transform = `translate3d(${clientX - live.grabX}px, ${clientY - live.grabY}px, 0)`
  }

  const endDrag = useCallback(() => {
    const live = dragRef.current
    const slot = hoverRef.current
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
    pendingRef.current = null
    if (live && slot) placeCard(live.id, slot.col, slot.index)
    dragRef.current = null
    hoverRef.current = null
    clearLiveDragDom()
    setDrag(null)
  }, [placeCard])

  useEffect(() => {
    const flushMove = () => {
      rafRef.current = 0
      const { x, y } = lastPtrRef.current
      const live = dragRef.current
      if (!live) return
      moveGhost(x, y, live)
      const next = hitHover(x, y, hoverRef.current)
      if (!next) return
      const cur = hoverRef.current
      if (cur && cur.col === next.col && cur.index === next.index) return
      hoverRef.current = next
      placeSlot(next.col, next.index, live.height)
      setDropColumn(next.col)
    }

    const onMove = (e: PointerEvent) => {
      lastPtrRef.current = { x: e.clientX, y: e.clientY }
      const pending = pendingRef.current
      if (pending && !dragRef.current) {
        if (Math.hypot(e.clientX - pending.startX, e.clientY - pending.startY) < LIFT_PX) return
        const live: DragLive = {
          id: pending.id,
          card: pending.card,
          fromCol: pending.fromCol,
          height: pending.height,
          width: pending.width,
          grabX: pending.grabX,
          grabY: pending.grabY,
        }
        pendingRef.current = null
        dragRef.current = live
        document.body.style.userSelect = 'none'
        document.body.style.cursor = 'move'
        setDrag(live)
        return
      }

      if (!dragRef.current) return
      e.preventDefault()
      if (!rafRef.current) rafRef.current = requestAnimationFrame(flushMove)
    }

    const onUp = () => {
      if (pendingRef.current) {
        pendingRef.current = null
        return
      }
      if (!dragRef.current) return
      endDrag()
    }

    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [endDrag])

  const startCardDrag = (
    e: ReactPointerEvent<HTMLElement>,
    card: BoardCard,
    fromCol: PriorityId,
  ) => {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    if (target.closest('button, a, input, textarea, select')) return
    const rect = e.currentTarget.getBoundingClientRect()
    lastPtrRef.current = { x: e.clientX, y: e.clientY }
    pendingRef.current = {
      id: cardId(card),
      card,
      fromCol,
      startX: e.clientX,
      startY: e.clientY,
      grabX: e.clientX - rect.left,
      grabY: e.clientY - rect.top,
      width: rect.width,
      height: rect.height,
    }
  }

  const openNewEntry = () => {
    setDraftTitle('')
    setDraftPhone('')
    setDraftNote('')
    setShowNewEntry(true)
  }

  const submitNewEntry = (e: FormEvent) => {
    e.preventDefault()
    const title = draftTitle.trim()
    if (!title) return
    const entry: ManualEntry = {
      id: `manual-${crypto.randomUUID()}`,
      departmentId: activeDepartment,
      priority: 'media',
      title,
      phone: draftPhone.trim(),
      note: draftNote.trim(),
      createdAt: new Date().toISOString(),
    }
    setManualEntries((prev) => {
      const next = [entry, ...prev]
      saveJson(manualKey(workshop.id), next)
      return next
    })
    setOrders((prev) => {
      const key = colOrderKey(activeDepartment, 'media')
      const next = { ...prev, [key]: insertId(prev[key] ?? columns.media.map(cardId), entry.id, 0) }
      saveJson(orderKey(workshop.id), next)
      return next
    })
    setShowNewEntry(false)
  }

  const ghostColumn = COLUMNS.find((col) => col.id === drag?.fromCol) ?? COLUMNS[2]

  return (
    <div className="dashboard-page boards-page">
      <header className="dashboard-header-top">
        <div>
          <p className="section-eyebrow">Flujos especializados</p>
          <h1 className="section-title">Gestor de tableros</h1>
          <p className="section-subtitle mt-1">
            Elige departamento y mueve las tarjetas según la prioridad del asesor.
          </p>
        </div>
        <button type="button" className="ghost-button" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </header>

      {error ? <ApiStatusBanner message={error} variant="error" /> : null}
      {sourceNotice && !error ? <ApiStatusBanner message={sourceNotice} variant="warning" /> : null}

      <nav className="department-tabs custom-scrollbar-light" aria-label="Departamentos">
        {DEPARTMENTS.map((department) => {
          const Icon = department.icon
          const selected = department.id === activeDepartment
          const count = departmentCounts[department.id]
          return (
            <button
              key={department.id}
              type="button"
              className={`department-tab glass glass-lite ${selected ? 'is-active' : ''}`}
              onClick={() => {
                setActiveDepartment(department.id)
                setShowNewEntry(false)
              }}
              aria-current={selected ? 'page' : undefined}
            >
              <span className="department-tab-count">
                {loading ? '—' : count} {count === 1 ? 'caso' : 'casos'}
              </span>
              <span className="department-tab-icon"><Icon size={18} /></span>
              <span className="department-tab-copy">
                <strong>{department.label}</strong>
                <small>{department.description}</small>
              </span>
            </button>
          )
        })}
      </nav>

      <section className="board-heading glass glass-lite">
        <div className="department-tab-icon"><ActiveIcon size={20} /></div>
        <div className="board-heading-copy">
          <p className="section-eyebrow">Tablero especializado</p>
          <h2 className="ops-card-title">{active.label}</h2>
          <p className="section-subtitle">{active.description}</p>
        </div>
        <button type="button" className="client-submit" onClick={openNewEntry}>
          <Plus size={16} />
          Nueva entrada para este departamento
        </button>
      </section>

      {showNewEntry ? (
        <form className="board-new-entry glass glass-lite" onSubmit={submitNewEntry}>
          <div className="board-new-entry-head">
            <h3>Nueva entrada · {active.label}</h3>
            <button type="button" className="ghost-button" onClick={() => setShowNewEntry(false)} aria-label="Cerrar">
              <X size={16} />
            </button>
          </div>
          <div className="board-new-entry-grid">
            <label className="field-label">
              Cliente / asunto
              <input
                className="field-input"
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                placeholder="Nombre o motivo"
                required
                autoFocus
              />
            </label>
            <label className="field-label">
              Teléfono
              <input
                className="field-input"
                value={draftPhone}
                onChange={(e) => setDraftPhone(e.target.value)}
                placeholder="+34…"
              />
            </label>
          </div>
          <label className="field-label">
            Nota
            <textarea
              className="field-input field-textarea"
              rows={3}
              value={draftNote}
              onChange={(e) => setDraftNote(e.target.value)}
              placeholder="Detalle para el departamento…"
            />
          </label>
          <div className="board-new-entry-actions">
            <button type="button" className="ghost-button" onClick={() => setShowNewEntry(false)}>
              Cancelar
            </button>
            <button type="submit" className="client-submit">
              Añadir al tablero
            </button>
          </div>
        </form>
      ) : null}

      <div className={`kanban-grid custom-scrollbar-light${drag ? ' is-reordering' : ''}`} role="list">
        {COLUMNS.map((column) => {
          const cards = columns[column.id]
          const showEmpty = !loading && cards.length === 0

          return (
            <section
              key={column.id}
              data-kanban-col={column.id}
              className={`kanban-column glass glass-lite tone-${column.tone}`}
              aria-label={column.label}
            >
              <header>
                <div>
                  <h3>{column.label}</h3>
                  <p className="kanban-column-hint">{column.hint}</p>
                </div>
                <span>{loading ? '—' : cards.length}</span>
              </header>

              <div className="kanban-cards custom-scrollbar-light">
                {loading ? (
                  <HexLoaderScreen size="sm" label="Cargando…" className="kanban-hex-load" />
                ) : showEmpty ? (
                  <p className="section-subtitle ops-empty kanban-empty">
                    Suelta aquí las tarjetas de prioridad {column.label.toLowerCase()}.
                  </p>
                ) : (
                  cards.map((card) => (
                    <BoardTicket
                      key={cardId(card)}
                      card={card}
                      column={column}
                      onPointerDown={(e) => startCardDrag(e, card, column.id)}
                    />
                  ))
                )}
              </div>
            </section>
          )
        })}
      </div>

      {drag ? (
        <div ref={ghostRef} className="kanban-ghost-layer" aria-hidden>
          <BoardTicket card={drag.card} column={ghostColumn} ghost />
        </div>
      ) : null}
    </div>
  )
}

import {
  Car,
  GripVertical,
  Package,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Wrench,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  memo,
  useCallback,
  useEffect,
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
import { formatFecha, type PeticionPendiente } from '../lib/peticionesPendientes'
import { defaultBoardPriority, scoreManualUrgency, scoreTicketUrgency } from '../lib/ticketUrgency'
import TicketClientBlock from '../components/TicketClientBlock'
import { useOperationalData } from '../hooks/useOperationalData'
import { useAdvisorWorkspace } from '../hooks/useAdvisorWorkspace'
import { buildOwnerScopeContext, matchesOwnerScope, type OwnerScope } from '../lib/ownerScope'
import OwnerScopeFilter from '../components/OwnerScopeFilter'
import TicketOwnerPicker from '../components/TicketOwnerPicker'
import type { CrmAppRole } from '../lib/crmRoles'
import { boardsForTeam, personByEmail, teamForPerson, type AdvisorWorkspace } from '../lib/advisorWorkspace'
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
  currentUser: { name: string; email: string }
  appRole?: CrmAppRole
  onOpenLead?: (peticion: PeticionPendiente) => void
  refreshToken?: number
}

function priorityKey(workshopId: string) {
  return `avi_board_priority_v2_${workshopId}`
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
  return defaultBoardPriority(item)
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

function cardUrgency(card: BoardCard): number {
  if (card.kind === 'manual') {
    return scoreManualUrgency({
      title: card.entry.title,
      note: card.entry.note,
      createdAt: card.entry.createdAt,
    }).score
  }
  return scoreTicketUrgency(card.item).score
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
  rest.sort((a, b) => {
    const delta = cardUrgency(b) - cardUrgency(a)
    if (delta !== 0) return delta
    return String(cardTime(b)).localeCompare(String(cardTime(a)))
  })
  return [...next, ...rest]
}

function insertId(ids: string[], id: string, index: number): string[] {
  const next = ids.filter((item) => item !== id)
  next.splice(Math.max(0, Math.min(index, next.length)), 0, id)
  return next
}

const CARD_GAP = 10
const SLOT_STICK = 8

type CardGeom = {
  el: HTMLElement
  height: number
}

type ColGeom = {
  id: PriorityId
  el: HTMLElement
  list: HTMLElement
  left: number
  right: number
  top: number
  bottom: number
  listLeft: number
  stackTop: number
  cards: CardGeom[]
  slotIndex: number | null
}

type BoardDrag = {
  geoms: ColGeom[]
  slot: HTMLElement
  slotH: number
  dropCol: PriorityId | null
}

type FlipMove = { el: HTMLElement; dx: number; dy: number }

function measureBoard(root: HTMLElement, skipId?: string): ColGeom[] {
  const next: ColGeom[] = []
  root.querySelectorAll<HTMLElement>('[data-kanban-col]').forEach((column) => {
    const id = column.dataset.kanbanCol as PriorityId | undefined
    const list = column.querySelector<HTMLElement>('.kanban-cards')
    if (!id || !list) return
    const rect = column.getBoundingClientRect()
    const listRect = list.getBoundingClientRect()
    const cards: CardGeom[] = []
    for (const node of list.children) {
      if (!(node instanceof HTMLElement) || !node.dataset.cardId) continue
      if (skipId && node.dataset.cardId === skipId) continue
      if (node.classList.contains('is-dragging-source')) continue
      cards.push({ el: node, height: node.offsetHeight })
    }
    next.push({
      id,
      el: column,
      list,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      listLeft: listRect.left,
      stackTop: listRect.top + 2,
      cards,
      slotIndex: null,
    })
  })
  return next
}

function slotTop(col: ColGeom, slotIndex: number, slotH: number) {
  let y = col.stackTop
  for (let i = 0; i < slotIndex; i += 1) y += col.cards[i].height + CARD_GAP
  return y
}

function indexAtY(col: ColGeom, clientY: number, slotH: number, slotIndex: number | null): number {
  let y = col.stackTop
  for (let i = 0; i < col.cards.length; i += 1) {
    if (slotIndex === i) {
      if (clientY < y + slotH) return i
      y += slotH + CARD_GAP
    }
    if (clientY < y + col.cards[i].height / 2) return i
    y += col.cards[i].height + CARD_GAP
  }
  return col.cards.length
}

function hitHover(clientX: number, clientY: number, board: BoardDrag, current: HoverSlot | null): HoverSlot | null {
  for (const col of board.geoms) {
    if (clientX < col.left || clientX > col.right || clientY < col.top || clientY > col.bottom) {
      continue
    }
    if (current?.col === col.id && col.slotIndex !== null) {
      const hole = slotTop(col, col.slotIndex, board.slotH)
      if (clientY >= hole - SLOT_STICK && clientY <= hole + board.slotH + SLOT_STICK) {
        return current
      }
    }
    const index = indexAtY(col, clientY, board.slotH, col.slotIndex)
    if (current?.col === col.id && current.index === index) return current
    return { col: col.id, index }
  }
  return null
}

function playFlip(movers: FlipMove[]) {
  if (!movers.length) return
  for (const move of movers) {
    move.el.style.transition = 'none'
    move.el.style.transform = `translate3d(${move.dx}px, ${move.dy}px, 0)`
  }
  requestAnimationFrame(() => {
    for (const move of movers) {
      move.el.style.transition = ''
      move.el.style.transform = ''
    }
  })
}

function placeSlot(board: BoardDrag, col: PriorityId, index: number) {
  const dest = board.geoms.find((item) => item.id === col)
  if (!dest) return
  const origin = board.geoms.find((item) => item.slotIndex !== null) ?? dest
  if (dest.slotIndex === index && origin === dest) return

  const from = origin.slotIndex ?? 0
  const step = board.slotH + CARD_GAP
  const movers: FlipMove[] = []

  if (origin === dest) {
    for (let i = 0; i < dest.cards.length; i += 1) {
      let dy = 0
      if (from < index && i >= from && i < index) dy = step
      else if (index < from && i >= index && i < from) dy = -step
      if (dy) movers.push({ el: dest.cards[i].el, dx: 0, dy })
    }
    const dy = slotTop(dest, from, board.slotH) - slotTop(dest, index, board.slotH)
    if (dy) movers.push({ el: board.slot, dx: 0, dy })
  } else {
    for (let i = from; i < origin.cards.length; i += 1) {
      movers.push({ el: origin.cards[i].el, dx: 0, dy: step })
    }
    for (let i = index; i < dest.cards.length; i += 1) {
      movers.push({ el: dest.cards[i].el, dx: 0, dy: -step })
    }
    movers.push({
      el: board.slot,
      dx: origin.listLeft - dest.listLeft,
      dy: slotTop(origin, from, board.slotH) - slotTop(dest, index, board.slotH),
    })
    origin.bottom -= step
    dest.bottom += step
    origin.slotIndex = null
  }

  dest.slotIndex = index
  const before = dest.cards[index]?.el
  if (before) dest.list.insertBefore(board.slot, before)
  else dest.list.appendChild(board.slot)
  playFlip(movers)
}

function setDropColumn(board: BoardDrag, col: PriorityId | null) {
  if (board.dropCol === col) return
  for (const item of board.geoms) {
    if (item.id === board.dropCol) item.el.classList.remove('is-drop-target')
    if (item.id === col) item.el.classList.add('is-drop-target')
  }
  board.dropCol = col
}

function clearLiveDragDom(grid?: HTMLElement | null, board?: BoardDrag | null) {
  document.querySelector('.kanban-card-slot')?.remove()
  document.querySelector('.kanban-ghost-layer')?.remove()
  document.querySelectorAll('.is-dragging-source').forEach((el) => el.classList.remove('is-dragging-source'))
  document.querySelectorAll('.is-drop-target').forEach((el) => el.classList.remove('is-drop-target'))
  if (board) {
    for (const geom of board.geoms) {
      for (const card of geom.cards) {
        card.el.style.transition = ''
        card.el.style.transform = ''
      }
    }
  }
  grid?.classList.remove('is-reordering')
}

function spawnGhost(source: HTMLElement, live: DragLive): HTMLElement {
  const layer = document.createElement('div')
  layer.className = 'kanban-ghost-layer'
  layer.setAttribute('aria-hidden', 'true')
  const clone = source.cloneNode(true) as HTMLElement
  clone.removeAttribute('data-card-id')
  clone.classList.add('is-ghost')
  clone.style.width = `${live.width}px`
  layer.appendChild(clone)
  document.body.appendChild(layer)
  return layer
}

const BoardTicket = memo(function BoardTicket({
  card,
  column,
  ghost,
  onPointerDown,
  workshop,
  workspace,
  currentUser,
  appRole,
}: {
  card: BoardCard
  column: PriorityColumn
  ghost?: boolean
  onPointerDown?: (e: ReactPointerEvent<HTMLElement>) => void
  workshop: Workshop
  workspace: AdvisorWorkspace
  currentUser: { name: string; email: string }
  appRole: CrmAppRole
}) {
  const id = cardId(card)
  const tone = badgeTone(column.tone)

  if (card.kind === 'manual') {
    const entry = card.entry
    return (
      <article
        data-card-id={ghost ? undefined : id}
        className={`kanban-card${ghost ? ' is-ghost' : ''}`}
        onPointerDown={onPointerDown}
        role={ghost ? undefined : 'button'}
        title={ghost ? undefined : 'Abrir ficha en una ventana'}
      >
        <div className="kanban-card-top">
          <span className="kanban-drag-handle" aria-hidden>
            <GripVertical size={16} />
          </span>
          <span className="ops-feed-placeholder">MANUAL</span>
          <span className={`badge ${tone}`}>{column.label}</span>
        </div>
        <div className="ticket-client is-md">
          <p className="ticket-client-name">{entry.title}</p>
          <p className="ticket-client-phone">{entry.phone || 'Sin teléfono'}</p>
        </div>
        {entry.note ? <p className="kanban-card-desc">{entry.note}</p> : null}
        <footer>
          <time>{formatFecha(entry.createdAt)}</time>
          <span>Urgencia {scoreManualUrgency({ title: entry.title, note: entry.note, createdAt: entry.createdAt }).score}</span>
        </footer>
      </article>
    )
  }

  const item = card.item
  const cita = item.cita
  const vehicle = cita ? [cita.marca, cita.modelo].filter(Boolean).join(' ') : ''
  const urgency = scoreTicketUrgency(item)

  return (
    <article
      data-card-id={ghost ? undefined : id}
      className={`kanban-card${ghost ? ' is-ghost' : ''}`}
      onPointerDown={onPointerDown}
      role={ghost ? undefined : 'button'}
      title={ghost ? undefined : 'Abrir ficha en una ventana'}
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
      <TicketClientBlock peticion={item} size="md" />
      <span className="kanban-card-meta">{item.tipopeticion || 'Sin tipo'}</span>
      {vehicle ? <span className="kanban-card-meta">{vehicle}</span> : null}
      {item.descripcion ? <p className="kanban-card-desc">{item.descripcion}</p> : null}
      <TicketOwnerPicker
        workshop={workshop}
        workspace={workspace}
        currentUser={currentUser}
        appRole={appRole}
        peticion={item}
        compact
      />
      <footer>
        <time>{formatFecha(item.fechainicio)}</time>
        <span title={urgency.reasons.join(' · ') || 'Fórmula de urgencia'}>Urgencia {urgency.score}</span>
      </footer>
    </article>
  )
})

export default function BoardsManagerView({
  workshop,
  currentUser,
  appRole = 'asesor',
  onOpenLead,
  refreshToken = 0,
}: Props) {
  const range = resolveDateRange('mes', '', '')
  const { items, loading, error, sourceNotice, refresh } = useOperationalData(workshop, range)
  const workshopKey = workshop.containerIdTaller || workshop.id
  const { workspace } = useAdvisorWorkspace(workshopKey, currentUser, true)
  const [ownerScope, setOwnerScope] = useState<OwnerScope>(appRole === 'asesor' ? 'grupo' : 'todas')
  useEffect(() => {
    setOwnerScope(appRole === 'asesor' ? 'grupo' : 'todas')
  }, [appRole])
  const ownerCtx = useMemo(
    () => buildOwnerScopeContext(workspace, currentUser.email),
    [workspace, currentUser.email],
  )
  const visibleDepartments = useMemo(() => {
    if (appRole === 'admin') return DEPARTMENTS
    const me = personByEmail(workspace, currentUser.email)
    const team = me ? teamForPerson(workspace, me.id) : undefined
    if (!team) return DEPARTMENTS
    const allowed = new Set(boardsForTeam(workspace, team).map((item) => item.id))
    return DEPARTMENTS.filter((department) => allowed.has(department.id))
  }, [appRole, workspace, currentUser.email])
  const scopedItems = useMemo(
    () => items.filter((item) => matchesOwnerScope(item.gestionemail, ownerScope, ownerCtx)),
    [items, ownerScope, ownerCtx],
  )

  useEffect(() => {
    if (refreshToken > 0) void refresh()
  }, [refreshToken, refresh])
  const [activeDepartment, setActiveDepartment] = useState<DepartmentId>('mechanics')
  useEffect(() => {
    if (visibleDepartments.some((department) => department.id === activeDepartment)) return
    const first = visibleDepartments[0]
    if (first) setActiveDepartment(first.id)
  }, [visibleDepartments, activeDepartment])
  const [priorities, setPriorities] = useState<PriorityMap>(() => loadJson(priorityKey(workshop.id), {}))
  const [manualEntries, setManualEntries] = useState<ManualEntry[]>(() =>
    loadJson(manualKey(workshop.id), []),
  )
  const [orders, setOrders] = useState<OrderMap>(() => loadJson(orderKey(workshop.id), {}))
  const [showNewEntry, setShowNewEntry] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftPhone, setDraftPhone] = useState('')
  const [draftNote, setDraftNote] = useState('')

  const ghostLayerRef = useRef<HTMLElement | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const boardRef = useRef<BoardDrag | null>(null)
  const lastPtrRef = useRef({ x: 0, y: 0 })
  const dragRef = useRef<DragLive | null>(null)
  const hoverRef = useRef<HoverSlot | null>(null)
  const rafRef = useRef(0)
  const dragListenRef = useRef<{
    move: (e: PointerEvent) => void
    up: () => void
  } | null>(null)
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
    sourceEl: HTMLElement
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
    for (const item of scopedItems) map[detectDepartment(item)].push(item)
    return map
  }, [scopedItems])

  const active =
    visibleDepartments.find((department) => department.id === activeDepartment) ?? visibleDepartments[0] ?? DEPARTMENTS[0]
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
        manualEntries.filter(
          (entry) =>
            entry.departmentId === department.id && matchesOwnerScope(null, ownerScope, ownerCtx),
        ).length
    }
    return counts
  }, [grouped, manualEntries, ownerScope, ownerCtx])

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
      if (!matchesOwnerScope(null, ownerScope, ownerCtx)) continue
      buckets[entry.priority].push({ kind: 'manual', entry })
    }

    for (const col of COLUMNS) {
      buckets[col.id] = applyOrder(buckets[col.id], orders[colOrderKey(activeDepartment, col.id)])
    }

    return buckets
  }, [grouped, activeDepartment, priorities, manualEntries, orders, ownerScope, ownerCtx])

  useEffect(() => {
    columnsRef.current = columns
  }, [columns])

  useEffect(() => {
    deptRef.current = activeDepartment
  }, [activeDepartment])

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
    const el = ghostLayerRef.current
    if (!el) return
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
    ghostLayerRef.current = null
    const board = boardRef.current
    boardRef.current = null
    clearLiveDragDom(gridRef.current, board)
  }, [placeCard])

  const openCard = useCallback(
    (card: BoardCard) => {
      if (!onOpenLead) return
      if (card.kind === 'peticion') {
        onOpenLead(card.item)
        return
      }
      const entry = card.entry
      onOpenLead({
        idpeticion: entry.id,
        idtaller: workshop.id,
        descripcion: entry.note || null,
        idtipopeticion: null,
        tipopeticion: 'Tarea manual',
        fechainicio: entry.createdAt,
        fechafin: null,
        fechacreacion: entry.createdAt,
        caller: entry.phone || null,
        gestionado: null,
        gestionemail: null,
        gestionfecha: null,
        gestionobservaciones: entry.note || null,
        idcita: entry.id,
        cita: {
          idcita: entry.id,
          fecha: null,
          nombre: entry.title,
          apellidos: null,
          telefono: entry.phone || null,
          movil: null,
          email: null,
          matricula: null,
          marca: null,
          modelo: null,
          asunto: entry.note || null,
        },
      })
    },
    [onOpenLead, workshop.id],
  )
  const openCardRef = useRef(openCard)
  useEffect(() => {
    openCardRef.current = openCard
  }, [openCard])

  const detachDragListeners = useCallback(() => {
    const listeners = dragListenRef.current
    if (!listeners) return
    window.removeEventListener('pointermove', listeners.move)
    window.removeEventListener('pointerup', listeners.up)
    window.removeEventListener('pointercancel', listeners.up)
    dragListenRef.current = null
  }, [])

  const attachDragListeners = useCallback(() => {
    if (dragListenRef.current) return

    const flushMove = () => {
      rafRef.current = 0
      const { x, y } = lastPtrRef.current
      const live = dragRef.current
      if (!live) return
      moveGhost(x, y, live)
      const board = boardRef.current
      if (!board) return
      const next = hitHover(x, y, board, hoverRef.current)
      if (!next) return
      const cur = hoverRef.current
      if (cur && cur.col === next.col && cur.index === next.index) return
      hoverRef.current = next
      placeSlot(board, next.col, next.index)
      setDropColumn(board, next.col)
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
        const grid = gridRef.current
        const source = pending.sourceEl
        const list = source.closest<HTMLElement>('.kanban-cards')
        ghostLayerRef.current = spawnGhost(source, live)
        moveGhost(e.clientX, e.clientY, live)
        grid?.classList.add('is-reordering')
        const slot = document.createElement('div')
        slot.className = 'kanban-card-slot'
        slot.style.height = `${live.height}px`
        list?.insertBefore(slot, source)
        source.classList.add('is-dragging-source')
        const startIndex = Math.max(
          0,
          columnsRef.current[live.fromCol].findIndex((card) => cardId(card) === live.id),
        )
        const geoms = grid ? measureBoard(grid, live.id) : []
        const fromGeom = geoms.find((item) => item.id === live.fromCol)
        if (fromGeom) fromGeom.slotIndex = startIndex
        const board: BoardDrag = {
          geoms,
          slot,
          slotH: live.height,
          dropCol: null,
        }
        boardRef.current = board
        hoverRef.current = { col: live.fromCol, index: startIndex }
        setDropColumn(board, live.fromCol)
        return
      }

      if (!dragRef.current) return
      e.preventDefault()
      if (!rafRef.current) rafRef.current = requestAnimationFrame(flushMove)
    }

    const onUp = () => {
      const pending = pendingRef.current
      detachDragListeners()
      if (pending) {
        pendingRef.current = null
        openCardRef.current(pending.card)
        return
      }
      if (!dragRef.current) return
      endDrag()
    }

    dragListenRef.current = { move: onMove, up: onUp }
    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }, [detachDragListeners, endDrag])

  useEffect(
    () => () => {
      detachDragListeners()
      clearLiveDragDom(gridRef.current, boardRef.current)
    },
    [detachDragListeners],
  )

  const onGridPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    if (target.closest('button, a, input, textarea, select')) return
    const ticket = target.closest<HTMLElement>('[data-card-id]')
    const column = ticket?.closest<HTMLElement>('[data-kanban-col]')
    const col = column?.dataset.kanbanCol as PriorityId | undefined
    const id = ticket?.dataset.cardId
    if (!ticket || !col || !id) return
    const card = columnsRef.current[col].find((item) => cardId(item) === id)
    if (!card) return
    const rect = ticket.getBoundingClientRect()
    lastPtrRef.current = { x: e.clientX, y: e.clientY }
    pendingRef.current = {
      id,
      card,
      fromCol: col,
      startX: e.clientX,
      startY: e.clientY,
      grabX: e.clientX - rect.left,
      grabY: e.clientY - rect.top,
      width: rect.width,
      height: rect.height,
      sourceEl: ticket,
    }
    attachDragListeners()
  }, [attachDragListeners])

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

  return (
    <div className="dashboard-page boards-page">
      {error ? <ApiStatusBanner message={error} variant="error" /> : null}
      {sourceNotice && !error ? <ApiStatusBanner message={sourceNotice} variant="warning" /> : null}

      {visibleDepartments.length === 0 ? (
        <p className="section-subtitle">Tu equipo no tiene tableros. El admin los asigna en Equipos.</p>
      ) : null}

      <nav className="department-tabs custom-scrollbar-light" aria-label="Departamentos">
        {visibleDepartments.map((department) => {
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
          <OwnerScopeFilter value={ownerScope} onChange={setOwnerScope} />
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

      <div
        ref={gridRef}
        className="kanban-grid custom-scrollbar-light"
        role="list"
        onPointerDown={onGridPointerDown}
      >
        {COLUMNS.map((column) => {
          const cards = columns[column.id]
          const showEmpty = !loading && cards.length === 0

          return (
            <section
              key={column.id}
              data-kanban-col={column.id}
              className={`kanban-column tone-${column.tone}`}
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
                      workshop={workshop}
                      workspace={workspace}
                      currentUser={currentUser}
                      appRole={appRole}
                    />
                  ))
                )}
              </div>
            </section>
          )
        })}
      </div>

    </div>
  )
}

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
import { useCallback, useEffect, useMemo, useState, type DragEvent, type FormEvent } from 'react'
import ApiStatusBanner from '../components/ApiStatusBanner'
import VehiclePlate from '../components/ui/VehiclePlate'
import { resolveDateRange } from '../lib/dateRangePresets'
import { formatFecha, isPeticionPendiente, type PeticionPendiente } from '../lib/peticionesPendientes'
import { useOperationalData } from '../hooks/useOperationalData'
import type { Workshop } from '../types'

type DepartmentId = 'mechanics' | 'bodywork' | 'insurance' | 'parts' | 'sales'
type PriorityId = 'urgente' | 'alta' | 'media' | 'baja' | 'hecho'

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

type Props = {
  workshop: Workshop
}

function priorityKey(workshopId: string) {
  return `avi_board_priority_${workshopId}`
}

function manualKey(workshopId: string) {
  return `avi_board_manual_${workshopId}`
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

export default function BoardsManagerView({ workshop }: Props) {
  const range = resolveDateRange('mes', '', '')
  const { items, loading, error, sourceNotice, refresh } = useOperationalData(workshop, range)
  const [activeDepartment, setActiveDepartment] = useState<DepartmentId>('mechanics')
  const [priorities, setPriorities] = useState<PriorityMap>(() => loadJson(priorityKey(workshop.id), {}))
  const [manualEntries, setManualEntries] = useState<ManualEntry[]>(() =>
    loadJson(manualKey(workshop.id), []),
  )
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<PriorityId | null>(null)
  const [showNewEntry, setShowNewEntry] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftPhone, setDraftPhone] = useState('')
  const [draftNote, setDraftNote] = useState('')

  useEffect(() => {
    setPriorities(loadJson(priorityKey(workshop.id), {}))
    setManualEntries(loadJson(manualKey(workshop.id), []))
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
      buckets[col.id].sort((a, b) => {
        const da = a.kind === 'peticion' ? a.item.fechainicio : a.entry.createdAt
        const db = b.kind === 'peticion' ? b.item.fechainicio : b.entry.createdAt
        return String(db || '').localeCompare(String(da || ''))
      })
    }

    return buckets
  }, [grouped, activeDepartment, priorities, manualEntries])

  const knownIds = useMemo(() => {
    const set = new Set<string>()
    for (const item of grouped[activeDepartment]) set.add(item.idpeticion)
    for (const entry of manualEntries) {
      if (entry.departmentId === activeDepartment) set.add(entry.id)
    }
    return set
  }, [grouped, activeDepartment, manualEntries])

  const moveCard = useCallback(
    (id: string, to: PriorityId) => {
      if (id.startsWith('manual-')) {
        setManualEntries((prev) => {
          const next = prev.map((entry) =>
            entry.id === id ? { ...entry, priority: to } : entry,
          )
          saveJson(manualKey(workshop.id), next)
          return next
        })
        return
      }
      setPriorities((prev) => {
        const next = { ...prev, [id]: to }
        saveJson(priorityKey(workshop.id), next)
        return next
      })
    },
    [workshop.id],
  )

  const onDragStart = (e: DragEvent<HTMLElement>, id: string) => {
    e.dataTransfer.setData('text/peticion-id', id)
    e.dataTransfer.effectAllowed = 'move'
    setDraggingId(id)
  }

  const onDragEnd = () => {
    setDraggingId(null)
    setDropTarget(null)
  }

  const onDragOverColumn = (e: DragEvent<HTMLElement>, columnId: PriorityId) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropTarget(columnId)
  }

  const onDropColumn = (e: DragEvent<HTMLElement>, columnId: PriorityId) => {
    e.preventDefault()
    const id = e.dataTransfer.getData('text/peticion-id') || draggingId
    if (id && knownIds.has(id)) moveCard(id, columnId)
    setDraggingId(null)
    setDropTarget(null)
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
    setShowNewEntry(false)
  }

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

      <div className="kanban-grid custom-scrollbar-light" role="list">
        {COLUMNS.map((column) => (
          <section
            key={column.id}
            className={`kanban-column glass glass-lite tone-${column.tone} ${dropTarget === column.id ? 'is-drop-target' : ''}`}
            onDragOver={(e) => onDragOverColumn(e, column.id)}
            onDragLeave={() => setDropTarget((cur) => (cur === column.id ? null : cur))}
            onDrop={(e) => onDropColumn(e, column.id)}
            aria-label={column.label}
          >
            <header>
              <div>
                <h3>{column.label}</h3>
                <p className="kanban-column-hint">{column.hint}</p>
              </div>
              <span>{loading ? '—' : columns[column.id].length}</span>
            </header>

            <div className="kanban-cards custom-scrollbar-light">
              {loading ? (
                <p className="section-subtitle ops-empty">Cargando casos…</p>
              ) : columns[column.id].length === 0 ? (
                <p className="section-subtitle ops-empty kanban-empty">
                  Suelta aquí las tarjetas de prioridad {column.label.toLowerCase()}.
                </p>
              ) : (
                columns[column.id].map((card) => {
                  const id = cardId(card)
                  if (card.kind === 'manual') {
                    const entry = card.entry
                    return (
                      <article
                        key={id}
                        className={`kanban-card glass-inline glass-lite ${draggingId === id ? 'is-dragging' : ''}`}
                        draggable
                        onDragStart={(e) => onDragStart(e, id)}
                        onDragEnd={onDragEnd}
                      >
                        <div className="kanban-card-top">
                          <span className="kanban-drag-handle" aria-hidden>
                            <GripVertical size={16} />
                          </span>
                          <span className="ops-feed-placeholder">MANUAL</span>
                          <span className={`badge ${badgeTone(column.tone)}`}>{column.label}</span>
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
                  const customer = cita
                    ? [cita.nombre, cita.apellidos].filter(Boolean).join(' ')
                    : ''
                  const title = customer || item.caller || 'Cliente sin identificar'
                  const vehicle = cita
                    ? [cita.marca, cita.modelo].filter(Boolean).join(' ')
                    : ''

                  return (
                    <article
                      key={id}
                      className={`kanban-card glass-inline glass-lite ${draggingId === id ? 'is-dragging' : ''}`}
                      draggable
                      onDragStart={(e) => onDragStart(e, id)}
                      onDragEnd={onDragEnd}
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
                        <span className={`badge ${badgeTone(column.tone)}`}>{column.label}</span>
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
                })
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { Sparkles, Undo2 } from 'lucide-react'
import {
  isPersonOnTeam,
  isPersonPendingDelete,
  normalizeEmail,
  sortTicketsByOrder,
  type AdvisorPerson,
  type AdvisorTeam,
  type AdvisorWorkspace,
} from '../lib/advisorWorkspace'
import { TEAM_FILTER_LOOSE, ticketDropColumnId } from '../lib/teamScope'
import { planRandomTeamAssign, teamRepartirHint } from '../lib/ticketOwnerSuggest'
import { reassignTicketOwner } from '../lib/ticketOps'
import type { PeticionPendiente } from '../lib/peticionesPendientes'
import type { Workshop } from '../types'
import TeamTicketCard from './TeamTicketCard'

type Props = {
  workshop: Workshop
  workspace: AdvisorWorkspace
  currentUser: { name: string; email: string }
  teams: AdvisorTeam[]
  tickets: PeticionPendiente[]
  onAssignTeam: (peticionId: string, teamId: string | null) => void
  onPlaceTicket: (peticionId: string, teamId: string | null, index: number, siblings: string[]) => void
  onOpenTeam: (teamId: string) => void
}

type DragLive = {
  item: PeticionPendiente
  width: number
  grabX: number
  grabY: number
  source: HTMLElement
  sourceWrapper: HTMLElement | null
}

type PendingDrag = {
  item: PeticionPendiente
  source: HTMLElement
  startX: number
  startY: number
  grabX: number
  grabY: number
  width: number
}

type HoverSlot = { col: string; index: number }

type CardGeom = { el: HTMLElement }

type ColGeom = {
  id: string
  el: HTMLElement
  list: HTMLElement
  left: number
  right: number
  top: number
  bottom: number
  count: number
  cards: CardGeom[]
  slotIndex: number | null
}

type BoardDrag = {
  slot: HTMLElement
  geoms: ColGeom[]
}

const DRAG_START = 8
const CARD_H = 248
const STACK_OVERLAP = 72
const STRIDE = CARD_H - STACK_OVERLAP
const CARD_SLOT = 178
const CARD_GAP = 14
const SLOT_H = CARD_SLOT - CARD_GAP
const SLOT_STICK = 18
const VIEW_BUFFER = 3
const VIEW_MIN = 6

function isInteractive(target: EventTarget | null): boolean {
  const node = target as HTMLElement | null
  return Boolean(node?.closest('button, select, a, input, textarea, label, [role="listbox"]'))
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
}

function memberNames(people: AdvisorPerson[]): string {
  const names = people.map((person) => person.name.split(/\s+/)[0] || person.name)
  if (names.length === 0) return 'Nadie en este equipo'
  if (names.length <= 4) return names.join(' · ')
  return `${names.slice(0, 3).join(' · ')} y ${names.length - 3} más`
}

function peopleOfTeam(workspace: AdvisorWorkspace, team: AdvisorTeam): AdvisorPerson[] {
  return workspace.people.filter(
    (person) => !isPersonPendingDelete(person) && isPersonOnTeam(workspace, team, person.id, person.email),
  )
}

function measureBoard(root: HTMLElement, skipId?: string): ColGeom[] {
  const next: ColGeom[] = []
  root.querySelectorAll<HTMLElement>('[data-team-drop]').forEach((column) => {
    const id = column.dataset.teamDrop
    const list = column.querySelector<HTMLElement>('.team-drop-cards')
    if (!id || !list) return
    const rect = column.getBoundingClientRect()
    const host = list.querySelector<HTMLElement>(':scope > .team-drop-virtual') ?? list
    const cards: CardGeom[] = []
    for (const node of host.children) {
      if (!(node instanceof HTMLElement) || node.classList.contains('team-drop-slot')) continue
      const ticketId = node.dataset.ticketId
      if (!ticketId || (skipId && ticketId === skipId) || node.classList.contains('is-dragging-source')) continue
      cards.push({ el: node })
    }
    const parsed = Number(list.dataset.stackCount)
    next.push({
      id,
      el: column,
      list,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      count: Number.isFinite(parsed) ? parsed : cards.length,
      cards,
      slotIndex: null,
    })
  })
  return next
}

function ticketIndex(el: HTMLElement): number {
  const raw = Number(el.dataset.ticketIndex)
  return Number.isFinite(raw) ? raw : -1
}

function columnStride(list: HTMLElement): number {
  const raw = Number(list.dataset.stackStride)
  return Number.isFinite(raw) && raw > 20 ? raw : STRIDE
}

function indexAtY(col: ColGeom, clientY: number, slot: HTMLElement | null, slotIndex: number | null): number {
  if (slotIndex !== null && slot?.isConnected) {
    const hole = slot.getBoundingClientRect()
    if (clientY >= hole.top - SLOT_STICK && clientY <= hole.bottom + SLOT_STICK) return slotIndex
  }
  const stride = columnStride(col.list)
  if (col.cards.length === 0) {
    const y = clientY - col.list.getBoundingClientRect().top + col.list.scrollTop
    return Math.max(0, Math.min(col.count, Math.round(y / stride)))
  }
  const first = col.cards[0].el.getBoundingClientRect()
  const firstIdx = Math.max(0, ticketIndex(col.cards[0].el))
  if (clientY < first.top) {
    return Math.max(0, firstIdx - Math.round((first.top - clientY) / stride))
  }
  for (let i = 0; i < col.cards.length; i += 1) {
    const rect = col.cards[i].el.getBoundingClientRect()
    const next = col.cards[i + 1]?.el.getBoundingClientRect()
    const bottom = next ? next.top : rect.bottom
    if (clientY < (rect.top + bottom) / 2) return Math.max(0, ticketIndex(col.cards[i].el))
  }
  return Math.min(col.count, ticketIndex(col.cards[col.cards.length - 1].el) + 1)
}

function hitHover(clientX: number, clientY: number, board: BoardDrag, current: HoverSlot | null): HoverSlot | null {
  for (const col of board.geoms) {
    if (clientX < col.left || clientX > col.right || clientY < col.top || clientY > col.bottom) continue
    if (current?.col === col.id && col.slotIndex !== null && board.slot.isConnected) {
      const hole = board.slot.getBoundingClientRect()
      if (clientY >= hole.top - SLOT_STICK && clientY <= hole.bottom + SLOT_STICK) return current
    }
    const index = indexAtY(col, clientY, board.slot, col.slotIndex)
    if (current?.col === col.id && current.index === index) return current
    return { col: col.id, index }
  }
  return null
}

function placeSlot(board: BoardDrag, col: string, index: number) {
  const dest = board.geoms.find((item) => item.id === col)
  if (!dest) return
  if (dest.slotIndex === index && board.slot.isConnected) return

  for (const geom of board.geoms) {
    if (geom !== dest) geom.slotIndex = null
  }
  dest.slotIndex = index
  const virtual = dest.list.querySelector<HTMLElement>(':scope > .team-drop-virtual') ?? dest.list
  const before = dest.cards.find((card) => ticketIndex(card.el) >= index)?.el
  if (before) virtual.insertBefore(board.slot, before)
  else virtual.appendChild(board.slot)
  board.slot.style.position = ''
  board.slot.style.top = ''
}

function clearLiveDragDom(board?: BoardDrag | null) {
  document.querySelector('.team-drop-slot')?.remove()
  document.querySelectorAll('.team-drop-col.is-drop').forEach((node) => node.classList.remove('is-drop'))
  if (!board) return
  for (const geom of board.geoms) {
    for (const card of geom.cards) {
      card.el.style.transition = ''
      card.el.style.transform = ''
    }
  }
}

const FLY_MAX = 24
const FLY_MS = 420

function sleep(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms))
}

function flyCardToPerson(card: HTMLElement, avatar: HTMLElement, direction: 'to-person' | 'from-person') {
  const source = card.matches('.kanban-card') ? card : (card.querySelector('.kanban-card') as HTMLElement | null) ?? card
  const cardRect = source.getBoundingClientRect()
  const destRect = avatar.getBoundingClientRect()
  if (cardRect.width < 8 || destRect.width < 4) return Promise.resolve()
  const ghost = source.cloneNode(true) as HTMLElement
  ghost.classList.add('team-drop-fly')
  ghost.setAttribute('aria-hidden', 'true')
  const originX = cardRect.left + cardRect.width / 2
  const originY = cardRect.top + cardRect.height / 2
  const destX = destRect.left + destRect.width / 2
  const destY = destRect.top + destRect.height / 2
  const dx = destX - originX
  const dy = destY - originY
  const lift = Math.min(96, Math.abs(dy) * 0.3 + 48)
  const midX = dx * 0.4
  const midY = dy * 0.22 - lift
  Object.assign(ghost.style, {
    position: 'fixed',
    left: `${cardRect.left}px`,
    top: `${cardRect.top}px`,
    width: `${cardRect.width}px`,
    margin: '0',
    zIndex: '180',
    pointerEvents: 'none',
    transformOrigin: 'center center',
  })
  document.body.appendChild(ghost)
  avatar.classList.add('is-catch')
  const toPerson = [
    { transform: 'translate3d(0, 0, 0) rotate(0deg) scale(1)', opacity: 1, offset: 0 },
    { transform: `translate3d(${midX}px, ${midY}px, 0) rotate(-9deg) scale(0.9)`, opacity: 1, offset: 0.4 },
    { transform: `translate3d(${dx}px, ${dy}px, 0) rotate(14deg) scale(0.16)`, opacity: 0.18, offset: 1 },
  ]
  const fromPerson = [
    { transform: `translate3d(${dx}px, ${dy}px, 0) rotate(12deg) scale(0.16)`, opacity: 0.18, offset: 0 },
    { transform: `translate3d(${midX}px, ${midY}px, 0) rotate(-7deg) scale(0.9)`, opacity: 1, offset: 0.52 },
    { transform: 'translate3d(0, 0, 0) rotate(0deg) scale(1)', opacity: 1, offset: 1 },
  ]
  const anim = ghost.animate(direction === 'to-person' ? toPerson : fromPerson, {
    duration: FLY_MS,
    easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    fill: 'forwards',
  })
  return anim.finished.finally(() => {
    ghost.remove()
    avatar.classList.remove('is-catch')
  }).then(() => undefined)
}

function playAssignFlights(
  root: HTMLElement,
  teamId: string,
  rows: { id: string; email: string }[],
  direction: 'to-person' | 'from-person',
) {
  const flights = rows.slice(0, FLY_MAX).flatMap((row, index) => {
    const card = root.querySelector<HTMLElement>(`[data-ticket-id="${row.id}"]`)
    const avatar = root.querySelector<HTMLElement>(
      `[data-team-drop="${teamId}"] [data-person-email="${normalizeEmail(row.email)}"]`,
    )
    if (!card || !avatar) return []
    const rect = card.getBoundingClientRect()
    if (rect.bottom < 0 || rect.top > window.innerHeight) return []
    return [sleep(index * 40).then(() => flyCardToPerson(card, avatar, direction))]
  })
  return Promise.all(flights)
}

function stackWindow(scrollTop: number, viewHeight: number, count: number, stride: number) {
  if (count <= VIEW_MIN) return { start: 0, end: count }
  const step = Math.max(48, stride)
  const start = Math.max(0, Math.floor(scrollTop / step) - VIEW_BUFFER)
  const visible = Math.ceil(Math.max(viewHeight, step) / step) + VIEW_BUFFER * 2 + 1
  return { start, end: Math.min(count, Math.max(start + visible, start + VIEW_MIN)) }
}

function StackList({
  items,
  empty,
  render,
}: {
  items: PeticionPendiente[]
  empty: ReactNode
  render: (item: PeticionPendiente) => ReactNode
}) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [cardH, setCardH] = useState(CARD_H)
  const [range, setRange] = useState({ start: 0, end: Math.min(items.length, VIEW_MIN) })
  const stride = Math.max(48, cardH - STACK_OVERLAP)

  const syncWindow = useCallback(() => {
    const el = scrollerRef.current
    const next = stackWindow(el?.scrollTop ?? 0, el?.clientHeight ?? 0, items.length, stride)
    setRange((current) => (current.start === next.start && current.end === next.end ? current : next))
  }, [items.length, stride])

  useLayoutEffect(() => {
    const card = scrollerRef.current?.querySelector<HTMLElement>('.team-ticket-card')
    if (card) {
      const height = Math.round(card.getBoundingClientRect().height)
      if (height >= 140 && Math.abs(height - cardH) > 6) setCardH(height)
    }
    syncWindow()
    const el = scrollerRef.current
    if (!el) return
    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        syncWindow()
      })
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    const observer = new ResizeObserver(onScroll)
    observer.observe(el)
    return () => {
      el.removeEventListener('scroll', onScroll)
      observer.disconnect()
      if (raf) cancelAnimationFrame(raf)
    }
  }, [cardH, syncWindow])

  const shown = items.slice(range.start, range.end)
  const padTop = range.start * stride
  const padBottom = Math.max(0, items.length - range.end) * stride

  return (
    <div
      ref={scrollerRef}
      className={`team-drop-cards${items.length > 1 ? ' is-stack' : ''}`}
      data-stack-count={items.length}
      data-stack-stride={stride}
    >
      {items.length === 0 ? empty : (
        <div className="team-drop-virtual" style={{ paddingTop: padTop, paddingBottom: padBottom }}>
          {shown.map((item, offset) => {
            const index = range.start + offset
            return (
              <div
                key={item.idpeticion}
                data-ticket-id={item.idpeticion}
                data-ticket-index={index}
                className={`team-drop-stack-item hover:!z-50${index < VIEW_MIN ? ' team-card-enter' : ''}`}
                style={{
                  zIndex: index + 1,
                  animationDelay: index < VIEW_MIN ? `${index * 16}ms` : undefined,
                }}
              >
                {render(item)}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function TeamDropBoard({
  workshop,
  workspace,
  currentUser,
  teams,
  tickets,
  onAssignTeam,
  onPlaceTicket,
  onOpenTeam,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const ghostRef = useRef<HTMLDivElement | null>(null)
  const pendingRef = useRef<PendingDrag | null>(null)
  const dragRef = useRef<DragLive | null>(null)
  const overRef = useRef<string | null>(null)
  const slotRef = useRef<HoverSlot | null>(null)
  const boardRef = useRef<BoardDrag | null>(null)
  const columnsRef = useRef<Map<string, PeticionPendiente[]>>(new Map())
  const moveRaf = useRef(0)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyTeam, setBusyTeam] = useState<string | null>(null)
  const [undoByTeam, setUndoByTeam] = useState<Record<string, { id: string; email: string; prev: string }[]>>({})

  const columns = useMemo(() => {
    const buckets = new Map<string, PeticionPendiente[]>()
    buckets.set(TEAM_FILTER_LOOSE, [])
    for (const team of teams) buckets.set(team.id, [])
    for (const ticket of tickets) {
      const key = ticketDropColumnId(workspace, ticket)
      const list = buckets.get(key) ?? buckets.get(TEAM_FILTER_LOOSE)
      list?.push(ticket)
    }
    for (const [key, list] of buckets) {
      buckets.set(key, sortTicketsByOrder(list, workspace.ticketOrder?.[key]))
    }
    return buckets
  }, [tickets, teams, workspace])

  columnsRef.current = columns

  const teamMembers = useMemo(() => {
    const map = new Map<string, AdvisorPerson[]>()
    for (const team of teams) map.set(team.id, peopleOfTeam(workspace, team))
    return map
  }, [teams, workspace])

  const paintOver = (id: string | null) => {
    if (overRef.current === id) return
    overRef.current = id
    rootRef.current?.querySelectorAll('[data-team-drop]').forEach((node) => {
      node.classList.toggle('is-drop', (node as HTMLElement).dataset.teamDrop === id)
    })
  }

  const pointerRef = useRef({ x: 0, y: 0 })

  const moveGhost = (x: number, y: number) => {
    const live = dragRef.current
    const ghost = ghostRef.current
    pointerRef.current = { x, y }
    if (!live || !ghost) return
    ghost.style.transform = `translate3d(${Math.round(x - live.grabX)}px, ${Math.round(y - live.grabY)}px, 0)`
  }

  const applyHover = (x: number, y: number) => {
    const board = boardRef.current
    if (!board) return
    const hover = hitHover(x, y, board, slotRef.current)
    if (!hover) return
    placeSlot(board, hover.col, hover.index)
    slotRef.current = hover
    paintOver(hover.col)
  }

  const startLiveDrag = (pending: PendingDrag, live: DragLive) => {
    const root = rootRef.current
    if (!root) return false
    const sourceWrapper = pending.source.closest<HTMLElement>('.team-drop-stack-item')
    live.sourceWrapper = sourceWrapper
    sourceWrapper?.classList.add('is-dragging-source', 'hidden')
    root.classList.add('is-live')
    document.body.classList.add('is-team-drop-dragging')

    const ghost = document.createElement('div')
    ghost.className = 'team-drop-ghost'
    ghost.style.width = `${live.width}px`
    ghost.style.contain = 'layout paint'
    const card = pending.source.cloneNode(true) as HTMLElement
    card.removeAttribute('data-ticket-id')
    card.classList.remove('is-dragging-source')
    card.setAttribute('aria-hidden', 'true')
    ghost.appendChild(card)
    document.body.appendChild(ghost)
    ghostRef.current = ghost
    moveGhost(pending.startX, pending.startY)

    const slot = document.createElement('div')
    slot.className = 'team-drop-slot'
    slot.setAttribute('aria-hidden', 'true')
    slot.style.minHeight = `${SLOT_H}px`
    const geoms = measureBoard(root, live.item.idpeticion)
    const from = ticketDropColumnId(workspace, live.item)
    const fromIndex = Math.max(
      0,
      (columnsRef.current.get(from) ?? []).findIndex((item) => item.idpeticion === live.item.idpeticion),
    )
    const board: BoardDrag = { slot, geoms }
    boardRef.current = board
    slotRef.current = { col: from, index: fromIndex }
    placeSlot(board, from, fromIndex)
    paintOver(from)
    return true
  }

  const endDrag = (commit = true) => {
    const live = dragRef.current
    const dest = slotRef.current
    pendingRef.current = null
    dragRef.current = null
    const board = boardRef.current
    boardRef.current = null
    slotRef.current = null
    clearLiveDragDom(board)
    paintOver(null)
    live?.sourceWrapper?.classList.remove('is-dragging-source', 'hidden')
    ghostRef.current?.remove()
    ghostRef.current = null
    rootRef.current?.classList.remove('is-live')
    document.body.classList.remove('is-team-drop-dragging')
    if (!commit || !live || !dest) return
    const from = ticketDropColumnId(workspace, live.item)
    const fromIndex = Math.max(
      0,
      (columnsRef.current.get(from) ?? []).findIndex((item) => item.idpeticion === live.item.idpeticion),
    )
    if (dest.col === from && dest.index === fromIndex) return
    const siblings = (columnsRef.current.get(dest.col) ?? [])
      .filter((item) => item.idpeticion !== live.item.idpeticion)
      .map((item) => item.idpeticion)
    onPlaceTicket(live.item.idpeticion, dest.col === TEAM_FILTER_LOOSE ? null : dest.col, dest.index, siblings)
    const team = teams.find((row) => row.id === dest.col)
    setNotice(
      dest.col === from
        ? 'Orden actualizado.'
        : team
          ? `Ticket en ${team.name}.`
          : 'Ticket suelto otra vez.',
    )
  }

  const flushHover = () => {
    moveRaf.current = 0
    const { x, y } = pointerRef.current
    applyHover(x, y)
  }

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const pending = pendingRef.current
      if (pending && !dragRef.current) {
        const dx = event.clientX - pending.startX
        const dy = event.clientY - pending.startY
        if (Math.hypot(dx, dy) < DRAG_START) return
        const next: DragLive = {
          item: pending.item,
          width: pending.width,
          grabX: pending.grabX,
          grabY: pending.grabY,
          source: pending.source,
          sourceWrapper: null,
        }
        dragRef.current = next
        if (!startLiveDrag(pending, next)) {
          dragRef.current = null
          return
        }
      }
      if (!dragRef.current) return
      event.preventDefault()
      moveGhost(event.clientX, event.clientY)
      if (!moveRaf.current) moveRaf.current = requestAnimationFrame(flushHover)
    }
    const onUp = () => {
      const started = Boolean(dragRef.current)
      pendingRef.current = null
      document.body.classList.remove('is-team-drop-dragging')
      if (moveRaf.current) {
        cancelAnimationFrame(moveRaf.current)
        flushHover()
      }
      if (!started) {
        paintOver(null)
        return
      }
      endDrag()
    }
    const onCancel = () => {
      pendingRef.current = null
      document.body.classList.remove('is-team-drop-dragging')
      if (moveRaf.current) {
        cancelAnimationFrame(moveRaf.current)
        moveRaf.current = 0
      }
      endDrag(false)
    }
    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      if (moveRaf.current) {
        cancelAnimationFrame(moveRaf.current)
        moveRaf.current = 0
      }
      endDrag(false)
    }
  }, [onPlaceTicket, teams, workspace])

  const onCardPointerDown = useCallback((item: PeticionPendiente, event: ReactPointerEvent<HTMLElement>) => {
    if (isInteractive(event.target)) return
    if (event.button !== 0) return
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    pointerRef.current = { x: event.clientX, y: event.clientY }
    pendingRef.current = {
      item,
      source: event.currentTarget,
      startX: event.clientX,
      startY: event.clientY,
      grabX: event.clientX - rect.left,
      grabY: event.clientY - rect.top,
      width: rect.width,
    }
  }, [])

  const autoAssign = async (team: AdvisorTeam) => {
    const items = columns.get(team.id) ?? []
    const members = teamMembers.get(team.id) ?? []
    if (items.length === 0 || members.length === 0) return
    setBusyTeam(team.id)
    setError(null)
    setNotice(null)
    const planned = planRandomTeamAssign(members, items)
    const flight = rootRef.current
      ? playAssignFlights(
          rootRef.current,
          team.id,
          planned.map((row) => ({ id: row.ticket.idpeticion, email: row.person.email })),
          'to-person',
        )
      : Promise.resolve()
    const done: { id: string; email: string; prev: string }[] = []
    for (const row of planned) {
      try {
        await reassignTicketOwner(workshop, workspace, currentUser, 'admin', row.ticket, row.person.email)
        onAssignTeam(row.ticket.idpeticion, team.id)
        done.push({
          id: row.ticket.idpeticion,
          email: row.person.email,
          prev: row.ticket.gestionemail || '',
        })
      } catch {
        /* se cuenta al final */
      }
    }
    await flight
    if (done.length === 0) setError(`No se pudo repartir en ${team.name}.`)
    else setNotice(`${done.length === 1 ? '1 ticket' : `${done.length} tickets`} de ${team.name} repartidos al azar.`)
    if (done.length) setUndoByTeam((prev) => ({ ...prev, [team.id]: done }))
    setBusyTeam(null)
  }

  const undoAssign = async (team: AdvisorTeam) => {
    const rows = undoByTeam[team.id] ?? []
    if (rows.length === 0) return
    setBusyTeam(team.id)
    setError(null)
    setNotice(null)
    const flight = rootRef.current ? playAssignFlights(rootRef.current, team.id, rows, 'from-person') : Promise.resolve()
    let reverted = 0
    for (const row of rows) {
      const ticket = tickets.find((item) => item.idpeticion === row.id)
      if (!ticket) continue
      if (normalizeEmail(ticket.gestionemail || '') !== normalizeEmail(row.email)) continue
      try {
        await reassignTicketOwner(workshop, workspace, currentUser, 'admin', ticket, row.prev)
        reverted += 1
      } catch {
        /* se cuenta al final */
      }
    }
    await flight
    setUndoByTeam((prev) => {
      const next = { ...prev }
      delete next[team.id]
      return next
    })
    if (reverted === 0) setError(`No se pudo deshacer en ${team.name}.`)
    else setNotice(reverted === 1 ? 'Reparto deshecho.' : `${reverted} tickets como estaban.`)
    setBusyTeam(null)
  }

  const renderCard = useCallback(
    (item: PeticionPendiente) => (
      <TeamTicketCard
        key={item.idpeticion}
        item={item}
        workshop={workshop}
        workspace={workspace}
        currentUser={currentUser}
        lite
        onDragStart={onCardPointerDown}
      />
    ),
    [currentUser, onCardPointerDown, workshop, workspace],
  )

  const loose = columns.get(TEAM_FILTER_LOOSE) ?? []

  return (
    <div ref={rootRef} className="team-drop-board">
      <p className="section-subtitle">Arrastra una tarjeta y suéltala encima de otra para colocarla.</p>
      {notice ? <p className="dash-assign-notice">{notice}</p> : null}
      {error ? <p className="ticket-owner-error">{error}</p> : null}

      <div className="team-drop-rail custom-scrollbar-light">
        <section data-team-drop={TEAM_FILTER_LOOSE} className="team-drop-col">
          <header>
            <div>
              <h3>Sueltos</h3>
              <p className="kanban-column-hint">Aún no tienen equipo</p>
            </div>
            <span>{loose.length}</span>
          </header>
          <StackList
            items={loose}
            empty={<p className="section-subtitle ops-empty kanban-empty">Suelta aquí para dejarlo sin equipo.</p>}
            render={renderCard}
          />
        </section>

        {teams.map((team) => {
          const items = columns.get(team.id) ?? []
          const members = teamMembers.get(team.id) ?? []
          const canUndo = Boolean(undoByTeam[team.id]?.length)
          const busy = busyTeam === team.id
          const hint = teamRepartirHint(items.length, members.length, canUndo)
          return (
            <section key={team.id} data-team-drop={team.id} className="team-drop-col">
              <header>
                <div>
                  <button type="button" className="team-drop-open" onClick={() => onOpenTeam(team.id)}>
                    {team.name}
                  </button>
                  <p className="kanban-column-hint">
                    {items.length === 0
                      ? 'Suelta tarjetas aquí'
                      : `${items.length === 1 ? '1 ticket' : `${items.length} tickets`} hoy`}
                  </p>
                </div>
                <span>{items.length}</span>
              </header>
              <div className="team-drop-people" title={members.map((person) => person.name).join(', ') || undefined}>
                {members.map((person) => (
                  <span
                    key={person.id}
                    className="team-drop-avatar"
                    data-person-email={normalizeEmail(person.email)}
                    aria-hidden
                  >
                    {initials(person.name)}
                  </span>
                ))}
                <p className="team-drop-people-names">{memberNames(members)}</p>
              </div>
              {canUndo ? (
                <button
                  type="button"
                  className="ghost-button team-drop-auto"
                  disabled={busy}
                  onClick={() => void undoAssign(team)}
                >
                  <Undo2 size={16} aria-hidden />
                  {busy ? 'Deshaciendo…' : 'Deshacer'}
                </button>
              ) : (
                <button
                  type="button"
                  className="client-submit team-drop-auto"
                  disabled={busy || items.length === 0 || members.length === 0}
                  onClick={() => void autoAssign(team)}
                >
                  <Sparkles size={16} aria-hidden />
                  {busy ? 'Repartiendo…' : 'Repartir ahora'}
                </button>
              )}
              <p className="team-drop-auto-hint">{hint}</p>
              <StackList
                items={items}
                empty={<p className="section-subtitle ops-empty kanban-empty">Arrastra aquí las tarjetas de este equipo.</p>}
                render={renderCard}
              />
            </section>
          )
        })}
      </div>

    </div>
  )
}

export default memo(TeamDropBoard)

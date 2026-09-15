import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
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
}

type HoverSlot = { col: string; index: number }

type CardGeom = { el: HTMLElement; height: number }

type ColGeom = {
  id: string
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
  slot: HTMLElement
  slotH: number
  geoms: ColGeom[]
  dropCol: string | null
}

type FlipMove = { el: HTMLElement; dx: number; dy: number }

const DRAG_START = 8
const CARD_SLOT = 178
const CARD_GAP = 14
const SLOT_H = CARD_SLOT - CARD_GAP
const SLOT_STICK = 18

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
    const listRect = list.getBoundingClientRect()
    const cards: CardGeom[] = []
    for (const node of list.children) {
      if (!(node instanceof HTMLElement) || node.classList.contains('team-drop-slot')) continue
      const ticketId = node.dataset.ticketId
      if (!ticketId || (skipId && ticketId === skipId) || node.classList.contains('is-dragging-source')) continue
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

function indexAtY(col: ColGeom, clientY: number, slot: HTMLElement | null, slotIndex: number | null): number {
  if (slotIndex !== null && slot?.isConnected) {
    const hole = slot.getBoundingClientRect()
    if (clientY >= hole.top - SLOT_STICK && clientY <= hole.bottom + SLOT_STICK) return slotIndex
  }
  for (let i = 0; i < col.cards.length; i += 1) {
    const rect = col.cards[i].el.getBoundingClientRect()
    const next = col.cards[i + 1]?.el.getBoundingClientRect()
    const bottom = next ? next.top : rect.bottom
    if (clientY < (rect.top + bottom) / 2) return i
  }
  return col.cards.length
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

function placeSlot(board: BoardDrag, col: string, index: number) {
  const dest = board.geoms.find((item) => item.id === col)
  if (!dest) return
  const origin = board.geoms.find((item) => item.slotIndex !== null) ?? dest
  if (dest.slotIndex === index && origin === dest) return

  const first = new Map<HTMLElement, DOMRect>()
  const snapshot = (geom: ColGeom) => {
    for (const card of geom.cards) first.set(card.el, card.el.getBoundingClientRect())
  }
  snapshot(origin)
  if (dest !== origin) snapshot(dest)
  if (board.slot.isConnected) first.set(board.slot, board.slot.getBoundingClientRect())

  if (origin !== dest) origin.slotIndex = null
  dest.slotIndex = index
  const before = dest.cards[index]?.el
  if (before) dest.list.insertBefore(board.slot, before)
  else dest.list.appendChild(board.slot)

  const movers: FlipMove[] = []
  first.forEach((a, el) => {
    if (!el.isConnected) return
    const b = el.getBoundingClientRect()
    const dx = a.left - b.left
    const dy = a.top - b.top
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) movers.push({ el, dx, dy })
  })
  playFlip(movers)
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

function StackList({
  items,
  dragId,
  empty,
  render,
}: {
  items: PeticionPendiente[]
  dragId?: string | null
  empty: ReactNode
  render: (item: PeticionPendiente) => ReactNode
}) {
  const visible = dragId ? items.filter((item) => item.idpeticion !== dragId) : items
  return (
    <div className={`team-drop-cards${visible.length > 1 ? ' is-stack' : ''}`}>
      {visible.length === 0
        ? empty
        : visible.map((item, index) => (
            <div
              key={item.idpeticion}
              data-ticket-id={item.idpeticion}
              className="team-drop-stack-item"
              style={{ zIndex: index + 1 }}
            >
              {render(item)}
            </div>
          ))}
    </div>
  )
}

export default function TeamDropBoard({
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
  const ghostRef = useRef<HTMLDivElement>(null)
  const pendingRef = useRef<{
    item: PeticionPendiente
    startX: number
    startY: number
    grabX: number
    grabY: number
    width: number
  } | null>(null)
  const dragRef = useRef<DragLive | null>(null)
  const overRef = useRef<string | null>(null)
  const slotRef = useRef<HoverSlot | null>(null)
  const boardRef = useRef<BoardDrag | null>(null)
  const columnsRef = useRef<Map<string, PeticionPendiente[]>>(new Map())
  const moveRaf = useRef(0)
  const [drag, setDrag] = useState<DragLive | null>(null)
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

  const endDrag = () => {
    const live = dragRef.current
    const dest = slotRef.current
    pendingRef.current = null
    dragRef.current = null
    const board = boardRef.current
    boardRef.current = null
    slotRef.current = null
    clearLiveDragDom(board)
    paintOver(null)
    setDrag(null)
    if (!live || !dest) return
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

  useLayoutEffect(() => {
    if (!drag || !ghostRef.current) return
    const pending = pendingRef.current
    if (pending) moveGhost(pending.startX, pending.startY)
  }, [drag])

  useLayoutEffect(() => {
    if (!drag || !rootRef.current) {
      clearLiveDragDom(boardRef.current)
      boardRef.current = null
      return
    }
    const slot = document.createElement('div')
    slot.className = 'team-drop-slot'
    slot.setAttribute('aria-hidden', 'true')
    slot.style.minHeight = `${SLOT_H}px`
    const geoms = measureBoard(rootRef.current, drag.item.idpeticion)
    const from = ticketDropColumnId(workspace, drag.item)
    const origin = geoms.find((item) => item.id === from)
    const fromIndex = Math.max(
      0,
      (columns.get(from) ?? []).findIndex((item) => item.idpeticion === drag.item.idpeticion),
    )
    const board: BoardDrag = { slot, slotH: SLOT_H, geoms, dropCol: from }
    boardRef.current = board
    slotRef.current = { col: from, index: fromIndex }
    if (origin) {
      origin.slotIndex = fromIndex
      const before = origin.cards[fromIndex]?.el
      if (before) origin.list.insertBefore(slot, before)
      else origin.list.appendChild(slot)
    }
    paintOver(from)
    return () => {
      slot.remove()
    }
  }, [drag])

  useEffect(() => {
    document.body.classList.toggle('is-team-drop-dragging', Boolean(drag))
    return () => document.body.classList.remove('is-team-drop-dragging')
  }, [drag])

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
        }
        dragRef.current = next
        setDrag(next)
      }
      if (!dragRef.current) return
      event.preventDefault()
      if (moveRaf.current) cancelAnimationFrame(moveRaf.current)
      const x = event.clientX
      const y = event.clientY
      moveRaf.current = requestAnimationFrame(() => {
        moveGhost(x, y)
        applyHover(x, y)
      })
    }
    const onUp = () => {
      const started = Boolean(dragRef.current)
      pendingRef.current = null
      document.body.classList.remove('is-team-drop-dragging')
      if (moveRaf.current) cancelAnimationFrame(moveRaf.current)
      if (!started) {
        paintOver(null)
        setDrag(null)
        return
      }
      endDrag()
    }
    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      document.body.classList.remove('is-team-drop-dragging')
      if (moveRaf.current) cancelAnimationFrame(moveRaf.current)
    }
  }, [onPlaceTicket, teams, workspace])

  const onCardPointerDown = (item: PeticionPendiente, event: ReactPointerEvent<HTMLElement>) => {
    if (isInteractive(event.target)) return
    if (event.button !== 0) return
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    pointerRef.current = { x: event.clientX, y: event.clientY }
    pendingRef.current = {
      item,
      startX: event.clientX,
      startY: event.clientY,
      grabX: event.clientX - rect.left,
      grabY: event.clientY - rect.top,
      width: rect.width,
    }
  }

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

  const renderCard = (item: PeticionPendiente) => (
    <TeamTicketCard
      key={item.idpeticion}
      item={item}
      workshop={workshop}
      workspace={workspace}
      currentUser={currentUser}
      lite
      dragging={drag?.item.idpeticion === item.idpeticion}
      onPointerDown={(event) => onCardPointerDown(item, event)}
    />
  )

  const loose = columns.get(TEAM_FILTER_LOOSE) ?? []
  const dragId = drag?.item.idpeticion ?? null
  const live = Boolean(drag)

  return (
    <div ref={rootRef} className={`team-drop-board${live ? ' is-live' : ''}`}>
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
            dragId={dragId}
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
                dragId={dragId}
                empty={<p className="section-subtitle ops-empty kanban-empty">Arrastra aquí las tarjetas de este equipo.</p>}
                render={renderCard}
              />
            </section>
          )
        })}
      </div>

      {drag
        ? createPortal(
            <div
              ref={ghostRef}
              className="team-drop-ghost"
              style={{
                width: drag.width,
                transform: `translate3d(${Math.round(pointerRef.current.x - drag.grabX)}px, ${Math.round(pointerRef.current.y - drag.grabY)}px, 0)`,
              }}
            >
              <TeamTicketCard item={drag.item} workshop={workshop} workspace={workspace} currentUser={currentUser} lite />
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}

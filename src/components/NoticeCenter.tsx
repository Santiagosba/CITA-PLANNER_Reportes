import { useEffect, useRef, useState } from 'react'
import { CheckCheck, ChevronLeft, Clock, X } from 'lucide-react'
import { formatFecha, isPeticionPendiente, type PeticionPendiente } from '../lib/peticionesPendientes'
import { isSlaCritico } from '../lib/tallerStations'
import type { NoticeHistoryItem } from '../lib/headerNoticeHistory'
import TicketClientBlock from './TicketClientBlock'
import NoticeSwipeRow from './NoticeSwipeRow'

type Props = {
  inbox: PeticionPendiente[]
  history: NoticeHistoryItem[]
  tickets: PeticionPendiente[]
  loading: boolean
  onClose: () => void
  onOpen: (item: PeticionPendiente) => void
  onRead: (ids: string[]) => void
  onDelete: (ids: string[]) => void
}

function kindBadge(sla: boolean, pending: boolean) {
  if (sla) return { className: 'badge tone-negative', label: 'SLA crítico' }
  if (pending) return { className: 'badge tone-warning', label: 'Pendiente' }
  return { className: 'badge tone-muted', label: 'Aviso' }
}

function statusLabel(status: NoticeHistoryItem['status']) {
  if (status === 'read') return 'Leído'
  if (status === 'deleted') return 'Borrado'
  return 'Por leer'
}

export default function NoticeCenter({
  inbox,
  history,
  tickets,
  loading,
  onClose,
  onOpen,
  onRead,
  onDelete,
}: Props) {
  const [pane, setPane] = useState<'inbox' | 'history'>('inbox')
  const [revealedId, setRevealedId] = useState<string | null>(null)
  const [closing, setClosing] = useState(false)
  const [readingAll, setReadingAll] = useState(false)
  const closeTimer = useRef<number | null>(null)
  const readAllTimer = useRef<number | null>(null)

  useEffect(() => {
    setPane('inbox')
    setRevealedId(null)
    return () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current)
      if (readAllTimer.current !== null) window.clearTimeout(readAllTimer.current)
    }
  }, [])

  const openHistoryTicket = (id: string) => {
    const ticket = tickets.find((item) => item.idpeticion === id)
    if (ticket) onOpen(ticket)
  }

  const closePanel = () => {
    if (closing) return
    setClosing(true)
    closeTimer.current = window.setTimeout(onClose, 220)
  }

  const readAll = () => {
    if (readingAll || inbox.length === 0) return
    setReadingAll(true)
    readAllTimer.current = window.setTimeout(() => {
      onRead(inbox.map((item) => item.idpeticion))
      setReadingAll(false)
    }, 300)
  }

  return (
    <div
      className={`view-page-popover glass view-page-notices squircle origin-top-right !w-[min(calc(100vw-1rem),520px)] !bg-avi-surface-solid ${
        closing ? 'animate-notice-sheet-out' : 'animate-notice-sheet'
      }`}
      role="dialog"
      aria-label={pane === 'history' ? 'Historial de notificaciones' : 'Notificaciones'}
    >
      <div className="flex flex-col gap-2 px-1.5 pb-2.5">
        <div className="flex items-start justify-between gap-2">
          <div key={pane} className="min-w-0 animate-notice-pane">
            {pane === 'history' ? (
              <button
                type="button"
                className="ghost-button group h-9 min-h-9 gap-1 px-2 transition-transform duration-200 active:scale-95"
                onClick={() => setPane('inbox')}
              >
                <ChevronLeft size={16} className="transition-transform duration-200 group-hover:-translate-x-0.5" aria-hidden />
                Avisos
              </button>
            ) : (
              <strong className="block pt-1 text-lg font-bold text-avi-fog-strong">
                {inbox.length > 0 ? `${inbox.length} avisos por leer` : 'Avisos del taller'}
              </strong>
            )}
            {pane === 'history' ? (
              <p className="mt-1 px-2 text-sm text-avi-muted">Se van guardando los avisos que llegan.</p>
            ) : inbox.length > 0 ? (
              <p className="mt-1 text-sm text-avi-muted">Desliza a la izquierda para leer o borrar.</p>
            ) : null}
          </div>
          <button
            type="button"
            className="ghost-button group h-9 min-h-9 shrink-0 px-2 transition-transform duration-200 hover:scale-105 active:scale-90"
            onClick={closePanel}
            aria-label="Cerrar"
          >
            <X size={16} className="transition-transform duration-200 group-hover:rotate-90" />
          </button>
        </div>
        {pane === 'inbox' ? (
          <div className="flex animate-notice-pane flex-wrap items-center gap-1">
            <button
              type="button"
              className="ghost-button group h-9 min-h-9 px-2.5 transition-transform duration-200 hover:-translate-y-0.5 active:scale-95"
              onClick={() => setPane('history')}
            >
              <Clock size={16} className="transition-transform duration-300 group-hover:-rotate-12" aria-hidden />
              Historial
            </button>
            {inbox.length > 0 ? (
              <button
                type="button"
                className="ghost-button group h-9 min-h-9 px-2.5 transition-transform duration-200 hover:-translate-y-0.5 active:scale-95"
                onClick={readAll}
                disabled={readingAll}
              >
                <CheckCheck size={16} className={readingAll ? 'animate-pulse' : 'transition-transform duration-200 group-hover:scale-110'} aria-hidden />
                Ya las he visto
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {pane === 'history' ? (
        history.length === 0 ? (
          <p className="section-subtitle view-page-popover-empty animate-notice-pane">Todavía no hay historial de avisos.</p>
        ) : (
          <ul className="view-page-popover-list custom-scrollbar-light flex !max-h-[min(64vh,600px)] animate-notice-pane flex-col gap-1 [&>li]:shrink-0">
            {history.map((item, index) => {
              const tone = kindBadge(item.sla, item.pending)
              return (
                <li key={`${item.id}-${item.savedAt}`}>
                  <button
                    type="button"
                    className="view-page-popover-row animate-notice-row transition-[background-color,transform] duration-200 hover:translate-x-1 active:scale-[0.99]"
                    style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}
                    onClick={() => openHistoryTicket(item.id)}
                  >
                    <span className="view-page-popover-row-top">
                      <span className="min-w-0">
                        <strong className="block truncate">{item.name}</strong>
                        {item.phone ? <span className="block truncate text-sm text-avi-muted">{item.phone}</span> : null}
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <span className={tone.className}>{tone.label}</span>
                        <span className="text-2xs font-semibold text-avi-muted">{statusLabel(item.status)}</span>
                      </span>
                    </span>
                    <span className="view-page-popover-row-meta">
                      <span>{item.tipo}</span>
                      <time>{formatFecha(item.when)}</time>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )
      ) : inbox.length === 0 ? (
        <p className="section-subtitle view-page-popover-empty animate-notice-pane">
          {loading ? 'Cargando avisos…' : history.length > 0 ? 'Ya has leído los avisos de ahora.' : 'No hay avisos pendientes.'}
        </p>
      ) : (
        <ul
          className={`view-page-popover-list custom-scrollbar-light flex !max-h-[min(64vh,600px)] flex-col gap-1 [&>li]:shrink-0 ${
            readingAll ? 'animate-notice-list-out' : 'animate-notice-pane'
          }`}
        >
          {inbox.map((item, index) => {
            const sla = isSlaCritico(item.fechainicio) || isSlaCritico(item.cita?.fecha)
            const tone = kindBadge(sla, isPeticionPendiente(item))
            return (
              <NoticeSwipeRow
                key={item.idpeticion}
                revealed={revealedId === item.idpeticion}
                onReveal={() => setRevealedId(item.idpeticion)}
                onConceal={() => setRevealedId((current) => (current === item.idpeticion ? null : current))}
                onOpen={() => onOpen(item)}
                onRead={() => onRead([item.idpeticion])}
                onDelete={() => onDelete([item.idpeticion])}
              >
                <span className="animate-notice-row block" style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}>
                  <span className="view-page-popover-row-top">
                    <TicketClientBlock peticion={item} size="sm" />
                    <span className={tone.className}>{tone.label}</span>
                  </span>
                  <span className="view-page-popover-row-meta">
                    <span>{item.tipopeticion || 'Sin tipo'}</span>
                    <time>{formatFecha(item.fechainicio)}</time>
                  </span>
                </span>
              </NoticeSwipeRow>
            )
          })}
        </ul>
      )}
    </div>
  )
}

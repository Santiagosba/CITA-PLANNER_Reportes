import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, Ellipsis, Trash2 } from 'lucide-react'

const ACTION_W = 152
const SNAP = ACTION_W / 2

type Props = {
  children: ReactNode
  revealed?: boolean
  onOpen: () => void
  onRead: () => void
  onDelete: () => void
  onReveal?: () => void
  onConceal?: () => void
}

export default function NoticeSwipeRow({ children, revealed, onOpen, onRead, onDelete, onReveal, onConceal }: Props) {
  const [dx, setDx] = useState(0)
  const [live, setLive] = useState(false)
  const [exiting, setExiting] = useState<'read' | 'delete' | null>(null)
  const dxRef = useRef(0)
  const startX = useRef(0)
  const startY = useRef(0)
  const origin = useRef(0)
  const dragging = useRef(false)
  const suppressClick = useRef(false)
  const dismissTimer = useRef<number | null>(null)
  const shown = dx
  const actionsVisible = shown < -8

  const moveTo = (next: number) => {
    dxRef.current = next
    setDx(next)
  }

  useEffect(() => {
    const next = revealed ? -ACTION_W : 0
    dxRef.current = next
    setDx(next)
  }, [revealed])

  useEffect(
    () => () => {
      if (dismissTimer.current !== null) window.clearTimeout(dismissTimer.current)
    },
    [],
  )

  const settle = (next: number) => {
    const open = next < -SNAP
    moveTo(open ? -ACTION_W : 0)
    if (open) onReveal?.()
    else onConceal?.()
  }

  const dismiss = (action: 'read' | 'delete') => {
    if (exiting) return
    setLive(false)
    setExiting(action)
    dismissTimer.current = window.setTimeout(() => {
      if (action === 'read') onRead()
      else onDelete()
    }, 320)
  }

  return (
    <li
      className={`relative overflow-hidden rounded-md transition-shadow duration-200 hover:shadow-glass ${
        exiting === 'read'
          ? 'pointer-events-none animate-notice-dismiss-read'
          : exiting === 'delete'
            ? 'pointer-events-none animate-notice-dismiss-delete'
            : ''
      }`}
    >
      <div
        className={`absolute inset-y-0 right-0 flex transition-opacity ${actionsVisible ? 'opacity-100' : 'opacity-0'}`}
        aria-hidden={!actionsVisible}
      >
        <button
          type="button"
          className="flex w-[76px] flex-col items-center justify-center gap-1 bg-avi-brand text-sm font-semibold text-white transition-[filter,transform] duration-200 hover:brightness-110 active:scale-95"
          disabled={!actionsVisible}
          tabIndex={actionsVisible ? 0 : -1}
          onClick={(event) => {
            event.stopPropagation()
            dismiss('read')
          }}
        >
          <Check size={16} strokeWidth={2.4} aria-hidden />
          Leído
        </button>
        <button
          type="button"
          className="flex w-[76px] flex-col items-center justify-center gap-1 bg-avi-danger text-sm font-semibold text-white transition-[filter,transform] duration-200 hover:brightness-110 active:scale-95"
          disabled={!actionsVisible}
          tabIndex={actionsVisible ? 0 : -1}
          onClick={(event) => {
            event.stopPropagation()
            dismiss('delete')
          }}
        >
          <Trash2 size={16} strokeWidth={2.2} aria-hidden />
          Borrar
        </button>
      </div>
      <div
        className="relative select-none bg-avi-surface-solid [touch-action:pan-y] will-change-transform"
        style={{ transform: `translate3d(${shown}px, 0, 0)`, transition: live ? 'none' : 'transform 280ms cubic-bezier(0.22, 1, 0.36, 1)' }}
        onPointerDown={(event) => {
          event.stopPropagation()
          startX.current = event.clientX
          startY.current = event.clientY
          origin.current = shown
          dragging.current = false
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={(event) => {
          const mx = event.clientX - startX.current
          const my = event.clientY - startY.current
          if (!dragging.current && Math.abs(mx) < 10) return
          if (!dragging.current && Math.abs(my) > Math.abs(mx)) return
          if (!dragging.current) setLive(true)
          dragging.current = true
          moveTo(Math.min(0, Math.max(-ACTION_W, origin.current + mx)))
        }}
        onPointerUp={() => {
          setLive(false)
          if (dragging.current) {
            suppressClick.current = true
            settle(dxRef.current)
            dragging.current = false
            return
          }
          settle(dxRef.current)
        }}
        onPointerCancel={() => {
          setLive(false)
          dragging.current = false
          settle(dxRef.current)
        }}
      >
        <button
          type="button"
          className="view-page-popover-row !pr-12 transition-[background-color,transform] duration-200 active:scale-[0.99]"
          onClick={() => {
            if (suppressClick.current) {
              suppressClick.current = false
              return
            }
            if (shown < -8) {
              moveTo(0)
              return
            }
            onOpen()
          }}
        >
          {children}
        </button>
      </div>
      {!actionsVisible ? (
        <button
          type="button"
          className="absolute right-2 top-1/2 z-10 inline-flex h-9 min-h-9 w-9 -translate-y-1/2 items-center justify-center rounded-pill border border-avi-line bg-avi-surface-solid text-avi-muted shadow-glass transition-[color,transform,box-shadow] duration-200 hover:scale-105 hover:text-avi-brand hover:shadow-popover active:scale-90"
          aria-label="Mostrar acciones"
          title="Mostrar acciones"
          onClick={(event) => {
            event.stopPropagation()
            moveTo(-ACTION_W)
            onReveal?.()
          }}
        >
          <Ellipsis size={17} aria-hidden />
        </button>
      ) : null}
    </li>
  )
}

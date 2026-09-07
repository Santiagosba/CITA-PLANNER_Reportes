import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, Plus, StickyNote, Trash2 } from 'lucide-react'

const NOTES_KEY = 'avi-quick-notes'
const NOTES_MAX = 100

export type QuickNote = {
  id: string
  text: string
  updatedAt: number
}

function loadNotes(): QuickNote[] {
  try {
    const raw = localStorage.getItem(NOTES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as QuickNote[]
    return Array.isArray(parsed) ? parsed.filter((n) => n && typeof n.text === 'string') : []
  } catch {
    return []
  }
}

function saveNotes(notes: QuickNote[]) {
  try {
    localStorage.setItem(NOTES_KEY, JSON.stringify(notes.slice(0, NOTES_MAX)))
  } catch {
    /* ignore */
  }
}

function newId(): string {
  return `n-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function noteTitle(text: string): string {
  const first = text.split('\n').find((l) => l.trim())?.trim() ?? ''
  return first || 'Nota sin título'
}

function fmtWhen(ts: number): string {
  const d = new Date(ts)
  const sameDay = d.toDateString() === new Date().toDateString()
  const time = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  return sameDay ? time : `${d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })} ${time}`
}

/**
 * Bloc de notas rápidas del asesor. Se guarda en este navegador (localStorage),
 * autoguardado al escribir. Pensado para apuntes durante una llamada.
 */
export default function QuickNotes() {
  const [notes, setNotes] = useState<QuickNote[]>(() => loadNotes())
  const [openId, setOpenId] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    saveNotes(notes)
  }, [notes])

  useEffect(() => {
    if (openId) textareaRef.current?.focus()
  }, [openId])

  const open = useMemo(() => notes.find((n) => n.id === openId) ?? null, [notes, openId])
  const sorted = useMemo(() => [...notes].sort((a, b) => b.updatedAt - a.updatedAt), [notes])

  const create = () => {
    const note: QuickNote = { id: newId(), text: '', updatedAt: Date.now() }
    setNotes((prev) => [note, ...prev].slice(0, NOTES_MAX))
    setOpenId(note.id)
  }

  const update = (id: string, text: string) => {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, text, updatedAt: Date.now() } : n)))
  }

  const remove = (id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id))
    setOpenId((cur) => (cur === id ? null : cur))
  }

  const back = () => {
    // Una nota vacía no merece quedarse en la lista.
    if (open && !open.text.trim()) remove(open.id)
    setOpenId(null)
  }

  if (open) {
    return (
      <div className="quick-notes is-editing">
        <div className="quick-notes-bar">
          <button type="button" className="ghost-button quick-notes-back" onClick={back}>
            <ChevronLeft size={14} aria-hidden />
            Notas
          </button>
          <span className="quick-notes-when">Guardado · {fmtWhen(open.updatedAt)}</span>
          <button
            type="button"
            className="ghost-button lead-icon-btn"
            onClick={() => remove(open.id)}
            aria-label="Eliminar nota"
            title="Eliminar nota"
          >
            <Trash2 size={14} />
          </button>
        </div>
        <textarea
          ref={textareaRef}
          className="quick-notes-editor lg-surface"
          value={open.text}
          onChange={(e) => update(open.id, e.target.value)}
          placeholder="Escribe aquí… (matrícula, lo que pide el cliente, a quién avisar)"
          spellCheck
        />
      </div>
    )
  }

  return (
    <div className="quick-notes">
      <div className="quick-notes-bar">
        <span className="quick-notes-count">
          <StickyNote size={14} aria-hidden />
          {sorted.length === 0 ? 'Sin notas' : `${sorted.length} ${sorted.length === 1 ? 'nota' : 'notas'}`}
        </span>
        <button type="button" className="client-submit quick-notes-new" onClick={create}>
          <Plus size={15} aria-hidden />
          Nueva nota
        </button>
      </div>
      {sorted.length === 0 ? (
        <p className="phone-pad-hint quick-notes-empty">
          Apuntes rápidos que se quedan en este navegador. Útil mientras hablas con el cliente.
        </p>
      ) : (
        <ul className="quick-notes-list custom-scrollbar-light">
          {sorted.map((n) => (
            <li key={n.id}>
              <button type="button" className="quick-notes-item lg-surface" onClick={() => setOpenId(n.id)}>
                <strong>{noteTitle(n.text)}</strong>
                <span>
                  {fmtWhen(n.updatedAt)}
                  {n.text.split('\n').filter((l) => l.trim()).length > 1
                    ? ` · ${n.text.split('\n').filter((l) => l.trim())[1]?.trim().slice(0, 60)}`
                    : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

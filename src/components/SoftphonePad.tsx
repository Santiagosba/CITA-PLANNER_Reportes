import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Clock3, Delete, Grid3x3, Phone, PhoneIncoming, PhoneMissed, PhoneOff, PhoneOutgoing, Sparkles, Trash2, User } from 'lucide-react'
import { phoneTail, softphone, toDialNumber, useSoftphone, type FinishedCall } from '../lib/softphone'
import { loadImportantContacts } from './ContactsApp'

type PadTab = 'keypad' | 'history'

/** Teclas del marcador con sus letras, como un teléfono. */
const KEYS: { d: string; sub: string }[] = [
  { d: '1', sub: '' },
  { d: '2', sub: 'ABC' },
  { d: '3', sub: 'DEF' },
  { d: '4', sub: 'GHI' },
  { d: '5', sub: 'JKL' },
  { d: '6', sub: 'MNO' },
  { d: '7', sub: 'PQRS' },
  { d: '8', sub: 'TUV' },
  { d: '9', sub: 'WXYZ' },
  { d: '*', sub: '' },
  { d: '0', sub: '+' },
  { d: '#', sub: '' },
]

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function fmtWhen(ts: number): string {
  const d = new Date(ts)
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  const time = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  if (sameDay) return time
  return `${d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })} ${time}`
}

/** Agrupa el número escrito en bloques legibles: +34 600 000 000. */
function prettyNumber(raw: string): string {
  const n = raw.replace(/\s+/g, '')
  if (!n) return ''
  const m = n.match(/^(\+\d{1,3})?(\d*)([*#]*)$/)
  if (!m) return n
  const [, cc = '', digits = '', extra = ''] = m
  const groups = digits.match(/.{1,3}/g)?.join(' ') ?? digits
  return [cc, groups, extra].filter(Boolean).join(' ')
}

function HistoryRow({ call, onPick, onCall }: { call: FinishedCall; onPick: () => void; onCall: () => void }) {
  const missed = !call.answered
  const Icon = missed ? PhoneMissed : call.direction === 'incoming' ? PhoneIncoming : PhoneOutgoing
  return (
    <li className={`phone-history-row${missed ? ' is-missed' : ''}`}>
      <button type="button" className="phone-history-main" onClick={onPick} title="Poner en el marcador">
        <span className="phone-history-icon" aria-hidden>
          <Icon size={14} />
        </span>
        <span className="phone-history-meta">
          <strong>{call.label && call.label !== call.number ? call.label : prettyNumber(call.number)}</strong>
          <span>
            {call.label && call.label !== call.number ? `${prettyNumber(call.number)} · ` : ''}
            {missed ? 'Sin respuesta' : fmtDuration(call.durationSec)}
          </span>
        </span>
        <time className="phone-history-when font-mono">{fmtWhen(call.endedAt)}</time>
      </button>
      <button type="button" className="phone-history-call" onClick={onCall} aria-label={`Llamar a ${call.number}`}>
        <Phone size={14} />
      </button>
    </li>
  )
}

type DialSuggestion = {
  id: string
  name: string
  number: string
  hint: string
  source: 'contact' | 'recent'
}

type Props = {
  /** Se llama tras iniciar una llamada correctamente (p. ej. para cerrar el popover). */
  onCalled?: () => void
  /** Pestaña inicial. */
  initialTab?: PadTab
  /** Ventana agrandada: muestra sugerencias de a quién llamar junto al teclado. */
  roomy?: boolean
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
}

function buildSuggestions(history: FinishedCall[], query: string): DialSuggestion[] {
  const q = query.trim().toLowerCase()
  const qCompact = q.replace(/\s+/g, '')
  const qDigits = q.replace(/\D/g, '')
  const seen = new Set<string>()
  const out: DialSuggestion[] = []

  const push = (item: DialSuggestion) => {
    const tail = phoneTail(item.number)
    if (!tail || seen.has(tail)) return
    if (qCompact) {
      const hay = `${item.name} ${item.number} ${item.hint}`.toLowerCase()
      const digits = item.number.replace(/\D/g, '')
      if (!hay.includes(q) && !hay.replace(/\s+/g, '').includes(qCompact) && !(qDigits && digits.includes(qDigits))) {
        return
      }
    }
    seen.add(tail)
    out.push(item)
  }

  for (const c of loadImportantContacts()) {
    const number = toDialNumber(c.phone)
    if (!/^\+\d{9,15}$/.test(number)) continue
    push({
      id: `contact-${c.id}`,
      name: c.name,
      number,
      hint: c.role || 'Contacto',
      source: 'contact',
    })
  }

  for (const call of history) {
    push({
      id: `recent-${call.endedAt}-${call.number}`,
      name: call.label && call.label !== call.number ? call.label : prettyNumber(call.number),
      number: call.number,
      hint: call.answered ? 'Reciente' : 'Sin respuesta',
      source: 'recent',
    })
  }

  return out.slice(0, 8)
}

/**
 * Teléfono del CRM: teclado «liquid glass» + historial local. Sin llamada
 * activa marca el número; en llamada envía tonos DTMF.
 */
export default function SoftphonePad({ onCalled, initialTab = 'keypad', roomy = false }: Props) {
  const { status, callerId, call, history } = useSoftphone()
  const [tab, setTab] = useState<PadTab>(initialTab)
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [pressed, setPressed] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const pressTimer = useRef(0)

  const number = toDialNumber(value)
  const valid = /^\+\d{9,15}$/.test(number)
  const inCall = Boolean(call)
  const ready = status === 'ready'
  const suggestions = useMemo(() => buildSuggestions(history, value), [history, value])

  useEffect(() => () => window.clearTimeout(pressTimer.current), [])

  const flash = (d: string) => {
    setPressed(d)
    window.clearTimeout(pressTimer.current)
    pressTimer.current = window.setTimeout(() => setPressed(null), 140)
  }

  const press = (d: string) => {
    flash(d)
    if (inCall) {
      softphone.dtmf(d)
      return
    }
    setValue((v) => (v.length >= 20 ? v : v + d))
    inputRef.current?.focus()
  }

  const backspace = () => setValue((v) => v.slice(0, -1))

  const dial = async (raw?: string, label?: string) => {
    const target = raw ? toDialNumber(raw) : number
    if (!/^\+\d{9,15}$/.test(target) || busy) return
    setBusy(true)
    const ok = await softphone.call(target, { label: label?.trim() || target })
    setBusy(false)
    if (ok) {
      setValue('')
      onCalled?.()
    }
  }

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      void dial()
      return
    }
    if (/^[0-9*#+]$/.test(e.key)) flash(e.key)
  }

  const historyView = useMemo(() => history.slice(0, 200), [history])

  return (
    <div className={`phone-pad${roomy ? ' is-roomy' : ''}`}>
      <div className="phone-pad-tabs" role="tablist" aria-label="Teléfono">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'keypad'}
          className={`phone-pad-tab${tab === 'keypad' ? ' is-active' : ''}`}
          onClick={() => setTab('keypad')}
        >
          <Grid3x3 size={14} aria-hidden />
          Teclado
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'history'}
          className={`phone-pad-tab${tab === 'history' ? ' is-active' : ''}`}
          onClick={() => setTab('history')}
        >
          <Clock3 size={14} aria-hidden />
          Historial
          {historyView.length > 0 ? <em>{historyView.length}</em> : null}
        </button>
      </div>

      {tab === 'keypad' ? (
        <div className="phone-pad-main">
        <div className="phone-pad-dial">
          <div className={`phone-pad-display lg-surface${inCall ? ' is-dtmf' : ''}`}>
            {inCall ? (
              <span className="phone-pad-display-hint">En llamada · las teclas envían tonos</span>
            ) : (
              <>
                <input
                  ref={inputRef}
                  className="phone-pad-input font-mono"
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  placeholder="Escribe o marca…"
                  value={prettyNumber(value)}
                  onChange={(e) => setValue(e.target.value.replace(/[^\d+*#]/g, '').slice(0, 20))}
                  onKeyDown={onKeyDown}
                  aria-label="Número a marcar"
                />
                <button
                  type="button"
                  className="phone-pad-backspace"
                  onClick={backspace}
                  disabled={!value}
                  aria-label="Borrar último dígito"
                >
                  <Delete size={16} />
                </button>
              </>
            )}
          </div>

          <div className="phone-keypad" role="group" aria-label="Teclado numérico">
            {KEYS.map(({ d, sub }) => (
              <button
                key={d}
                type="button"
                className={`lg-key${pressed === d ? ' is-pressed' : ''}`}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => press(d)}
                aria-label={`Tecla ${d}`}
              >
                <span className="lg-key-digit">{d}</span>
                {sub ? <span className="lg-key-sub">{sub}</span> : <span className="lg-key-sub" aria-hidden />}
                <span className="lg-key-shine" aria-hidden />
              </button>
            ))}
          </div>

          <div className="phone-pad-actions">
            {inCall ? (
              <button type="button" className="lg-call is-hangup" onClick={() => void softphone.hangup()} aria-label="Colgar">
                <PhoneOff size={22} aria-hidden />
              </button>
            ) : (
              <button
                type="button"
                className="lg-call"
                onClick={() => void dial()}
                disabled={!valid || busy || !ready}
                title={!ready ? 'El teléfono no está conectado' : 'Llamar'}
                aria-label="Llamar"
              >
                <Phone size={22} aria-hidden />
              </button>
            )}
          </div>

          <p className="phone-pad-hint">
            {!ready ? (
              status === 'connecting' ? 'Conectando teléfono…' : 'Teléfono sin conexión.'
            ) : callerId ? (
              <>
                El cliente verá <strong className="font-mono">{callerId}</strong>
              </>
            ) : (
              'Sin número de salida asignado: la llamada puede fallar.'
            )}
          </p>
        </div>

        <aside className="phone-suggest" aria-label="Sugerencias de llamada">
          <p className="phone-suggest-title">
            <Sparkles size={13} aria-hidden />
            {value ? 'Coincidencias' : 'A quién llamar'}
          </p>
          {inCall ? (
            <p className="phone-pad-hint">Sugerencias al colgar.</p>
          ) : suggestions.length === 0 ? (
            <p className="phone-pad-hint">
              {value
                ? 'Ningún contacto ni llamada reciente coincide.'
                : 'Añade un teléfono en Contactos o llama una vez: aparecerán aquí.'}
            </p>
          ) : (
            <ul className="phone-suggest-list custom-scrollbar-light">
              {suggestions.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className="phone-suggest-row"
                    onClick={() => {
                      setValue(s.number)
                      inputRef.current?.focus()
                    }}
                  >
                    <span className={`phone-suggest-avatar is-${s.source}`} aria-hidden>
                      {s.source === 'contact' ? initials(s.name) : <User size={13} />}
                    </span>
                    <span className="phone-suggest-meta">
                      <strong>{s.name}</strong>
                      <span>
                        {prettyNumber(s.number)}
                        {s.hint ? ` · ${s.hint}` : ''}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="phone-suggest-call"
                    onClick={() => void dial(s.number, s.name)}
                    aria-label={`Llamar a ${s.name}`}
                    disabled={busy || !ready}
                  >
                    <Phone size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
        </div>
      ) : (
        <div className="phone-history">
          {historyView.length === 0 ? (
            <p className="phone-pad-hint phone-history-empty">Todavía no hay llamadas desde este navegador.</p>
          ) : (
            <>
              <ul className="phone-history-list custom-scrollbar-light">
                {historyView.map((c) => (
                  <HistoryRow
                    key={`${c.endedAt}-${c.number}`}
                    call={c}
                    onPick={() => {
                      setValue(c.number)
                      setTab('keypad')
                    }}
                    onCall={() => void dial(c.number)}
                  />
                ))}
              </ul>
              <button type="button" className="ghost-button phone-history-clear" onClick={() => softphone.clearHistory()}>
                <Trash2 size={13} aria-hidden />
                Vaciar historial
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

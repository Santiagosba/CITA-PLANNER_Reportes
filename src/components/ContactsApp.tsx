import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { Check, Headset, Mail, Pencil, Phone, Plus, Shield, Trash2, Wrench, X } from 'lucide-react'
import { toDialNumber } from '../lib/softphone'

const CONTACTS_KEY = 'avi-important-contacts'

export type ContactKind = 'admin' | 'it' | 'calls' | 'other'

export type ImportantContact = {
  id: string
  kind: ContactKind
  name: string
  role: string
  phone: string
  email: string
  hours: string
}

const KIND_LABEL: Record<ContactKind, string> = {
  admin: 'Administración',
  it: 'Soporte IT',
  calls: 'Soporte de llamadas',
  other: 'Otro',
}

/** Sin números inventados: cada taller rellena los suyos la primera vez. */
const SEED: ImportantContact[] = [
  { id: 'admin', kind: 'admin', name: 'Administración', role: 'Altas, permisos y facturación', phone: '', email: '', hours: 'L–V 9:00–18:00' },
  { id: 'it', kind: 'it', name: 'Soporte IT', role: 'Accesos, DMS, incidencias del CRM', phone: '', email: '', hours: 'L–V 8:00–20:00' },
  { id: 'calls', kind: 'calls', name: 'Soporte de llamadas', role: 'Teléfono, grabaciones, números de salida', phone: '', email: '', hours: 'L–V 8:00–20:00' },
]

export function loadImportantContacts(): ImportantContact[] {
  try {
    const raw = localStorage.getItem(CONTACTS_KEY)
    if (!raw) return SEED
    const parsed = JSON.parse(raw) as ImportantContact[]
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : SEED
  } catch {
    return SEED
  }
}

function save(list: ImportantContact[]) {
  try {
    localStorage.setItem(CONTACTS_KEY, JSON.stringify(list))
  } catch {
    /* ignore */
  }
}

function KindIcon({ kind, size = 18 }: { kind: ContactKind; size?: number }) {
  if (kind === 'admin') return <Shield size={size} />
  if (kind === 'it') return <Wrench size={size} />
  if (kind === 'calls') return <Headset size={size} />
  return <Phone size={size} />
}

type Draft = Omit<ImportantContact, 'id'>

function ContactForm({ initial, onSave, onCancel }: { initial: Draft; onSave: (d: Draft) => void; onCancel: () => void }) {
  const [d, setD] = useState<Draft>(initial)
  const set = (k: keyof Draft) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setD((prev) => ({ ...prev, [k]: e.target.value }))
  const valid = d.name.trim().length > 0
  return (
    <form
      className="contacts-form lg-surface"
      onSubmit={(e) => {
        e.preventDefault()
        if (valid) onSave({ ...d, name: d.name.trim(), phone: d.phone.trim(), email: d.email.trim() })
      }}
    >
      <label className="contacts-field">
        <span>Tipo</span>
        <select value={d.kind} onChange={set('kind')}>
          {(Object.keys(KIND_LABEL) as ContactKind[]).map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>
      </label>
      <label className="contacts-field">
        <span>Nombre</span>
        <input value={d.name} onChange={set('name')} placeholder="Soporte IT" autoFocus />
      </label>
      <label className="contacts-field">
        <span>Para qué</span>
        <input value={d.role} onChange={set('role')} placeholder="Accesos, DMS, incidencias" />
      </label>
      <label className="contacts-field">
        <span>Teléfono</span>
        <input value={d.phone} onChange={set('phone')} type="tel" inputMode="tel" placeholder="+34 600 000 000" className="font-mono" />
      </label>
      <label className="contacts-field">
        <span>Email</span>
        <input value={d.email} onChange={set('email')} type="email" placeholder="soporte@empresa.es" />
      </label>
      <label className="contacts-field">
        <span>Horario</span>
        <input value={d.hours} onChange={set('hours')} placeholder="L–V 9:00–18:00" />
      </label>
      <div className="contacts-form-actions">
        <button type="button" className="ghost-button" onClick={onCancel}>
          <X size={14} aria-hidden />
          Cancelar
        </button>
        <button type="submit" className="client-submit" disabled={!valid}>
          <Check size={14} aria-hidden />
          Guardar
        </button>
      </div>
    </form>
  )
}

/**
 * Contactos importantes del taller (administración, soporte IT, soporte de
 * llamadas…). Se guardan en este navegador; «Llamar» pasa por el softphone.
 */
export default function ContactsApp() {
  const [list, setList] = useState<ImportantContact[]>(() => loadImportantContacts())
  const [editing, setEditing] = useState<string | 'new' | null>(null)

  useEffect(() => {
    save(list)
  }, [list])

  const sorted = useMemo(() => {
    const order: ContactKind[] = ['admin', 'it', 'calls', 'other']
    return [...list].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.name.localeCompare(b.name, 'es'))
  }, [list])

  const upsert = (id: string | 'new', d: Draft) => {
    if (id === 'new') {
      setList((prev) => [...prev, { id: `c-${Date.now().toString(36)}`, ...d }])
    } else {
      setList((prev) => prev.map((c) => (c.id === id ? { ...c, ...d } : c)))
    }
    setEditing(null)
  }

  const remove = (id: string) => {
    setList((prev) => prev.filter((c) => c.id !== id))
    setEditing(null)
  }

  return (
    <div className="contacts-app">
      <div className="contacts-bar">
        <span className="quick-notes-count">
          {sorted.length} {sorted.length === 1 ? 'contacto' : 'contactos'}
        </span>
        <button type="button" className="client-submit quick-notes-new" onClick={() => setEditing('new')} disabled={editing === 'new'}>
          <Plus size={15} aria-hidden />
          Añadir
        </button>
      </div>

      {editing === 'new' ? (
        <ContactForm
          initial={{ kind: 'other', name: '', role: '', phone: '', email: '', hours: '' }}
          onSave={(d) => upsert('new', d)}
          onCancel={() => setEditing(null)}
        />
      ) : null}

      <ul className="contacts-list custom-scrollbar-light">
        {sorted.map((c) => {
          if (editing === c.id) {
            return (
              <li key={c.id}>
                <ContactForm initial={c} onSave={(d) => upsert(c.id, d)} onCancel={() => setEditing(null)} />
              </li>
            )
          }
          const dial = c.phone ? toDialNumber(c.phone) : ''
          const canCall = /^\+\d{9,15}$/.test(dial)
          return (
            <li key={c.id} className={`contacts-card lg-surface kind-${c.kind}`}>
              <span className="contacts-avatar" aria-hidden>
                <KindIcon kind={c.kind} />
              </span>
              <div className="contacts-main">
                <span className="contacts-kind">{KIND_LABEL[c.kind]}</span>
                <strong>{c.name}</strong>
                {c.role ? <span className="contacts-role">{c.role}</span> : null}
                <span className="contacts-lines">
                  {c.phone ? (
                    <span className="font-mono">{c.phone}</span>
                  ) : (
                    <button type="button" className="contacts-missing" onClick={() => setEditing(c.id)}>
                      Sin teléfono · añadir
                    </button>
                  )}
                  {c.email ? <span>{c.email}</span> : null}
                  {c.hours ? <span className="contacts-hours">{c.hours}</span> : null}
                </span>
              </div>
              <div className="contacts-actions">
                {canCall ? (
                  <a
                    href={`tel:${dial}`}
                    className="contacts-call"
                    data-call-label={c.name}
                    title={`Llamar a ${c.name}`}
                    aria-label={`Llamar a ${c.name}`}
                  >
                    <Phone size={15} />
                  </a>
                ) : null}
                {c.email ? (
                  <a href={`mailto:${c.email}`} className="ghost-button lead-icon-btn" title="Escribir email" aria-label="Escribir email">
                    <Mail size={14} />
                  </a>
                ) : null}
                <button type="button" className="ghost-button lead-icon-btn" onClick={() => setEditing(c.id)} title="Editar" aria-label="Editar">
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  className="ghost-button lead-icon-btn"
                  onClick={() => remove(c.id)}
                  title="Eliminar"
                  aria-label="Eliminar"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </li>
          )
        })}
      </ul>
      <p className="phone-pad-hint">Se guardan en este navegador. Las llamadas salen por el teléfono del CRM.</p>
    </div>
  )
}

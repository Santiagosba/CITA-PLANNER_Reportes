import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowRight, Inbox, Phone } from 'lucide-react'
import ActionButton, { type ActionStatus } from './ui/ActionButton'
import VehiclePlate from './ui/VehiclePlate'
import { formatFecha, type PeticionPendiente } from '../lib/peticionesPendientes'

const STEPS = [
  { id: 1, label: 'Revisar' },
  { id: 2, label: 'Notas' },
  { id: 3, label: 'Confirmar' },
] as const

type Props = {
  peticion: PeticionPendiente | null
  saveStatus: ActionStatus
  gestionObs: string
  gestionEmail: string
  onGestionObsChange: (v: string) => void
  onGestionEmailChange: (v: string) => void
  onMarkGestionado: (gestionado: boolean) => void
}

export default function PeticionGestionPanel({
  peticion: p,
  saveStatus,
  gestionObs,
  gestionEmail,
  onGestionObsChange,
  onGestionEmailChange,
  onMarkGestionado,
}: Props) {
  const [step, setStep] = useState(1)

  useEffect(() => {
    setStep(1)
  }, [p?.idpeticion])

  if (!p) {
    return (
      <div className="dashboard-detail-empty">
        <Inbox size={40} className="text-[var(--muted)]" aria-hidden />
        <p className="section-title mt-4" style={{ fontSize: 'var(--font-lg)' }}>
          Elige una consulta
        </p>
        <p className="section-subtitle mt-2">
          Toca una fila de la cola para ver los datos y gestionarla.
        </p>
      </div>
    )
  }

  const c = p.cita
  const cliente = c ? [c.nombre, c.apellidos].filter(Boolean).join(' ') : null
  const titulo = cliente || p.caller || 'Consulta sin nombre'
  const tel = p.caller?.replace(/\s/g, '') ?? ''
  const telHref = tel ? `tel:${tel}` : null

  return (
    <div className="dashboard-detail-inner panel-stack">
      <div>
        <p className="section-eyebrow">Gestionando</p>
        <h2 className="section-title">{titulo}</h2>
        <p className="section-subtitle mt-1">
          {p.tipopeticion ?? 'Consulta'} · {formatFecha(p.fechainicio)}
        </p>
      </div>

      <nav className="wizard-steps" aria-label="Pasos de gestión">
        {STEPS.map((s) => (
          <span
            key={s.id}
            className={`wizard-step ${step === s.id ? 'is-current' : ''} ${step > s.id ? 'is-done' : ''}`}
          >
            <span className="wizard-step-num">{step > s.id ? '✓' : s.id}</span>
            {s.label}
          </span>
        ))}
      </nav>

      {step === 1 ? (
        <div className="panel-stack">
          {p.descripcion ? <p className="section-subtitle">{p.descripcion}</p> : null}
          <dl className="todo-detail-grid">
            <Detail label="Teléfono" value={p.caller} />
            <Detail label="Consulta" value={formatFecha(p.fechainicio)} />
            <Detail label="Tipo" value={p.tipopeticion} />
            <Detail label="Cita en calendario" value={formatFecha(p.cita?.fecha) || 'Todavía no'} />
            {p.cita?.matricula ? (
              <Detail label="Matrícula" value={<VehiclePlate value={p.cita.matricula} />} />
            ) : null}
          </dl>
          {telHref ? (
            <a href={telHref} className="client-submit todo-call-full">
              <Phone size={20} />
              Llamar a {p.caller}
            </a>
          ) : null}
          <button type="button" className="client-submit" onClick={() => setStep(2)}>
            He revisado los datos
            <ArrowRight size={18} />
          </button>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="panel-stack">
          <p className="field-label">¿Quieres dejar una nota? (opcional)</p>
          <input
            type="email"
            placeholder="Correo de contacto"
            value={gestionEmail}
            onChange={(e) => onGestionEmailChange(e.target.value)}
            className="field-input"
          />
          <textarea
            rows={4}
            placeholder="Qué has hecho con esta consulta…"
            value={gestionObs}
            onChange={(e) => onGestionObsChange(e.target.value)}
            className="field-input field-textarea"
          />
          <div className="todo-gestion-actions">
            <button type="button" className="ghost-button" onClick={() => setStep(1)}>
              Atrás
            </button>
            <button type="button" className="client-submit flex-1" onClick={() => setStep(3)}>
              Continuar
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="panel-stack">
          <div className="glass-inline glass-lite card-pad-sm">
            <p className="section-eyebrow">Resumen</p>
            <p className="section-title" style={{ fontSize: 'var(--font-lg)' }}>
              {titulo}
            </p>
            {gestionObs ? (
              <p className="section-subtitle mt-2">
                <strong>Nota:</strong> {gestionObs}
              </p>
            ) : null}
          </div>
          <div className="todo-gestion-actions">
            <button type="button" className="ghost-button" onClick={() => setStep(2)}>
              Atrás
            </button>
            <ActionButton
              variant="success"
              status={saveStatus}
              successLabel="Gestionado"
              className="flex-1"
              onClick={() => onMarkGestionado(true)}
            >
              Ya está gestionado
            </ActionButton>
          </div>
          <button
            type="button"
            className="ghost-button w-full-btn"
            disabled={saveStatus === 'loading' || saveStatus === 'success'}
            onClick={() => onMarkGestionado(false)}
          >
            Solo guardar nota sin cerrar
          </button>
        </div>
      ) : null}
    </div>
  )
}

function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="todo-detail">
      <dt>{label}</dt>
      <dd>{value || '—'}</dd>
    </div>
  )
}

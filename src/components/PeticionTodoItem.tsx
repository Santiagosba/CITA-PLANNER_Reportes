import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowRight, Phone } from 'lucide-react'
import ActionButton, { type ActionStatus } from './ui/ActionButton'
import VehiclePlate from './ui/VehiclePlate'
import { formatAgendaTime } from '../lib/agendaGrouping'
import { formatFecha, isPeticionPendiente, type PeticionPendiente } from '../lib/peticionesPendientes'

const STEPS = [
  { id: 1, label: 'Revisar' },
  { id: 2, label: 'Notas' },
  { id: 3, label: 'Confirmar' },
] as const

type Props = {
  peticion: PeticionPendiente
  expanded: boolean
  saveStatus: ActionStatus
  gestionObs: string
  gestionEmail: string
  onToggle: () => void
  onGestionObsChange: (v: string) => void
  onGestionEmailChange: (v: string) => void
  onMarkGestionado: (gestionado: boolean) => void
}

export default function PeticionTodoItem({
  peticion: p,
  expanded,
  saveStatus,
  gestionObs,
  gestionEmail,
  onToggle,
  onGestionObsChange,
  onGestionEmailChange,
  onMarkGestionado,
}: Props) {
  const [step, setStep] = useState(1)
  const pendiente = isPeticionPendiente(p)
  const c = p.cita
  const cliente = c ? [c.nombre, c.apellidos].filter(Boolean).join(' ') : null
  const titulo = cliente || p.caller || 'Consulta sin nombre'
  const tel = p.caller?.replace(/\s/g, '') ?? ''
  const telHref = tel ? `tel:${tel}` : null

  useEffect(() => {
    if (!expanded) setStep(1)
  }, [expanded, p.idpeticion])

  return (
    <li className={`todo-item glass glass-lite scroll-reveal ${expanded ? 'is-expanded' : ''}`}>
      <div className="todo-item-main">
        <button
          type="button"
          className="todo-item-toggle"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={`todo-body-${p.idpeticion}`}
        >
          <span className="todo-item-marker" aria-hidden />
          <span className="todo-item-content">
            <span className="todo-item-top">
              <span className="todo-item-title">{titulo}</span>
              <span className="todo-item-time">{formatAgendaTime(p.fechainicio)}</span>
            </span>
            <span className="todo-item-meta">
              {p.tipopeticion ?? 'Consulta general'}
              {p.caller ? ` · ${p.caller}` : ''}
            </span>
          </span>
          <span className={`badge ${pendiente ? 'tone-warning' : 'tone-positive'}`}>
            {pendiente ? 'Sin cita' : 'Con cita'}
          </span>
          <span className={`todo-item-chevron ${expanded ? 'is-open' : ''}`} aria-hidden>
            ▾
          </span>
        </button>

        {!expanded && telHref ? (
          <a href={telHref} className="todo-item-call confirm-action">
            <Phone size={16} />
            Llamar
          </a>
        ) : null}
      </div>

      {expanded ? (
        <div id={`todo-body-${p.idpeticion}`} className="todo-item-body panel-stack">
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
            <div className="panel-stack scroll-reveal is-visible">
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
            <div className="panel-stack scroll-reveal is-visible">
              <p className="field-label">¿Quieres dejar una nota? (opcional)</p>
              <input
                type="email"
                placeholder="Correo de contacto"
                value={gestionEmail}
                onChange={(e) => onGestionEmailChange(e.target.value)}
                className="field-input"
              />
              <textarea
                rows={3}
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
            <div className="panel-stack scroll-reveal is-visible">
              <div className="glass-inline glass-lite card-pad-sm">
                <p className="section-eyebrow">Resumen</p>
                <p className="section-title" style={{ fontSize: 'var(--font-lg)' }}>
                  {titulo}
                </p>
                <p className="section-subtitle mt-1">
                  {p.tipopeticion} · {formatFecha(p.fechainicio)}
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
      ) : null}
    </li>
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

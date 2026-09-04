import { ChevronDown, Phone } from 'lucide-react'
import type { ReactNode } from 'react'
import ActionButton, { type ActionStatus } from './ui/ActionButton'
import VehiclePlate from './ui/VehiclePlate'
import { formatAgendaTime } from '../lib/agendaGrouping'
import { formatFecha, isPeticionPendiente, type PeticionPendiente } from '../lib/peticionesPendientes'

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

export default function PeticionRow({
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
  const pendiente = isPeticionPendiente(p)
  const c = p.cita
  const cliente = c ? [c.nombre, c.apellidos].filter(Boolean).join(' ') : ''
  const titulo = cliente || p.caller || 'Consulta sin nombre'
  const vehiculo = c ? [c.marca, c.modelo].filter(Boolean).join(' ') : ''
  const tel = p.caller?.replace(/\s/g, '') ?? ''
  const telHref = tel ? `tel:${tel}` : null

  // Datos que el asesor necesita ver de un vistazo para llamar con contexto
  const facts: { label: string; value: ReactNode }[] = []
  if (p.caller) facts.push({ label: 'Tel', value: p.caller })
  facts.push({ label: 'Tipo', value: p.tipopeticion ?? 'Sin tipo' })
  facts.push({ label: 'Consulta', value: formatFecha(p.fechainicio) })
  if (c?.matricula) {
    facts.push({
      label: 'Matrícula',
      value: <VehiclePlate value={c.matricula} compact />,
    })
  }
  if (vehiculo) facts.push({ label: 'Vehículo', value: vehiculo })
  if (c?.email) facts.push({ label: 'Email', value: c.email })
  if (c?.fecha) facts.push({ label: 'Cita', value: formatFecha(c.fecha) })

  return (
    <li className={`prow glass ${expanded ? 'is-expanded' : ''}`}>
      <div className="prow-head">
        <button
          type="button"
          className="prow-toggle"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={`prow-body-${p.idpeticion}`}
        >
          <span className={`prow-marker ${pendiente ? 'is-pending' : 'is-done'}`} aria-hidden />
          <span className="prow-info">
            <span className="prow-headline">
              <span className="prow-name">{titulo}</span>
              <span className={`badge ${pendiente ? 'tone-warning' : 'tone-positive'}`}>
                {pendiente ? 'Sin cita' : 'Con cita'}
              </span>
            </span>
            <span className="prow-facts">
              {facts.map((f) => (
                <span key={f.label} className="prow-fact">
                  <span className="prow-fact-label">{f.label}</span>
                  <span className="prow-fact-value">{f.value}</span>
                </span>
              ))}
            </span>
            {p.descripcion ? <span className="prow-desc">{p.descripcion}</span> : null}
          </span>
          <span className="prow-aside">
            <span className="prow-time">{formatAgendaTime(p.fechainicio)}</span>
            <ChevronDown size={20} className={`prow-chevron ${expanded ? 'is-open' : ''}`} aria-hidden />
          </span>
        </button>

        {telHref ? (
          <a href={telHref} className="prow-call confirm-action" aria-label={`Llamar a ${p.caller}`}>
            <Phone size={16} />
            Llamar
          </a>
        ) : null}
      </div>

      {expanded ? (
        <div id={`prow-body-${p.idpeticion}`} className="prow-body">
          <dl className="prow-detail-grid">
            <Detail label="Teléfono" value={p.caller} />
            <Detail label="Cliente" value={cliente || '—'} />
            <Detail label="Tipo de consulta" value={p.tipopeticion} />
            <Detail label="Fecha de la consulta" value={formatFecha(p.fechainicio)} />
            <Detail label="Cita en calendario" value={formatFecha(p.cita?.fecha) || 'Todavía no'} />
            {c?.matricula ? (
              <Detail label="Matrícula" value={<VehiclePlate value={c.matricula} />} />
            ) : null}
            {vehiculo ? <Detail label="Vehículo" value={vehiculo} /> : null}
            {c?.email ? <Detail label="Email" value={c.email} /> : null}
          </dl>

          <div className="prow-gestion">
            <label className="field-label" htmlFor={`obs-${p.idpeticion}`}>
              Notas de gestión <span className="prow-optional">(opcional)</span>
            </label>
            <input
              type="email"
              placeholder="Correo de contacto"
              value={gestionEmail}
              onChange={(e) => onGestionEmailChange(e.target.value)}
              className="field-input"
            />
            <textarea
              id={`obs-${p.idpeticion}`}
              rows={3}
              placeholder="Qué has hecho con esta consulta…"
              value={gestionObs}
              onChange={(e) => onGestionObsChange(e.target.value)}
              className="field-input field-textarea"
            />
            <div className="prow-actions">
              <button
                type="button"
                className="ghost-button"
                disabled={saveStatus === 'loading' || saveStatus === 'success'}
                onClick={() => onMarkGestionado(false)}
              >
                Guardar nota
              </button>
              <ActionButton
                variant="success"
                status={saveStatus}
                successLabel="Gestionado"
                onClick={() => onMarkGestionado(true)}
              >
                Ya está gestionado
              </ActionButton>
            </div>
          </div>
        </div>
      ) : null}
    </li>
  )
}

function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="prow-detail">
      <dt>{label}</dt>
      <dd>{value || '—'}</dd>
    </div>
  )
}

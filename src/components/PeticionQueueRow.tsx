import { Phone } from 'lucide-react'
import { formatAgendaTime } from '../lib/agendaGrouping'
import { isPeticionPendiente, type PeticionPendiente } from '../lib/peticionesPendientes'

type Props = {
  peticion: PeticionPendiente
  active: boolean
  onSelect: () => void
}

export default function PeticionQueueRow({ peticion: p, active, onSelect }: Props) {
  const pendiente = isPeticionPendiente(p)
  const c = p.cita
  const cliente = c ? [c.nombre, c.apellidos].filter(Boolean).join(' ') : null
  const titulo = cliente || p.caller || 'Consulta sin nombre'
  const tel = p.caller?.replace(/\s/g, '') ?? ''
  const telHref = tel ? `tel:${tel}` : null

  return (
    <li>
      <div className={`queue-row ${active ? 'is-active' : ''}`}>
        <button type="button" className="queue-row-main" onClick={onSelect}>
          <span className="queue-row-marker" aria-hidden />
          <span className="queue-row-body">
            <span className="queue-row-top">
              <span className="queue-row-title">{titulo}</span>
              <span className="queue-row-time">{formatAgendaTime(p.fechainicio)}</span>
            </span>
            <span className="queue-row-meta">{p.tipopeticion ?? 'Consulta general'}</span>
          </span>
          <span className={`badge ${pendiente ? 'tone-warning' : 'tone-positive'}`}>
            {pendiente ? 'Sin cita' : 'Con cita'}
          </span>
        </button>
        {telHref ? (
          <a
            href={telHref}
            className="queue-row-call confirm-action"
            onClick={(e) => e.stopPropagation()}
            aria-label={`Llamar a ${p.caller}`}
          >
            <Phone size={16} />
          </a>
        ) : null}
      </div>
    </li>
  )
}

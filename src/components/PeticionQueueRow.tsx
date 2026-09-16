import { Phone } from 'lucide-react'
import { formatAgendaTime } from '../lib/agendaGrouping'
import { isPeticionPendiente, type PeticionPendiente } from '../lib/peticionesPendientes'
import { ticketClientLabel } from '../lib/ticketClient'

type Props = {
  peticion: PeticionPendiente
  active: boolean
  onSelect: () => void
}

export default function PeticionQueueRow({ peticion: p, active, onSelect }: Props) {
  const pendiente = isPeticionPendiente(p)
  const titulo = ticketClientLabel(p)
  const tel = p.caller?.replace(/\s/g, '') ?? ''
  const telHref = tel ? `tel:${tel}` : null

  return (
    <li>
      <div className={`queue-row flex min-w-0 items-center gap-2 ${active ? 'is-active' : ''}`}>
        <button type="button" className="queue-row-main flex min-w-0 flex-1 items-center gap-2 text-left" onClick={onSelect}>
          <span className="queue-row-marker shrink-0" aria-hidden />
          <span className="queue-row-body flex min-w-0 flex-1 flex-col">
            <span className="queue-row-top flex min-w-0 items-center justify-between gap-2">
              <span className="queue-row-title truncate font-semibold text-avi-fog-strong">{titulo}</span>
              <span className="queue-row-time shrink-0 text-[12px] text-avi-muted">{formatAgendaTime(p.fechainicio)}</span>
            </span>
            <span className="queue-row-meta truncate text-[12px] text-avi-muted">{p.tipopeticion ?? 'Consulta general'}</span>
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
            data-call-label={titulo}
            data-call-peticion={p.idpeticion}
          >
            <Phone size={16} />
          </a>
        ) : null}
      </div>
    </li>
  )
}

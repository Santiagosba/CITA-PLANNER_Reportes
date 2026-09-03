import { formatFecha, isPeticionPendiente, type PeticionPendiente } from '../lib/peticionesPendientes'

type Props = {
  peticion: PeticionPendiente
  active?: boolean
  onClick?: () => void
}

export default function PeticionCard({ peticion: p, active, onClick }: Props) {
  const pendiente = isPeticionPendiente(p)
  const c = p.cita
  const cliente = c ? [c.nombre, c.apellidos].filter(Boolean).join(' ') : null
  const titulo = cliente || p.caller || 'Sin teléfono'

  const Tag = onClick ? 'button' : 'div'

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`list-row block w-full ${active ? 'is-active' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 text-left">
          <p className="list-row-title truncate">{titulo}</p>
          <p className="list-row-meta mt-0.5 truncate">{p.tipopeticion ?? 'Consulta general'}</p>
          {p.caller ? <p className="list-row-meta mt-1">Tel: {p.caller}</p> : null}
        </div>
        <div className="shrink-0 text-right">
          <span className={`badge ${pendiente ? 'tone-warning' : 'tone-positive'}`}>
            {pendiente ? 'Sin cita' : 'Con cita'}
          </span>
          <p className="list-row-meta mt-2">{formatFecha(p.fechainicio)}</p>
        </div>
      </div>
    </Tag>
  )
}

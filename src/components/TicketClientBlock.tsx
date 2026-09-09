import { ticketClientLabel, ticketClientPhone } from '../lib/ticketClient'
import type { PeticionPendiente } from '../lib/peticionesPendientes'

type Props = {
  peticion: PeticionPendiente
  size?: 'sm' | 'md' | 'lg'
}

export default function TicketClientBlock({ peticion, size = 'md' }: Props) {
  const name = ticketClientLabel(peticion)
  const phone = ticketClientPhone(peticion)
  return (
    <div className={`ticket-client is-${size}`}>
      <p className="ticket-client-name">{name}</p>
      <p className="ticket-client-phone">{phone || 'Sin teléfono'}</p>
    </div>
  )
}

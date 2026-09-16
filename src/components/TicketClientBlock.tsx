import { ticketClientLabel, ticketClientPhone, ticketNeedLabel } from '../lib/ticketClient'
import type { PeticionPendiente } from '../lib/peticionesPendientes'

type Props = {
  peticion: PeticionPendiente
  size?: 'sm' | 'md' | 'lg'
}

const nameSize = {
  sm: 'text-base',
  md: 'text-lg',
  lg: 'text-xl',
} as const

const phoneSize = {
  sm: 'text-[12px]',
  md: 'text-[13px]',
  lg: 'text-sm',
} as const

export default function TicketClientBlock({ peticion, size = 'md' }: Props) {
  const name = ticketClientLabel(peticion)
  const phone = ticketClientPhone(peticion)
  const need = ticketNeedLabel(peticion)
  return (
    <div className={`ticket-client is-${size} flex min-w-0 flex-col items-start gap-0.5`}>
      <p className={`ticket-client-name m-0 font-bold leading-tight tracking-[-0.02em] text-avi-fog-strong ${nameSize[size]}`}>
        {name}
      </p>
      <p className={`ticket-client-phone m-0 font-medium leading-snug text-avi-muted ${phoneSize[size]}`}>
        {phone || 'Sin teléfono'}
      </p>
      <p className="ticket-client-need mt-1 line-clamp-2 text-base font-semibold leading-snug text-avi-fog-strong">
        {need}
      </p>
    </div>
  )
}

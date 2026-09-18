import { findCachedPeticiones } from '../hooks/useOperationalData'
import {
  ticketClientLabel,
  ticketClientPhone,
  ticketIsCancelled,
  ticketIsRecontact,
  ticketNeedLabel,
} from '../lib/ticketClient'
import type { PeticionPendiente } from '../lib/peticionesPendientes'

type Props = {
  peticion: PeticionPendiente
  size?: 'sm' | 'md' | 'lg'
}

const nameSize = {
  sm: 'text-lg',
  md: 'text-[1.4rem]',
  lg: 'text-[1.7rem]',
} as const

const needSize = {
  sm: 'text-[15px]',
  md: 'text-[17px]',
  lg: 'text-lg',
} as const

export default function TicketClientBlock({ peticion, size = 'md' }: Props) {
  const name = ticketClientLabel(peticion)
  const phone = ticketClientPhone(peticion)
  const need = ticketNeedLabel(peticion)
  const cancelled = ticketIsCancelled(peticion)
  const recontact = ticketIsRecontact(peticion, findCachedPeticiones())

  return (
    <div className="flex min-w-0 flex-col items-start gap-1.5">
      {cancelled || recontact ? (
        <div className="flex flex-wrap gap-1.5">
          {cancelled ? <span className="badge tone-negative">Cancelada</span> : null}
          {recontact ? <span className="badge tone-info">Recontacto</span> : null}
        </div>
      ) : null}
      <p
        className={`m-0 font-extrabold leading-[1.15] tracking-[-0.03em] text-avi-fog-strong ${nameSize[size]}`}
      >
        {name}
      </p>
      <p className="m-0 text-[13px] font-medium leading-snug text-avi-muted">{phone || 'Sin teléfono'}</p>
      <p
        className={`m-0 line-clamp-3 font-bold leading-snug text-avi-brand ${needSize[size]}`}
      >
        {need}
      </p>
    </div>
  )
}

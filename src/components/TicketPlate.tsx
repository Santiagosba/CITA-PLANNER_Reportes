import VehiclePlate, { formatMatricula } from './ui/VehiclePlate'
import { ticketPlate } from '../lib/ticketPlate'
import type { PeticionPendiente } from '../lib/peticionesPendientes'

type Props = {
  value?: string | null
  peticion?: PeticionPendiente
  compact?: boolean
  className?: string
}

/** Siempre pinta la chapa. Si no hay matrícula, deja el hueco «SIN MATRÍCULA». */
export default function TicketPlate({ value, peticion, compact = true, className = '' }: Props) {
  const raw = (peticion ? ticketPlate(peticion) : '') || String(value || '')
  const plate = formatMatricula(raw)
  if (plate) return <VehiclePlate value={plate} compact={compact} className={`shrink-0 ${className}`.trim()} />
  return (
    <span
      className={`ops-feed-placeholder inline-flex h-[30px] min-w-[142px] shrink-0 items-center justify-center rounded-[5px] border border-dashed border-black/15 bg-white/70 px-2 text-center text-[8px] font-bold tracking-[0.06em] text-avi-muted ${className}`.trim()}
    >
      SIN MATRÍCULA
    </span>
  )
}

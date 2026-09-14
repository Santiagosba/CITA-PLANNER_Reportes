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
  const plate = formatMatricula(value || '') || (peticion ? ticketPlate(peticion) : '')
  if (plate) return <VehiclePlate value={plate} compact={compact} className={className} />
  return <span className={`ops-feed-placeholder ${className}`.trim()}>SIN MATRÍCULA</span>
}

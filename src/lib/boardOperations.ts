/**
 * Eje del gestor de tableros: una pestaña por operación (tipo de consulta),
 * no por departamentos fijos del taller.
 */

import {
  Car,
  ClipboardList,
  MessageCircle,
  Package,
  Phone,
  ShieldCheck,
  ShoppingBag,
  Wrench,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { PeticionPendiente } from './peticionesPendientes'

export type BoardOperation = {
  id: string
  label: string
  description: string
  icon: LucideIcon
}

const LEGACY_BOARDS: Record<string, string> = {
  mechanics: 'Mecánica & Diagnosis',
  bodywork: 'Carrocería & Pintura',
  insurance: 'Peritaje de Seguros',
  parts: 'Recambios & Flotas',
  sales: 'Ventas VN / VO',
}

export const EMPTY_OPERATION_ID = 'tipo-sin-tipo'

export function slugOperationLabel(label: string | null | undefined): string {
  const raw = String(label || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return raw || 'sin-tipo'
}

export function operationLabelOf(item: Pick<PeticionPendiente, 'tipopeticion'>): string {
  const label = String(item.tipopeticion || '').trim()
  return label || 'Sin tipo'
}

export function operationKeyOf(
  item: Pick<PeticionPendiente, 'idtipopeticion' | 'tipopeticion'>,
): string {
  if (item.idtipopeticion != null && Number.isFinite(Number(item.idtipopeticion))) {
    return `tipo-${Number(item.idtipopeticion)}`
  }
  return `tipo-${slugOperationLabel(operationLabelOf(item))}`
}

export function operationIcon(label: string): LucideIcon {
  const text = label.toLowerCase()
  if (/whats|mensaje|sms|chat/.test(text)) return MessageCircle
  if (/llamad|voz|tel[eé]fono|call/.test(text)) return Phone
  if (/chapa|pint|carrocer|luna|golpe/.test(text)) return Car
  if (/seguro|perit|siniestro/.test(text)) return ShieldCheck
  if (/recambio|pieza|flota|neum/.test(text)) return Package
  if (/venta|vn|vo|ocasi[oó]n|tasac/.test(text)) return ShoppingBag
  if (/mec|diagn|motor|itv|revisi|aver|manten/.test(text)) return Wrench
  return ClipboardList
}

export function buildOperation(id: string, label: string, count: number): BoardOperation {
  const safe = label.trim() || 'Sin tipo'
  return {
    id,
    label: safe,
    description: count === 1 ? '1 consulta de este tipo' : `${count} consultas de este tipo`,
    icon: operationIcon(safe),
  }
}

export function fallbackOperation(): BoardOperation {
  return buildOperation(EMPTY_OPERATION_ID, 'Sin tipo', 0)
}

export function manualOperationOf(entry: {
  operationKey?: string
  operationLabel?: string
  departmentId?: string
}): { id: string; label: string } {
  if (entry.operationKey) {
    return {
      id: entry.operationKey,
      label: String(entry.operationLabel || '').trim() || 'Sin tipo',
    }
  }
  const legacy = LEGACY_BOARDS[String(entry.departmentId || '')]
  if (legacy) return { id: `legacy-${entry.departmentId}`, label: legacy }
  return { id: EMPTY_OPERATION_ID, label: 'Sin tipo' }
}

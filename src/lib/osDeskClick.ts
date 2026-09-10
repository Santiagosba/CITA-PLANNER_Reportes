/**
 * Clics del escritorio: recoger o restaurar ventanas.
 *
 * Recoger (hay ventanas abiertas): casi cualquier clic fuera de las ventanas,
 * la barra y el teléfono — incluidos campos, filtros y tarjetas.
 *
 * Restaurar (todo recogido): solo huecos vacíos del panel. Un campo o una
 * tarjeta no debe volver a sacar las ventanas.
 */

const OS_FURNITURE = [
  '.lead-os-window',
  '.call-agenda-root',
  '.inbound-modal-root',
  '.gestion-capacity-toast',
  '.agenda-peek',
  '.softphone-dock',
  '.softphone-toast',
  '.softphone-chip',
].join(', ')

/** Abre una ficha, navega o cambia de vista: no recoger encima. */
const PRIMARY_WORK = [
  '.ops-feed-row',
  '.ops-kpi',
  '.report-row-clickable',
  '.prow',
  '.prow-toggle',
  '.triage-view-btn',
  '.fc-event',
  '.calendar-event',
  '.calendar-slot',
  '.calendar-chip',
  '.calendar-schedule',
  '.calendar-month-cell',
  '.calendar-year-day',
  '.calendar-year-month',
  '.elevator-slot.is-clickable',
  '.kanban-card',
  '.kanban-card-slot',
  '.dashboard-nav-item',
  '.dashboard-inbound-btn',
].join(', ')

const RESTORE_CONTROLS = [
  'button',
  'a',
  'input',
  'textarea',
  'select',
  'label',
  'summary',
  '[role="button"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="tab"]',
  '[role="option"]',
  '[role="checkbox"]',
  '[role="switch"]',
  '[contenteditable]',
  PRIMARY_WORK,
  '.elevator-filters',
  '.filter-field',
  '.preset-chip',
  '.estado-filter',
  '.owner-scope-filter',
  '.view-page-search',
  '.laura-panel',
  '.dash-today',
  '.dash-kpi-grid',
  '.ops-card-header',
  '.ops-feed-list',
  '.dash-task-list',
  '.dash-task-row',
  '.list-row',
  '.role-check',
  '.role-task-row',
].join(', ')

const RESTORE_ROOTS = [
  '.dashboard-page',
  '.dashboard-main',
  '.app-view-enter',
  '.operational-dashboard',
  '.dash-ops',
  '.view-page-header',
  '.dashboard-sidebar',
].join(', ')

function asElement(target: EventTarget | null): Element | null {
  if (target instanceof Element) return target
  if (target instanceof Text) return target.parentElement
  return null
}

export function isOsFurniture(target: EventTarget | null): boolean {
  return Boolean(asElement(target)?.closest(OS_FURNITURE))
}

export function isPrimaryWorkAction(target: EventTarget | null): boolean {
  return Boolean(asElement(target)?.closest(PRIMARY_WORK))
}

/** Hueco vacío del panel: un segundo clic puede sacar las ventanas. */
export function isEmptyDeskRestore(target: EventTarget | null): boolean {
  const el = asElement(target)
  if (!el) return false
  if (el.closest(RESTORE_CONTROLS)) return false
  return Boolean(el.closest(RESTORE_ROOTS))
}

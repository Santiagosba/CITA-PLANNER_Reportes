/**
 * Clics del escritorio: recoger y restaurar son el mismo gesto.
 *
 * En un hueco o texto que no hace nada: si hay ventanas, se recogen;
 * si están recogidas, vuelven al frente. En un ticket, botón, campo,
 * barra de scroll o la propia ventana no se toca el escritorio.
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
  '.os-zoom-menu',
  '.os-win-switcher',
  '.os-snap-guides',
].join(', ')

/** Abre ficha, navega o cambia de vista. */
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

/** Controles que ya tienen su propia acción (escribir, filtrar, enviar). */
const DESK_ACTIONS = [
  PRIMARY_WORK,
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
  '[role="combobox"]',
  '[role="searchbox"]',
  '[contenteditable]',
  '.preset-chip',
  '.filter-field',
  '.view-page-search',
  '.estado-filter',
  '.owner-scope-filter',
].join(', ')

const DESK_ROOTS = [
  '.dashboard-shell',
  '.dashboard-page',
  '.dashboard-main',
  '.dashboard-sidebar',
  '.dashboard-header',
  '.app-view-enter',
  '.operational-dashboard',
  '.dash-ops',
  '.view-page-header',
  '.role-desk',
].join(', ')

function asElement(target: EventTarget | Event | null): Element | null {
  const node = target instanceof Event ? target.target : target
  if (node instanceof Element) return node
  if (node instanceof Text) return node.parentElement
  return null
}

export function isOsFurniture(target: EventTarget | null): boolean {
  return Boolean(asElement(target)?.closest(OS_FURNITURE))
}

export function isPrimaryWorkAction(target: EventTarget | null): boolean {
  return Boolean(asElement(target)?.closest(PRIMARY_WORK))
}

function overflows(el: HTMLElement, axis: 'x' | 'y'): boolean {
  const style = getComputedStyle(el)
  const overflow = axis === 'y' ? style.overflowY : style.overflowX
  if (overflow !== 'auto' && overflow !== 'scroll' && overflow !== 'overlay') return false
  return axis === 'y' ? el.scrollHeight > el.clientHeight + 1 : el.scrollWidth > el.clientWidth + 1
}

/** Arrastrar o pulsar la barra de scroll es una acción: no recoger ventanas. */
export function isScrollbarClick(event: Event): boolean {
  if (!('clientX' in event) || !('clientY' in event)) return false
  const clientX = (event as PointerEvent).clientX
  const clientY = (event as PointerEvent).clientY
  let node: Element | null = asElement(event.target)
  while (node) {
    if (node instanceof HTMLElement) {
      const rect = node.getBoundingClientRect()
      const vBar = node.offsetWidth - node.clientWidth
      const hBar = node.offsetHeight - node.clientHeight
      if (overflows(node, 'y') && vBar > 0 && clientX >= rect.left + node.clientWidth && clientX <= rect.right) {
        return true
      }
      if (overflows(node, 'x') && hBar > 0 && clientY >= rect.top + node.clientHeight && clientY <= rect.bottom) {
        return true
      }
    }
    node = node.parentElement
  }
  return false
}

/** Clic en fondo o zona muerta: no hay otra acción. */
export function isIdleDeskClick(eventOrTarget: Event | EventTarget | null): boolean {
  const event = eventOrTarget instanceof Event ? eventOrTarget : null
  const el = asElement(eventOrTarget)
  if (!el) return false
  if (el.closest(OS_FURNITURE)) return false
  if (el.closest(DESK_ACTIONS)) return false
  if (event && isScrollbarClick(event)) return false
  return Boolean(el.closest(DESK_ROOTS))
}

/** @deprecated Usar isIdleDeskClick: recoger y restaurar son la misma zona. */
export function isEmptyDeskRestore(eventOrTarget: Event | EventTarget | null): boolean {
  return isIdleDeskClick(eventOrTarget)
}

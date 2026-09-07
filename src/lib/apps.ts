import { useSyncExternalStore } from 'react'
import type { WinRect } from './osWindowDrag'

/**
 * «Apps» del escritorio del CRM (teléfono, notas…): ventanas flotantes que se
 * abren desde el sidebar o la barra de tareas y comparten el orden de apilado
 * con las fichas de gestión. Store externo para poder abrirlas desde cualquier
 * componente sin pasar callbacks.
 */
export type AppId = 'phone' | 'notes' | 'contacts' | 'guide'

/** Evento global para abrir/traer al frente la barra de tareas (botón de la cabecera). */
export const OPEN_TASKBAR_EVENT = 'avi:open-taskbar'

export type AppWindow = {
  id: AppId
  minimized: boolean
  maximized: boolean
  rect: WinRect
  preMaxRect: WinRect | null
  z: number
  enterFrom: 'spawn' | 'restore'
}

export const APP_META: Record<AppId, { label: string; hint: string; minW: number; minH: number; w: number; h: number }> = {
  phone: { label: 'Teléfono', hint: 'Teclado e historial de llamadas', minW: 340, minH: 600, w: 380, h: 700 },
  notes: { label: 'Notas', hint: 'Bloc de apuntes rápidos', minW: 320, minH: 320, w: 440, h: 520 },
  contacts: { label: 'Contactos', hint: 'Admin, soporte IT y soporte de llamadas', minW: 340, minH: 380, w: 420, h: 560 },
  guide: { label: 'Guía', hint: 'Consejos de uso y guion del asesor', minW: 360, minH: 400, w: 520, h: 640 },
}

type State = {
  windows: AppWindow[]
  /** La barra de tareas se muestra aunque no haya tareas (botón de cabecera o app minimizada). */
  taskbarPinned: boolean
  /** Espejo de si la barra está desplegada ahora (lo publica el escritorio) para el botón de cabecera. */
  taskbarVisible: boolean
}

let state: State = { windows: [], taskbarPinned: false, taskbarVisible: false }
const listeners = new Set<() => void>()
let fallbackZ = 200
let zProvider: () => number = () => {
  fallbackZ += 1
  return fallbackZ
}

function emit() {
  for (const fn of listeners) fn()
}

function setWindows(windows: AppWindow[], patch: Partial<Omit<State, 'windows'>> = {}) {
  state = { ...state, ...patch, windows }
  emit()
}

/** El escritorio (DashboardShell) inyecta su contador de z-index para que apps y fichas se apilen juntas. */
export function setAppZProvider(fn: () => number) {
  zProvider = fn
}

function defaultRect(id: AppId, index: number): WinRect {
  const meta = APP_META[id]
  const margin = 16
  const w = Math.min(meta.w, Math.max(meta.minW, window.innerWidth - margin * 2))
  const h = Math.min(meta.h, Math.max(meta.minH, window.innerHeight - margin * 2))
  // El teléfono nace junto al sidebar (de donde se abre); las demás, centradas.
  const x =
    id === 'phone'
      ? Math.max(margin, Math.min(300, window.innerWidth - w - margin))
      : Math.max(margin, Math.round((window.innerWidth - w) / 2) + index * 28)
  const y = Math.max(margin, Math.min(Math.round((window.innerHeight - h) / 2) + index * 24, window.innerHeight - h - margin))
  return { x, y, w, h }
}

export const apps = {
  getState: () => state,
  subscribe(fn: () => void) {
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  },

  isOpen(id: AppId): boolean {
    return state.windows.some((w) => w.id === id)
  },

  /** Abre la app (o la trae al frente / restaura si ya estaba). */
  open(id: AppId) {
    const existing = state.windows.find((w) => w.id === id)
    const z = zProvider()
    if (existing) {
      setWindows(
        state.windows.map((w) =>
          w.id === id ? { ...w, minimized: false, z, enterFrom: w.minimized ? 'restore' : w.enterFrom } : w,
        ),
      )
      return
    }
    setWindows([
      ...state.windows,
      {
        id,
        minimized: false,
        maximized: false,
        rect: defaultRect(id, state.windows.length),
        preMaxRect: null,
        z,
        enterFrom: 'spawn',
      },
    ])
  },

  focus(id: AppId) {
    if (!state.windows.some((w) => w.id === id)) return
    const z = zProvider()
    setWindows(state.windows.map((w) => (w.id === id ? { ...w, z } : w)))
  },

  close(id: AppId) {
    setWindows(state.windows.filter((w) => w.id !== id))
  },

  /** Minimiza a la barra de tareas; la barra se fija para que la app siempre tenga dónde caer. */
  minimize(id: AppId) {
    setWindows(
      state.windows.map((w) => (w.id === id ? { ...w, minimized: true, maximized: false } : w)),
      { taskbarPinned: true },
    )
  },

  pinTaskbar() {
    if (state.taskbarPinned) return
    setWindows(state.windows, { taskbarPinned: true })
  },

  unpinTaskbar() {
    if (!state.taskbarPinned) return
    setWindows(state.windows, { taskbarPinned: false })
  },

  setTaskbarVisible(visible: boolean) {
    if (state.taskbarVisible === visible) return
    setWindows(state.windows, { taskbarVisible: visible })
  },

  /** Al cambiar el tamaño de la ventana del navegador, ninguna app se queda fuera de pantalla. */
  fitToViewport() {
    const margin = 8
    const vw = window.innerWidth
    const vh = window.innerHeight
    let changed = false
    const windows = state.windows.map((w) => {
      if (w.maximized) return w
      const width = Math.min(w.rect.w, vw - margin * 2)
      const height = Math.min(w.rect.h, vh - margin * 2)
      const x = Math.max(margin, Math.min(w.rect.x, vw - width - margin))
      const y = Math.max(margin, Math.min(w.rect.y, vh - height - margin))
      if (x === w.rect.x && y === w.rect.y && width === w.rect.w && height === w.rect.h) return w
      changed = true
      return { ...w, rect: { x, y, w: width, h: height } }
    })
    if (changed) setWindows(windows)
  },

  toggleMaximize(id: AppId) {
    setWindows(
      state.windows.map((w) => {
        if (w.id !== id) return w
        if (w.maximized) return { ...w, maximized: false, rect: w.preMaxRect ?? w.rect, preMaxRect: null }
        return { ...w, maximized: true, preMaxRect: w.rect }
      }),
    )
  },

  setRect(id: AppId, rect: WinRect) {
    setWindows(state.windows.map((w) => (w.id === id ? { ...w, rect, maximized: false, preMaxRect: null } : w)))
  },

  /** Restaura todas las apps minimizadas (clic en el fondo con el escritorio recogido). */
  restoreAll() {
    if (!state.windows.some((w) => w.minimized)) return
    setWindows(
      state.windows.map((w) => (w.minimized ? { ...w, minimized: false, enterFrom: 'restore', z: zProvider() } : w)),
    )
  },
}

export function useApps(): AppWindow[] {
  return useSyncExternalStore(apps.subscribe, () => state.windows, () => state.windows)
}

export function useTaskbarPinned(): boolean {
  return useSyncExternalStore(apps.subscribe, () => state.taskbarPinned, () => state.taskbarPinned)
}

export function useTaskbarVisible(): boolean {
  return useSyncExternalStore(apps.subscribe, () => state.taskbarVisible, () => state.taskbarVisible)
}

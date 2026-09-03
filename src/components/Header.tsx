import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Menu, Search, Bell, Info, Sun, Moon } from 'lucide-react'
import ImportantNoticesStub from './ImportantNoticesStub'
import type { Workshop } from '../types'
import { getAppProductAccentLine, getAppProductName } from '../lib/appIdentity'

type Props = {
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  searchQuery: string
  setSearchQuery: (q: string) => void
  isDarkMode: boolean
  toggleTheme: () => void
  onAboutClick: () => void
  onSearchEnter: () => void
  workshop: Workshop
}

export default function Header({
  sidebarOpen,
  setSidebarOpen,
  searchQuery,
  setSearchQuery,
  isDarkMode,
  toggleTheme,
  onAboutClick,
  onSearchEnter,
  workshop,
}: Props) {
  const [noticesOpen, setNoticesOpen] = useState(false)
  const [panelPos, setPanelPos] = useState<{ top: number; right: number } | null>(null)
  const bellRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const updatePanelPos = useCallback(() => {
    const el = bellRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPanelPos({ top: r.bottom + 8, right: window.innerWidth - r.right })
  }, [])

  useLayoutEffect(() => {
    if (!noticesOpen) {
      setPanelPos(null)
      return
    }
    updatePanelPos()
    const ro = new ResizeObserver(() => updatePanelPos())
    if (bellRef.current) ro.observe(bellRef.current)
    window.addEventListener('scroll', updatePanelPos, true)
    window.addEventListener('resize', updatePanelPos)
    return () => {
      ro.disconnect()
      window.removeEventListener('scroll', updatePanelPos, true)
      window.removeEventListener('resize', updatePanelPos)
    }
  }, [noticesOpen, updatePanelPos])

  useEffect(() => {
    if (!noticesOpen) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (bellRef.current?.contains(t)) return
      if (panelRef.current?.contains(t)) return
      setNoticesOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNoticesOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [noticesOpen])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') onSearchEnter()
  }

  const accent = getAppProductAccentLine()
  const productName = getAppProductName()

  return (
    <header className="relative z-50 flex h-14 w-full shrink-0 items-center justify-between border-b border-slate-200 bg-white px-2 shadow-sm transition-colors duration-300 dark:border-slate-800 dark:bg-slate-900 md:h-16 md:px-4 md:shadow-md">
      <div className="flex min-w-0 items-center gap-1 sm:gap-[5px]">
        <button
          type="button"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="shrink-0 rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-teal-500 focus:outline-none dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white sm:p-2"
          aria-label="Menú"
        >
          <Menu size={22} />
        </button>

        <div className="flex min-w-0 items-center gap-1.5 sm:gap-3">
          <div className="flex min-w-0 select-none items-center gap-1.5 sm:gap-2">
            <h1 className="min-w-0 whitespace-nowrap text-xs font-bold tracking-tight sm:text-sm md:text-lg">
              <span className="text-slate-700 dark:text-slate-100">{productName}</span>
              {accent ? <span className="text-app-accent ml-1 md:ml-1.5">{accent}</span> : null}
            </h1>
          </div>

          <button
            type="button"
            onClick={onAboutClick}
            className="hidden shrink-0 rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300 sm:block"
            title="Acerca de"
          >
            <Info size={18} />
          </button>
        </div>
      </div>

      <div className="flex min-w-0 items-center gap-2 sm:gap-4">
        <div className="relative hidden md:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Buscar..."
            className="w-48 rounded-full border-none bg-slate-100 py-2 pl-10 pr-4 text-sm text-slate-800 outline-none transition-all placeholder:text-slate-400 focus:ring-2 focus:ring-teal-500 dark:bg-slate-800 dark:text-slate-200 lg:w-80"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        <div className="flex items-center space-x-1 border-l border-slate-200 pl-2 dark:border-slate-800 sm:space-x-2 sm:pl-4">
          <button
            type="button"
            onClick={toggleTheme}
            className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-yellow-400"
            title={isDarkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          >
            {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>

          <div className="relative">
            <button
              ref={bellRef}
              type="button"
              onClick={() => setNoticesOpen((o) => !o)}
              className={`relative rounded-full p-2 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 ${
                noticesOpen
                  ? 'text-teal-600 dark:text-teal-400'
                  : 'text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Notificaciones (maqueta)"
              aria-expanded={noticesOpen}
              aria-haspopup="dialog"
            >
              <Bell size={20} />
              <span
                className="pointer-events-none absolute right-1.5 top-1.5 h-2 w-2 rounded-full border-2 border-white bg-teal-500 dark:border-slate-900"
                aria-hidden
              />
            </button>
            {noticesOpen &&
              panelPos &&
              typeof document !== 'undefined' &&
              createPortal(
                <div
                  ref={panelRef}
                  className="pointer-events-auto"
                  style={{
                    position: 'fixed',
                    top: panelPos.top,
                    right: panelPos.right,
                    zIndex: 100000,
                  }}
                >
                  <ImportantNoticesStub
                    workshop={workshop}
                    isDarkMode={isDarkMode}
                    onClose={() => setNoticesOpen(false)}
                  />
                </div>,
                document.body,
              )}
          </div>
        </div>
      </div>
    </header>
  )
}

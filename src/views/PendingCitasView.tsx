import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, Columns3, Loader2, Search, Table2 } from 'lucide-react'
import ApiStatusBanner from '../components/ApiStatusBanner'
import PendingCitasToolbar from '../components/PendingCitasToolbar'
import PeticionRow from '../components/PeticionRow'
import type { ActionStatus } from '../components/ui/ActionButton'
import Card from '../components/ui/Card'
import { TodoSkeleton } from '../components/ui/Skeleton'
import VehiclePlate from '../components/ui/VehiclePlate'
import CalendarTallerView from './CalendarTallerView'
import type { Workshop } from '../types'
import { groupPeticionesByAgendaDay } from '../lib/agendaGrouping'
import {
  resolveDateRange,
  toDateInputValue,
  type DateRangePreset,
} from '../lib/dateRangePresets'
import {
  buildPeticionesCsv,
  computePeticionesStats,
  downloadCsv,
  fetchPendingPeticiones,
  fetchTiposPeticion,
  formatFecha,
  getPeticionesSourceNotice,
  isPeticionPendiente,
  resolveAvioldTallerIdsDetailed,
  updatePeticionGestion,
  type PeticionPendiente,
  type ResolvedTallerIds,
  type TipoPeticionRow,
} from '../lib/peticionesPendientes'

type Props = {
  workshop: Workshop
  isDarkMode?: boolean
  initialTab?: TabId
}

type TabId = 'kanban' | 'tabla' | 'calendario'

export default function PendingCitasView({ workshop, initialTab = 'kanban' }: Props) {
  const [tab, setTab] = useState<TabId>(initialTab)
  const [items, setItems] = useState<PeticionPendiente[]>([])
  const [tipos, setTipos] = useState<TipoPeticionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState<ActionStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [callerFilter, setCallerFilter] = useState('')
  const [tipoFilter, setTipoFilter] = useState<number | ''>('')
  const [reportSoloPendientes, setReportSoloPendientes] = useState(false)
  const [gestionObs, setGestionObs] = useState('')
  const [gestionEmail, setGestionEmail] = useState('')
  const [sourceNotice, setSourceNotice] = useState<string | null>(null)
  const [datePreset, setDatePreset] = useState<DateRangePreset>('mes')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [debouncedCaller, setDebouncedCaller] = useState('')

  useEffect(() => {
    setTab(initialTab)
  }, [initialTab])

  // Buscador de teléfono: espera a que el asesor deje de teclear (evita 1 petición por tecla)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedCaller(callerFilter.trim()), 350)
    return () => clearTimeout(t)
  }, [callerFilter])

  const effectiveCaller = debouncedCaller || undefined
  const dateRange = useMemo(
    () => resolveDateRange(datePreset, customFrom, customTo),
    [datePreset, customFrom, customTo],
  )

  // Cache de resolución de taller: se resuelve UNA vez por taller, no en cada filtro/carga
  const workshopKey = `${String(workshop.originalId || '')}|${String(workshop.containerIdTaller || '')}`
  const resolvedCacheRef = useRef<{ key: string; value: ResolvedTallerIds } | null>(null)

  const getResolvedTallerIds = useCallback(async (): Promise<ResolvedTallerIds> => {
    if (resolvedCacheRef.current?.key === workshopKey) {
      return resolvedCacheRef.current.value
    }
    const value = await resolveAvioldTallerIdsDetailed(workshop)
    resolvedCacheRef.current = { key: workshopKey, value }
    return value
  }, [workshop, workshopKey])

  // Tipos de petición: se cargan una sola vez por taller y en paralelo (no bloquean la lista)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const rows = await fetchTiposPeticion()
        if (!cancelled) setTipos(rows)
      } catch {
        /* el filtro de tipo queda vacío; no bloquea la carga de citas */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [workshopKey])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    setSourceNotice(null)
    try {
      const resolved = await getResolvedTallerIds()
      if (!resolved.ids.length) {
        setError('No encontramos este taller en el sistema. Prueba a elegir otro.')
        setItems([])
        return
      }
      const rows = await fetchPendingPeticiones(resolved.ids, {
        caller: effectiveCaller,
        tipoPeticionId: tipoFilter === '' ? null : tipoFilter,
        from: dateRange.from,
        to: dateRange.to,
      })
      setItems(rows)
      setSourceNotice(getPeticionesSourceNotice())
      setSelectedId((prev) => {
        const pendientes = rows.filter(isPeticionPendiente)
        if (prev && pendientes.some((r) => r.idpeticion === prev)) return prev
        return pendientes[0]?.idpeticion ?? null
      })
    } catch (e) {
      setItems([])
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las citas')
    } finally {
      setLoading(false)
    }
  }, [getResolvedTallerIds, effectiveCaller, tipoFilter, dateRange.from, dateRange.to])

  useEffect(() => {
    void load()
  }, [load])

  const stats = useMemo(() => computePeticionesStats(items), [items])
  const bandejaItems = useMemo(() => items.filter(isPeticionPendiente), [items])
  const agendaGroups = useMemo(() => groupPeticionesByAgendaDay(bandejaItems), [bandejaItems])
  const reportItems = useMemo(() => {
    if (reportSoloPendientes) return bandejaItems
    return items
  }, [items, bandejaItems, reportSoloPendientes])
  const selected = useMemo(
    () => bandejaItems.find((p) => p.idpeticion === selectedId) ?? null,
    [bandejaItems, selectedId],
  )

  useEffect(() => {
    if (selected) {
      setGestionObs(selected.gestionobservaciones ?? '')
      setGestionEmail(selected.gestionemail ?? '')
      setSaveStatus('idle')
    }
  }, [selected?.idpeticion])

  const handlePresetChange = (p: DateRangePreset) => {
    setDatePreset(p)
    if (p === 'personalizada' && !customFrom && !customTo) {
      const now = new Date()
      setCustomFrom(toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1)))
      setCustomTo(toDateInputValue(now))
    }
  }

  const advanceToNextPending = useCallback(
    (currentId: string) => {
      const idx = bandejaItems.findIndex((p) => p.idpeticion === currentId)
      const next = bandejaItems[idx + 1] ?? bandejaItems[idx - 1] ?? null
      setSelectedId(next?.idpeticion ?? null)
    },
    [bandejaItems],
  )

  const handleMarkGestionado = async (gestionado: boolean) => {
    if (!selected) return
    const currentId = selected.idpeticion
    setSaveStatus('loading')
    setError(null)
    try {
      await updatePeticionGestion(currentId, {
        gestionado,
        gestionobservaciones: gestionObs,
        gestionemail: gestionEmail,
      })
      setSaveStatus('success')
      await new Promise((r) => setTimeout(r, 650))
      if (gestionado) {
        setItems((prev) => prev.filter((p) => p.idpeticion !== currentId))
        advanceToNextPending(currentId)
      } else {
        setItems((prev) =>
          prev.map((p) =>
            p.idpeticion === currentId
              ? { ...p, gestionado, gestionobservaciones: gestionObs, gestionemail: gestionEmail }
              : p,
          ),
        )
      }
      setSaveStatus('idle')
    } catch (e) {
      setSaveStatus('error')
      setError(e instanceof Error ? e.message : 'No se pudo guardar')
      setTimeout(() => setSaveStatus('idle'), 1800)
    }
  }

  const handleExport = () => {
    const csv = buildPeticionesCsv(reportItems, workshop.name)
    const stamp = new Date().toISOString().slice(0, 10)
    downloadCsv(csv, `citas-${workshop.name.replace(/\s+/g, '-').toLowerCase()}-${stamp}.csv`)
  }

  const isApiError = Boolean(error && /api sql|mssql_password|no está en marcha/i.test(error))

  return (
    <div className="dashboard-page">
      <PendingCitasToolbar
        view={tab}
        preset={datePreset}
        customFrom={customFrom}
        customTo={customTo}
        dateRange={dateRange}
        stats={stats}
        loading={loading}
        canExport={reportItems.length > 0}
        onPresetChange={handlePresetChange}
        onCustomFromChange={setCustomFrom}
        onCustomToChange={setCustomTo}
        onRefresh={() => void load()}
        onExport={handleExport}
      />

      <div className="triage-view-switch" role="tablist" aria-label="Vista de triage">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'kanban'}
          className={`triage-view-btn ${tab === 'kanban' ? 'is-active' : ''}`}
          onClick={() => setTab('kanban')}
        >
          <Columns3 size={16} />
          Vista Kanban
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'tabla'}
          className={`triage-view-btn ${tab === 'tabla' ? 'is-active' : ''}`}
          onClick={() => setTab('tabla')}
        >
          <Table2 size={16} />
          Vista Tabla
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'calendario'}
          className={`triage-view-btn ${tab === 'calendario' ? 'is-active' : ''}`}
          onClick={() => setTab('calendario')}
        >
          <CalendarDays size={16} />
          Calendario Taller
        </button>
      </div>

      {error && tab !== 'calendario' ? (
        <ApiStatusBanner message={error} variant={isApiError ? 'error' : 'warning'} />
      ) : null}
      {sourceNotice && !error && tab !== 'calendario' ? (
        <ApiStatusBanner message={sourceNotice} variant="warning" />
      ) : null}

      {tab === 'calendario' ? (
        <CalendarTallerView workshop={workshop} embedded />
      ) : tab === 'kanban' ? (
        <div className="queue-full">
          <div className="queue-filterbar glass card-pad-sm">
            <label className="queue-filter-search">
              <span className="field-label">Buscar teléfono</span>
              <div className="relative">
                <Search
                  size={18}
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)]"
                />
                <input
                  type="text"
                  placeholder="612 345 678"
                  value={callerFilter}
                  onChange={(e) => setCallerFilter(e.target.value)}
                  className="field-input pl-11"
                />
              </div>
            </label>
            <label className="queue-filter-tipo">
              <span className="field-label">Tipo</span>
              <select
                value={tipoFilter}
                onChange={(e) => setTipoFilter(e.target.value === '' ? '' : Number(e.target.value))}
                className="field-select"
              >
                <option value="">Todas</option>
                {tipos.map((t) => (
                  <option key={t.idtipopeticion} value={t.idtipopeticion}>
                    {t.tipopeticion}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {loading ? (
            <ul className="prow-list" aria-busy="true">
              <li>
                <TodoSkeleton />
              </li>
              <li>
                <TodoSkeleton />
              </li>
              <li>
                <TodoSkeleton />
              </li>
            </ul>
          ) : bandejaItems.length === 0 ? (
            <Card className="glass agenda-empty">
              <p className="section-title" style={{ fontSize: 'var(--font-lg)' }}>
                {items.length > 0 ? 'Nada pendiente' : 'Sin consultas en este periodo'}
              </p>
              <p className="section-subtitle mt-2">
                {items.length > 0
                  ? `Las ${stats.conCita} consultas del periodo ya tienen cita en calendario.`
                  : 'Prueba «Ver todo» o amplía el rango de fechas.'}
              </p>
            </Card>
          ) : (
            <div className="panel-stack">
              {agendaGroups.map((group) => (
                <section key={group.label} className="agenda-day-group">
                  <h2 className="agenda-day-label">
                    {group.label}
                    <span>· {group.items.length}</span>
                  </h2>
                  <ul className="prow-list">
                    {group.items.map((p) => (
                      <PeticionRow
                        key={p.idpeticion}
                        peticion={p}
                        expanded={p.idpeticion === selectedId}
                        saveStatus={p.idpeticion === selectedId ? saveStatus : 'idle'}
                        gestionObs={p.idpeticion === selectedId ? gestionObs : (p.gestionobservaciones ?? '')}
                        gestionEmail={p.idpeticion === selectedId ? gestionEmail : (p.gestionemail ?? '')}
                        onToggle={() => setSelectedId((prev) => (prev === p.idpeticion ? null : p.idpeticion))}
                        onGestionObsChange={setGestionObs}
                        onGestionEmailChange={setGestionEmail}
                        onMarkGestionado={(g) => void handleMarkGestionado(g)}
                      />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="dashboard-report panel-stack">
          <Card padding="sm" className="glass flex flex-wrap items-center justify-between gap-3">
            <p className="field-label mb-0">{reportItems.length} registros</p>
            <label className="flex min-h-[var(--tap-target)] cursor-pointer items-center gap-3 text-[var(--font-sm)]">
              <input
                type="checkbox"
                checked={reportSoloPendientes}
                onChange={(e) => setReportSoloPendientes(e.target.checked)}
                className="h-5 w-5"
              />
              Solo sin cita
            </label>
          </Card>

          {loading ? (
            <Card className="glass flex justify-center py-20">
              <Loader2 size={28} className="animate-spin" style={{ color: 'var(--color-brand)' }} />
            </Card>
          ) : reportItems.length === 0 ? (
            <Card className="glass py-16 text-center">
              <p className="section-subtitle">No hay datos para mostrar.</p>
            </Card>
          ) : (
            <Card padding="sm" className="glass report-table-wrap custom-scrollbar-light">
              <table className="report-table">
                <thead>
                  <tr>
                    <th>Cliente / Teléfono</th>
                    <th>Matrícula</th>
                    <th>Tipo</th>
                    <th>Consulta</th>
                    <th>Estado</th>
                    <th>Cita</th>
                  </tr>
                </thead>
                <tbody>
                  {reportItems.map((p) => {
                    const c = p.cita
                    const cliente = c ? [c.nombre, c.apellidos].filter(Boolean).join(' ') : null
                    const pendiente = isPeticionPendiente(p)
                    return (
                      <tr key={p.idpeticion}>
                        <td>
                          <strong>{cliente || p.caller || '—'}</strong>
                          {p.caller && cliente ? <div className="text-[var(--muted)]">{p.caller}</div> : null}
                        </td>
                        <td>{c?.matricula ? <VehiclePlate value={c.matricula} compact /> : '—'}</td>
                        <td>{p.tipopeticion ?? '—'}</td>
                        <td>{formatFecha(p.fechainicio)}</td>
                        <td>
                          <span className={`badge ${pendiente ? 'tone-warning' : 'tone-positive'}`}>
                            {pendiente ? 'Sin cita' : 'Con cita'}
                          </span>
                        </td>
                        <td>{formatFecha(p.cita?.fecha) || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}

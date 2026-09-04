import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, Columns3, Search, Table2 } from 'lucide-react'
import ApiStatusBanner from '../components/ApiStatusBanner'
import PendingCitasToolbar, { type EstadoFilter } from '../components/PendingCitasToolbar'
import PeticionRow from '../components/PeticionRow'
import type { ActionStatus } from '../components/ui/ActionButton'
import Card from '../components/ui/Card'
import { HexLoaderScreen } from '../components/ui/HexLoader'
import VehiclePlate from '../components/ui/VehiclePlate'
import CalendarTallerView from './CalendarTallerView'
import type { CalendarScale } from '../lib/calendarScale'
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
import { isSlaCritico, matchesChannelText } from '../lib/tallerStations'
import {
  COPY_FALLBACK_NOTICE,
  loadPeticionesCopy,
  patchPeticionInCopy,
  savePeticionesCopy,
  workshopCopyId,
} from '../lib/workingCopy'
import { invalidateOperationalData } from '../hooks/useOperationalData'

type Props = {
  workshop: Workshop
  isDarkMode?: boolean
  initialTab?: TabId
  onOpenLead?: (peticion: PeticionPendiente) => void
  refreshToken?: number
}

type TabId = 'kanban' | 'tabla' | 'calendario'

export default function PendingCitasView({
  workshop,
  initialTab = 'kanban',
  onOpenLead,
  refreshToken = 0,
}: Props) {
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
  const [channel, setChannel] = useState('voz-wa')
  const [slaOnly, setSlaOnly] = useState(false)
  const [estado, setEstado] = useState<EstadoFilter>('faltan')
  const [agendaDay, setAgendaDay] = useState(() => {
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    return now
  })
  const [calendarScale, setCalendarScale] = useState<CalendarScale>('dia')

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

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
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
      savePeticionesCopy(workshopCopyId(workshop), rows)
      setSourceNotice(getPeticionesSourceNotice())
      setSelectedId((prev) => {
        if (prev && rows.some((r) => r.idpeticion === prev)) return prev
        const faltan = rows.filter((r) => !r.gestionado)
        return faltan[0]?.idpeticion ?? rows[0]?.idpeticion ?? null
      })
    } catch (e) {
      const copy = loadPeticionesCopy(workshopCopyId(workshop))
      if (copy?.length) {
        setItems(copy)
        setError(null)
        setSourceNotice(COPY_FALLBACK_NOTICE)
        setSelectedId((prev) => {
          if (prev && copy.some((r) => r.idpeticion === prev)) return prev
          return copy.find((r) => !r.gestionado)?.idpeticion ?? copy[0]?.idpeticion ?? null
        })
      } else {
        setItems([])
        setError(e instanceof Error ? e.message : 'No se pudieron cargar las citas')
      }
    } finally {
      setLoading(false)
    }
  }, [getResolvedTallerIds, effectiveCaller, tipoFilter, dateRange.from, dateRange.to, workshop])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (refreshToken > 0) void load(true)
  }, [refreshToken, load])

  const matchesScopeFilters = useCallback(
    (p: PeticionPendiente) => {
      const text = `${p.tipopeticion || ''} ${p.descripcion || ''} ${p.cita?.marca || ''} ${p.cita?.modelo || ''} ${p.cita?.asunto || ''}`
      if (!matchesChannelText(text, channel)) return false
      if (slaOnly && !isSlaCritico(p.fechainicio) && !isSlaCritico(p.cita?.fecha)) return false
      return true
    },
    [channel, slaOnly],
  )

  const scopedItems = useMemo(() => items.filter(matchesScopeFilters), [items, matchesScopeFilters])
  const stats = useMemo(() => computePeticionesStats(scopedItems), [scopedItems])

  const filteredItems = useMemo(() => {
    return scopedItems.filter((p) => {
      if (estado === 'hechas' && !p.gestionado) return false
      if (estado === 'faltan' && p.gestionado) return false
      return true
    })
  }, [scopedItems, estado])
  const faltanItems = useMemo(() => filteredItems.filter((p) => !p.gestionado), [filteredItems])
  const agendaGroups = useMemo(() => groupPeticionesByAgendaDay(filteredItems), [filteredItems])
  const reportItems = useMemo(() => {
    if (reportSoloPendientes) return filteredItems.filter(isPeticionPendiente)
    return filteredItems
  }, [filteredItems, reportSoloPendientes])
  const selected = useMemo(
    () => filteredItems.find((p) => p.idpeticion === selectedId) ?? null,
    [filteredItems, selectedId],
  )

  const handleGoToday = () => {
    const today = toDateInputValue(new Date())
    setDatePreset('personalizada')
    setCustomFrom(today)
    setCustomTo(today)
    const day = new Date()
    day.setHours(0, 0, 0, 0)
    setAgendaDay(day)
  }

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
      const idx = faltanItems.findIndex((p) => p.idpeticion === currentId)
      const next = faltanItems[idx + 1] ?? faltanItems[idx - 1] ?? null
      setSelectedId(next?.idpeticion ?? null)
    },
    [faltanItems],
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
      const nextPatch = {
        gestionado,
        gestionobservaciones: gestionObs,
        gestionemail: gestionEmail,
      }
      setItems((prev) =>
        prev.map((p) => (p.idpeticion === currentId ? { ...p, ...nextPatch } : p)),
      )
      patchPeticionInCopy(workshopCopyId(workshop), currentId, nextPatch)
      invalidateOperationalData(workshop)
      if (gestionado && estado === 'faltan') {
        advanceToNextPending(currentId)
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
        channel={channel}
        slaOnly={slaOnly}
        estado={estado}
        onPresetChange={handlePresetChange}
        onCustomFromChange={setCustomFrom}
        onCustomToChange={setCustomTo}
        onChannelChange={setChannel}
        onSlaOnlyChange={setSlaOnly}
        onEstadoChange={setEstado}
        calendarScale={calendarScale}
        onCalendarScaleChange={setCalendarScale}
        onGoToday={handleGoToday}
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

      {error ? <ApiStatusBanner message={error} variant={isApiError ? 'error' : 'warning'} /> : null}
      {sourceNotice && !error ? <ApiStatusBanner message={sourceNotice} variant="warning" /> : null}

      {tab === 'calendario' ? (
        <CalendarTallerView
          workshop={workshop}
          embedded
          channel={channel}
          slaOnly={slaOnly}
          day={agendaDay}
          onDayChange={setAgendaDay}
          scale={calendarScale}
          onScaleChange={setCalendarScale}
          onOpenCita={
            onOpenLead
              ? (cita) => {
                  onOpenLead({
                    idpeticion: `cita-${cita.idcita}`,
                    idtaller: cita.idtaller,
                    descripcion: cita.asunto || cita.observaciones,
                    idtipopeticion: null,
                    tipopeticion: 'Cita taller',
                    fechainicio: cita.fecha,
                    fechafin: null,
                    fechacreacion: cita.fecha,
                    caller: cita.movil || cita.telefono,
                    gestionado: true,
                    gestionemail: cita.email,
                    gestionfecha: null,
                    gestionobservaciones: cita.observaciones,
                    idcita: cita.idcita,
                    cita: {
                      idcita: cita.idcita,
                      fecha: cita.fecha,
                      nombre: cita.nombre,
                      apellidos: cita.apellidos,
                      matricula: cita.matricula,
                      marca: cita.marca,
                      modelo: cita.modelo,
                      email: cita.email,
                      telefono: cita.telefono,
                      movil: cita.movil,
                      asunto: cita.asunto,
                    },
                  })
                }
              : undefined
          }
        />
      ) : tab === 'kanban' ? (
        <div className="queue-full">
          <div className="queue-filterbar glass glass-lite card-pad-sm">
            <label className="queue-filter-search">
              <span className="field-label">Buscar teléfono</span>
              <div className="relative">
                <Search size={18} className="field-input-icon" aria-hidden />
                <input
                  type="text"
                  placeholder="612 345 678"
                  value={callerFilter}
                  onChange={(e) => setCallerFilter(e.target.value)}
                  className="field-input"
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
            <HexLoaderScreen label="Cargando consultas…" />
          ) : filteredItems.length === 0 ? (
            <Card className="glass glass-lite agenda-empty">
              <p className="section-title" style={{ fontSize: 'var(--font-lg)' }}>
                {items.length > 0
                  ? estado === 'hechas'
                    ? 'Aún no hay consultas hechas'
                    : 'Nada pendiente'
                  : 'Sin consultas en este periodo'}
              </p>
              <p className="section-subtitle mt-2">
                {items.length > 0
                  ? estado === 'hechas'
                    ? `Faltan ${stats.porHacer} por terminar.`
                    : `Hay ${stats.hechas} hechas. Cambia el filtro a «Hechas» o «Todas» para verlas.`
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
                        onOpenLead={onOpenLead ? () => onOpenLead(p) : undefined}
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
          <Card padding="sm" className="glass glass-lite flex flex-wrap items-center justify-between gap-3">
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
            <Card className="glass glass-lite">
              <HexLoaderScreen size="md" label="Cargando listado…" />
            </Card>
          ) : reportItems.length === 0 ? (
            <Card className="glass glass-lite py-16 text-center">
              <p className="section-subtitle">No hay datos para mostrar.</p>
            </Card>
          ) : (
            <Card padding="sm" className="glass glass-lite report-table-wrap custom-scrollbar-light">
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
                    const hecha = Boolean(p.gestionado)
                    return (
                      <tr
                        key={p.idpeticion}
                        className={onOpenLead ? 'report-row-clickable' : undefined}
                        role={onOpenLead ? 'button' : undefined}
                        tabIndex={onOpenLead ? 0 : undefined}
                        onClick={() => onOpenLead?.(p)}
                        onKeyDown={(e) => {
                          if (!onOpenLead) return
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            onOpenLead(p)
                          }
                        }}
                      >
                        <td>
                          <strong>{cliente || p.caller || '—'}</strong>
                          {p.caller && cliente ? <div className="text-[var(--muted)]">{p.caller}</div> : null}
                        </td>
                        <td>{c?.matricula ? <VehiclePlate value={c.matricula} compact /> : '—'}</td>
                        <td>{p.tipopeticion ?? '—'}</td>
                        <td>{formatFecha(p.fechainicio)}</td>
                        <td>
                          <span className={`badge ${hecha ? 'tone-positive' : 'tone-warning'}`}>
                            {hecha ? 'Hecha' : 'Falta'}
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

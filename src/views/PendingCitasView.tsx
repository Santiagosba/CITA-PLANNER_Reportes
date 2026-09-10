import PaginatedItems from '../components/PaginatedItems'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, Columns3, Search, Table2 } from 'lucide-react'
import ApiStatusBanner from '../components/ApiStatusBanner'
import { withLoadDeadline } from '../lib/loadDeadline'
import PendingCitasToolbar, { type EstadoFilter } from '../components/PendingCitasToolbar'
import PeticionRow from '../components/PeticionRow'
import type { ActionStatus } from '../components/ui/ActionButton'
import Card from '../components/ui/Card'
import { HexLoaderScreen } from '../components/ui/HexLoader'
import VehiclePlate from '../components/ui/VehiclePlate'
import CalendarTallerView from './CalendarTallerView'
import type { CalendarScale } from '../lib/calendarScale'
import type { CitaTaller } from '../lib/citasTaller'
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
  enrichPeticionClientNames,
  mergePeticionClientNames,
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
import { matchesTicketSearch } from '../lib/aiHeaderSearch'
import TicketClientBlock from '../components/TicketClientBlock'
import { useAdvisorWorkspace } from '../hooks/useAdvisorWorkspace'
import { buildOwnerScopeContext, matchesOwnerScope, ownerScopeEmptyCopy, type OwnerScope } from '../lib/ownerScope'
import {
  COPY_FALLBACK_NOTICE,
  loadPeticionesCopy,
  patchPeticionInCopy,
  savePeticionesCopy,
  workshopCopyId,
} from '../lib/workingCopy'
import { invalidateOperationalData } from '../hooks/useOperationalData'
import { DEMO_TICKETS_NOTICE, isDemoTicketId, mergeLiveAndDemoTickets } from '../lib/demoTickets'
import { compareTicketsByOpenFirst } from '../lib/doneFilter'
import { applyPeticionPatch, PETICIONES_PATCHED_EVENT } from '../lib/ticketOps'
import TicketOwnerPicker from '../components/TicketOwnerPicker'
import type { CrmAppRole } from '../lib/crmRoles'

type Props = {
  workshop: Workshop
  currentUser: { name: string; email: string }
  isDarkMode?: boolean
  initialTab?: TabId
  initialSlaOnly?: boolean
  onOpenLead?: (peticion: PeticionPendiente) => void
  refreshToken?: number
  appRole?: CrmAppRole
}

type TabId = 'kanban' | 'tabla' | 'calendario'

export default function PendingCitasView({
  workshop,
  currentUser,
  initialTab = 'kanban',
  initialSlaOnly = false,
  onOpenLead,
  refreshToken = 0,
  appRole = 'asesor',
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
  const [channel, setChannel] = useState('voz-wa')
  const [slaOnly, setSlaOnly] = useState(initialSlaOnly)
  const [estado, setEstado] = useState<EstadoFilter>('faltan')
  const [ownerScope, setOwnerScope] = useState<OwnerScope>(appRole === 'asesor' ? 'grupo' : 'todas')
  const workshopId = workshop.containerIdTaller || workshop.id
  const { workspace } = useAdvisorWorkspace(workshopId, currentUser, true)
  const ownerCtx = useMemo(
    () => buildOwnerScopeContext(workspace, currentUser.email),
    [workspace, currentUser.email],
  )
  const [agendaDay, setAgendaDay] = useState(() => {
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    return now
  })
  const [calendarScale, setCalendarScale] = useState<CalendarScale>('dia')

  useEffect(() => {
    setTab(initialTab)
  }, [initialTab])

  useEffect(() => {
    setOwnerScope(appRole === 'asesor' ? 'grupo' : 'todas')
  }, [appRole])

  useEffect(() => {
    setSlaOnly(initialSlaOnly)
  }, [initialSlaOnly])

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

  const loadVersion = useRef(0)
  const load = useCallback(async (silent = false) => {
    const version = ++loadVersion.current
    if (!silent) setLoading(true)
    setError(null)
    setSourceNotice(null)
    try {
      const resolved = await withLoadDeadline(getResolvedTallerIds())
      if (version !== loadVersion.current) return
      if (!resolved.ids.length) {
        const demo = mergeLiveAndDemoTickets([], workshop, dateRange)
        if (demo.length) {
          setItems(demo)
          setSourceNotice(DEMO_TICKETS_NOTICE)
          setSelectedId((prev) => {
            if (prev && demo.some((r) => r.idpeticion === prev)) return prev
            return demo.find((r) => !r.gestionado)?.idpeticion ?? demo[0]?.idpeticion ?? null
          })
          return
        }
        setError('No encontramos este taller en el sistema. Prueba a elegir otro.')
        setItems([])
        return
      }
      const live = await withLoadDeadline(fetchPendingPeticiones(resolved.ids, {
        tipoPeticionId: tipoFilter === '' ? null : tipoFilter,
        from: dateRange.from,
        to: dateRange.to,
      }, { includeClientNames: false }))
      if (version !== loadVersion.current) return
      void withLoadDeadline(enrichPeticionClientNames(live, resolved.ids, dateRange)).then((enriched) => {
        if (version !== loadVersion.current) return
        setItems((current) => mergePeticionClientNames(current, enriched))
      }).catch(() => { /* Optional names must not discard successfully loaded tickets. */ })
      const rows = mergeLiveAndDemoTickets(live, workshop, dateRange)
      setItems(rows)
      savePeticionesCopy(workshopCopyId(workshop), live)
      setSourceNotice(getPeticionesSourceNotice() || (rows.length > live.length ? DEMO_TICKETS_NOTICE : null))
      setSelectedId((prev) => {
        if (prev && rows.some((r) => r.idpeticion === prev)) return prev
        const faltan = rows.filter((r) => !r.gestionado)
        return faltan[0]?.idpeticion ?? rows[0]?.idpeticion ?? null
      })
    } catch (e) {
      if (version !== loadVersion.current) return
      const copy = loadPeticionesCopy(workshopCopyId(workshop)) ?? []
      const rows = mergeLiveAndDemoTickets(copy, workshop, dateRange)
      if (rows.length) {
        setItems(rows)
        setError(null)
        setSourceNotice(`${copy.length ? COPY_FALLBACK_NOTICE : DEMO_TICKETS_NOTICE} Motivo: ${e instanceof Error ? e.message : 'No se pudieron actualizar los datos.'}`)
        setSelectedId((prev) => {
          if (prev && rows.some((r) => r.idpeticion === prev)) return prev
          return rows.find((r) => !r.gestionado)?.idpeticion ?? rows[0]?.idpeticion ?? null
        })
      } else {
        setItems([])
        setError(e instanceof Error ? e.message : 'No se pudieron cargar las citas')
      }
    } finally {
      if (version === loadVersion.current) setLoading(false)
    }
  }, [getResolvedTallerIds, tipoFilter, dateRange.from, dateRange.to, workshop])

  useEffect(() => {
    void load()
    return () => { loadVersion.current++ }
  }, [load])

  useEffect(() => {
    if (refreshToken > 0) void load(true)
  }, [refreshToken, load])

  useEffect(() => {
    const onPatch = (event: Event) => {
      const detail = (event as CustomEvent<{ idpeticion?: string; patch?: Partial<PeticionPendiente> }>).detail
      if (!detail?.idpeticion || !detail.patch) return
      setItems((prev) =>
        prev.map((row) => (row.idpeticion === detail.idpeticion ? { ...row, ...detail.patch } : row)),
      )
    }
    window.addEventListener(PETICIONES_PATCHED_EVENT, onPatch)
    return () => window.removeEventListener(PETICIONES_PATCHED_EVENT, onPatch)
  }, [])

  const matchesScopeFilters = useCallback(
    (p: PeticionPendiente) => {
      const text = `${p.tipopeticion || ''} ${p.descripcion || ''} ${p.cita?.marca || ''} ${p.cita?.modelo || ''} ${p.cita?.asunto || ''}`
      if (!matchesChannelText(text, channel)) return false
      if (slaOnly && !isSlaCritico(p.fechainicio) && !isSlaCritico(p.cita?.fecha)) return false
      if (!matchesOwnerScope(p.gestionemail, ownerScope, ownerCtx)) return false
      if (!matchesTicketSearch(p, callerFilter)) return false
      return true
    },
    [channel, slaOnly, ownerScope, ownerCtx, callerFilter],
  )

  const scopedItems = useMemo(() => items.filter(matchesScopeFilters), [items, matchesScopeFilters])
  const stats = useMemo(() => computePeticionesStats(scopedItems), [scopedItems])

  const filteredItems = useMemo(() => {
    return scopedItems
      .filter((p) => {
        if (estado === 'hechas' && !p.gestionado) return false
        if (estado === 'faltan' && p.gestionado) return false
        return true
      })
      .sort(compareTicketsByOpenFirst)
  }, [scopedItems, estado])
  const faltanItems = useMemo(() => filteredItems.filter((p) => !p.gestionado), [filteredItems])
  const agendaGroups = useMemo(() => groupPeticionesByAgendaDay(filteredItems), [filteredItems])
  const agendaItems = useMemo(() => agendaGroups.flatMap((group) => group.items), [agendaGroups])
  const pageFilterKey = JSON.stringify([workshopKey, estado, ownerScope, callerFilter, tipoFilter, dateRange.from, dateRange.to, channel, slaOnly, reportSoloPendientes])
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

  const handleToggleRow = useCallback((id: string) => {
    setSelectedId((prev) => (prev === id ? null : id))
  }, [])

  const handleOpenCita = useCallback(
    (cita: CitaTaller) => {
      if (!onOpenLead) return
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
          razonSocial: cita.razonSocial,
          contacto: cita.contacto,
          matricula: cita.matricula,
          marca: cita.marca,
          modelo: cita.modelo,
          email: cita.email,
          telefono: cita.telefono,
          movil: cita.movil,
          asunto: cita.asunto,
        },
      })
    },
    [onOpenLead],
  )

  const selectedRef = useRef(selected)
  selectedRef.current = selected
  const draftRef = useRef({ gestionObs, gestionEmail })
  draftRef.current = { gestionObs, gestionEmail }

  const handleMarkGestionado = useCallback(async (gestionado: boolean) => {
    const current = selectedRef.current
    if (!current) return
    const currentId = current.idpeticion
    const { gestionObs: obs, gestionEmail: email } = draftRef.current
    setSaveStatus('loading')
    setError(null)
    try {
      if (isDemoTicketId(currentId)) {
        await applyPeticionPatch(workshop, current, {
          gestionado,
          gestionobservaciones: obs,
          gestionemail: email,
        })
      } else {
        await updatePeticionGestion(currentId, {
          gestionado,
          gestionobservaciones: obs,
          gestionemail: email,
        })
      }
      setSaveStatus('success')
      await new Promise((r) => setTimeout(r, 650))
      const nextPatch = {
        gestionado,
        gestionobservaciones: obs,
        gestionemail: email,
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
  }, [workshop, estado, advanceToNextPending])

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
        ownerScope={ownerScope}
        onOwnerScopeChange={setOwnerScope}
        search={callerFilter}
        onSearchChange={setCallerFilter}
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

      <div key={tab} className={`triage-stage is-${tab}`}>
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
          onOpenCita={onOpenLead ? handleOpenCita : undefined}
        />
      ) : tab === 'kanban' ? (
        <div className="queue-full">
          <div className="queue-filterbar glass glass-lite card-pad-sm">
            <label className="queue-filter-search">
              <span className="field-label">Buscar</span>
              <div className="relative">
                <Search size={18} className="field-input-icon" aria-hidden />
                <input
                  type="text"
                  placeholder="Cliente, teléfono, matrícula o avería"
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
                  ? ownerScope !== 'todas'
                    ? ownerScopeEmptyCopy(ownerScope)
                    : estado === 'hechas'
                      ? 'Aún no hay consultas hechas'
                      : 'Nada pendiente'
                  : 'Sin consultas en este periodo'}
              </p>
              <p className="section-subtitle mt-2">
                {items.length > 0
                  ? ownerScope !== 'todas'
                    ? 'Prueba «Todas» o cambia el dueño.'
                    : estado === 'hechas'
                      ? `Faltan ${stats.porHacer} por terminar.`
                      : `Hay ${stats.hechas} hechos. Cambia el filtro a «Hechos» o «Todas» para verlos.`
                  : 'Prueba «Ver todo» o amplía el rango de fechas.'}
              </p>
            </Card>
          ) : (
            <PaginatedItems items={agendaItems} label="Consultas" resetKey={pageFilterKey}>
            {(visible) => <div className="panel-stack">
              {groupPeticionesByAgendaDay(visible).map((group, groupIndex) => (
                <section
                  key={group.label}
                  className={`agenda-day-group${groupIndex < 6 ? ' triage-group-enter' : ''}`}
                  style={groupIndex < 6 ? { animationDelay: `${groupIndex * 40}ms` } : undefined}
                >
                  <h2 className="agenda-day-label">
                    {group.label}
                    <span>· {group.items.length}</span>
                  </h2>
                  <ul className="prow-list">
                    {group.items.map((p, itemIndex) => (
                      <PeticionRow
                        key={p.idpeticion}
                        peticion={p}
                        expanded={p.idpeticion === selectedId}
                        saveStatus={p.idpeticion === selectedId ? saveStatus : 'idle'}
                        gestionObs={p.idpeticion === selectedId ? gestionObs : (p.gestionobservaciones ?? '')}
                        gestionEmail={p.idpeticion === selectedId ? gestionEmail : (p.gestionemail ?? '')}
                        onToggle={handleToggleRow}
                        onGestionObsChange={setGestionObs}
                        onGestionEmailChange={setGestionEmail}
                        onMarkGestionado={handleMarkGestionado}
                        onOpenLead={onOpenLead}
                        revealIndex={groupIndex === 0 ? itemIndex : 16}
                        ownerSlot={
                          <TicketOwnerPicker
                            workshop={workshop}
                            workspace={workspace}
                            currentUser={currentUser}
                            appRole={appRole}
                            peticion={p}
                            compact
                          />
                        }
                      />
                    ))}
                  </ul>
                </section>
              ))}
            </div>}
            </PaginatedItems>
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
              <PaginatedItems items={reportItems} label="Informe" resetKey={pageFilterKey}>
              {(visible) => <table className="report-table">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Matrícula</th>
                    <th>Tipo</th>
                    <th>Dueño</th>
                    <th>Consulta</th>
                    <th>Estado</th>
                    <th>Cita</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((p, index) => {
                    const c = p.cita
                    const hecha = Boolean(p.gestionado)
                    return (
                      <tr
                        key={p.idpeticion}
                        className={`${onOpenLead ? 'report-row-clickable' : ''}${index < 18 ? ' triage-row-enter' : ''}`.trim() || undefined}
                        style={index < 18 ? { animationDelay: `${index * 20}ms` } : undefined}
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
                          <TicketClientBlock peticion={p} size="sm" />
                        </td>
                        <td>{c?.matricula ? <VehiclePlate value={c.matricula} compact /> : '—'}</td>
                        <td>{p.tipopeticion ?? '—'}</td>
                        <td onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
                          <TicketOwnerPicker
                            workshop={workshop}
                            workspace={workspace}
                            currentUser={currentUser}
                            appRole={appRole}
                            peticion={p}
                            compact
                          />
                        </td>
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
              </table>}
              </PaginatedItems>
            </Card>
          )}
        </div>
      )}
      </div>
    </div>
  )
}

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Search } from 'lucide-react'
import ApiStatusBanner from '../components/ApiStatusBanner'
import PendingCitasToolbar from '../components/PendingCitasToolbar'
import PeticionGestionPanel from '../components/PeticionGestionPanel'
import PeticionQueueRow from '../components/PeticionQueueRow'
import type { ActionStatus } from '../components/ui/ActionButton'
import Card from '../components/ui/Card'
import { TodoSkeleton } from '../components/ui/Skeleton'
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
  type TipoPeticionRow,
} from '../lib/peticionesPendientes'

type Props = {
  workshop: Workshop
  isDarkMode?: boolean
  initialTab?: TabId
}

type TabId = 'bandeja' | 'reporte'

export default function PendingCitasView({ workshop, initialTab = 'bandeja' }: Props) {
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

  useEffect(() => {
    setTab(initialTab)
  }, [initialTab])

  const effectiveCaller = callerFilter.trim() || undefined
  const dateRange = useMemo(
    () => resolveDateRange(datePreset, customFrom, customTo),
    [datePreset, customFrom, customTo],
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    setSourceNotice(null)
    try {
      const resolved = await resolveAvioldTallerIdsDetailed(workshop)
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
      const tiposRows = await fetchTiposPeticion()
      setItems(rows)
      setTipos(tiposRows)
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
  }, [workshop, effectiveCaller, tipoFilter, dateRange.from, dateRange.to])

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
        view={tab === 'bandeja' ? 'cola' : 'listado'}
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

      {error ? <ApiStatusBanner message={error} variant={isApiError ? 'error' : 'warning'} /> : null}
      {sourceNotice && !error ? <ApiStatusBanner message={sourceNotice} variant="warning" /> : null}

      {tab === 'bandeja' ? (
        <div className="dashboard-workspace">
          <aside className="dashboard-queue-col glass card-pad-sm">
            <div className="dashboard-queue-filters panel-stack">
              <label className="block">
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
              <label className="block">
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

            <div className="dashboard-queue-scroll custom-scrollbar-light">
              {loading ? (
                <ul className="queue-list" aria-busy="true">
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
                <div className="dashboard-queue-empty">
                  <p className="section-subtitle">
                    {items.length > 0
                      ? 'No quedan citas pendientes en este periodo.'
                      : 'Sin consultas. Amplía el periodo o pulsa «Ver todo».'}
                  </p>
                </div>
              ) : (
                <div className="panel-stack">
                  {agendaGroups.map((group) => (
                    <section key={group.label} className="agenda-day-group">
                      <h2 className="agenda-day-label">
                        {group.label}
                        <span>· {group.items.length}</span>
                      </h2>
                      <ul className="queue-list">
                        {group.items.map((p) => (
                          <PeticionQueueRow
                            key={p.idpeticion}
                            peticion={p}
                            active={p.idpeticion === selectedId}
                            onSelect={() => setSelectedId(p.idpeticion)}
                          />
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              )}
            </div>
          </aside>

          <section className="dashboard-detail-col glass card-pad-md" aria-label="Panel de gestión">
            <PeticionGestionPanel
              peticion={selected}
              saveStatus={saveStatus}
              gestionObs={gestionObs}
              gestionEmail={gestionEmail}
              onGestionObsChange={setGestionObs}
              onGestionEmailChange={setGestionEmail}
              onMarkGestionado={(g) => void handleMarkGestionado(g)}
            />
          </section>
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

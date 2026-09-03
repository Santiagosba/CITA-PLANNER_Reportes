import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Phone,
  RefreshCw,
  Search,
  Sparkles,
  User,
  Car,
  Clock,
  Filter,
} from 'lucide-react'
import GlassSurface from '../components/GlassSurface'
import type { Workshop } from '../types'
import {
  buildPeticionesCsv,
  computePeticionesStats,
  downloadCsv,
  fetchPendingPeticiones,
  fetchTiposPeticion,
  formatFecha,
  getPeticionesSourceNotice,
  resolveAvioldTallerIdsDetailed,
  updatePeticionGestion,
  type PeticionPendiente,
  type SqlResolvedTaller,
  type TipoPeticionRow,
} from '../lib/peticionesPendientes'

type Props = {
  workshop: Workshop
  isDarkMode: boolean
  searchQuery?: string
  initialTab?: TabId
}

type TabId = 'bandeja' | 'reporte'

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
  isDarkMode,
}: {
  label: string
  value: number | string
  icon: typeof CalendarClock
  accent: string
  isDarkMode: boolean
}) {
  return (
    <GlassSurface variant="card" isDarkMode={isDarkMode} className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {label}
          </p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{value}</p>
        </div>
        <div className={`rounded-2xl p-2.5 ${accent}`}>
          <Icon size={20} className="text-white" strokeWidth={2} />
        </div>
      </div>
    </GlassSurface>
  )
}

export default function PendingCitasView({ workshop, isDarkMode, searchQuery = '', initialTab = 'bandeja' }: Props) {
  const [tallerIds, setTallerIds] = useState<string[]>([])
  const [resolvedTalleres, setResolvedTalleres] = useState<SqlResolvedTaller[]>([])
  const [tab, setTab] = useState<TabId>(initialTab)
  const [items, setItems] = useState<PeticionPendiente[]>([])
  const [tipos, setTipos] = useState<TipoPeticionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [callerFilter, setCallerFilter] = useState('')
  const [tipoFilter, setTipoFilter] = useState<number | ''>('')
  const [soloConCita, setSoloConCita] = useState(false)
  const [gestionObs, setGestionObs] = useState('')
  const [gestionEmail, setGestionEmail] = useState('')
  const [sourceNotice, setSourceNotice] = useState<string | null>(null)

  const effectiveCaller = (searchQuery.trim() || callerFilter.trim()) || undefined

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const resolved = await resolveAvioldTallerIdsDetailed(workshop)
      setTallerIds(resolved.ids)
      setResolvedTalleres(resolved.talleres)
      if (!resolved.ids.length) {
        setError('No se pudo resolver el ID del taller en CRM (Talleres). Elige un taller concreto de la licencia.')
        setItems([])
        return
      }
      const rows = await fetchPendingPeticiones(resolved.ids, {
        caller: effectiveCaller,
        tipoPeticionId: tipoFilter === '' ? null : tipoFilter,
        soloConCita,
      })
      const tiposRows = await fetchTiposPeticion()
      setItems(rows)
      setTipos(tiposRows)
      setSourceNotice(getPeticionesSourceNotice())
      setSelectedId((prev) => {
        if (prev && rows.some((r) => r.idpeticion === prev)) return prev
        return rows[0]?.idpeticion ?? null
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar peticiones')
    } finally {
      setLoading(false)
    }
  }, [workshop, effectiveCaller, tipoFilter, soloConCita])

  useEffect(() => {
    void load()
  }, [load])

  const stats = useMemo(() => computePeticionesStats(items), [items])
  const selected = useMemo(
    () => items.find((p) => p.idpeticion === selectedId) ?? null,
    [items, selectedId],
  )

  useEffect(() => {
    if (selected) {
      setGestionObs(selected.gestionobservaciones ?? '')
      setGestionEmail(selected.gestionemail ?? '')
    }
  }, [selected?.idpeticion])

  const handleMarkGestionado = async (gestionado: boolean) => {
    if (!selected) return
    setSaving(true)
    setError(null)
    try {
      await updatePeticionGestion(selected.idpeticion, {
        gestionado,
        gestionobservaciones: gestionObs,
        gestionemail: gestionEmail,
      })
      if (gestionado) {
        setItems((prev) => prev.filter((p) => p.idpeticion !== selected.idpeticion))
        setSelectedId(null)
      } else {
        setItems((prev) =>
          prev.map((p) =>
            p.idpeticion === selected.idpeticion
              ? {
                  ...p,
                  gestionado,
                  gestionobservaciones: gestionObs,
                  gestionemail: gestionEmail,
                }
              : p,
          ),
        )
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const handleExport = () => {
    const csv = buildPeticionesCsv(items, workshop.name)
    const stamp = new Date().toISOString().slice(0, 10)
    downloadCsv(csv, `citas-pendientes-${workshop.name.replace(/\s+/g, '-').toLowerCase()}-${stamp}.csv`)
  }

  const textMuted = isDarkMode ? 'text-slate-400' : 'text-slate-500'
  const textMain = isDarkMode ? 'text-white' : 'text-slate-900'

  return (
    <div className="glass-mesh-bg relative min-h-[60vh] flex-1 rounded-3xl p-1 sm:p-2">
      <div className="animate-fade-in space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Sparkles size={18} className="text-teal-400" />
              <span className={`text-xs font-semibold uppercase tracking-widest ${textMuted}`}>
                Automatización citas
              </span>
            </div>
            <h1 className={`text-2xl font-bold tracking-tight sm:text-3xl ${textMain}`}>
              Citas pendientes en calendario
            </h1>
            <p className={`mt-1 max-w-2xl text-sm ${textMuted}`}>
              Peticiones ChatBot sin cerrar ({workshop.name}
              {tallerIds.length > 1 ? ` · ${tallerIds.length} talleres` : ''}). Gestión manual previa al flujo
              automatizado.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-slate-700 backdrop-blur-md transition hover:bg-white/20 dark:text-slate-200"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              Actualizar
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={!items.length}
              className="inline-flex items-center gap-2 rounded-full bg-teal-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-teal-900/25 transition hover:bg-teal-400 disabled:opacity-40"
            >
              <Download size={16} />
              Exportar CSV
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Pendientes"
            value={stats.total}
            icon={CalendarClock}
            accent="bg-gradient-to-br from-teal-500 to-emerald-600"
            isDarkMode={isDarkMode}
          />
          <StatCard
            label="Con cita"
            value={stats.conCita}
            icon={CheckCircle2}
            accent="bg-gradient-to-br from-sky-500 to-blue-600"
            isDarkMode={isDarkMode}
          />
          <StatCard
            label="Sin cita"
            value={stats.sinCita}
            icon={AlertCircle}
            accent="bg-gradient-to-br from-amber-500 to-orange-600"
            isDarkMode={isDarkMode}
          />
          <StatCard
            label="Tipos distintos"
            value={Object.keys(stats.tipos).length}
            icon={Filter}
            accent="bg-gradient-to-br from-violet-500 to-purple-600"
            isDarkMode={isDarkMode}
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          {(['bandeja', 'reporte'] as TabId[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                tab === t
                  ? 'bg-teal-500 text-white shadow-md'
                  : 'border border-white/15 bg-white/5 text-slate-600 dark:text-slate-300'
              }`}
            >
              {t === 'bandeja' ? 'Bandeja de gestión' : 'Vista reporte'}
            </button>
          ))}
        </div>

        {sourceNotice && (
          <GlassSurface variant="card" isDarkMode={isDarkMode} className="border-amber-500/30 p-4">
            <p className="flex items-start gap-2 text-sm text-amber-200">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              {sourceNotice}
            </p>
          </GlassSurface>
        )}

        {error && (
          <GlassSurface variant="card" isDarkMode={isDarkMode} className="border-rose-500/30 p-4">
            <p className="flex items-center gap-2 text-sm text-rose-400">
              <AlertCircle size={16} />
              {error}
            </p>
          </GlassSurface>
        )}

        {tab === 'bandeja' ? (
          <div className="grid gap-4 lg:grid-cols-5 lg:gap-6">
            {/* Lista + filtros */}
            <div className="space-y-3 lg:col-span-2">
              <GlassSurface variant="panel" isDarkMode={isDarkMode} className="p-4">
                <div className="space-y-3">
                  <div className="relative">
                    <Search size={16} className={`absolute left-3 top-1/2 -translate-y-1/2 ${textMuted}`} />
                    <input
                      type="text"
                      placeholder="Filtrar por teléfono (caller)…"
                      value={callerFilter}
                      onChange={(e) => setCallerFilter(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none ring-teal-500/30 placeholder:text-slate-500 focus:ring-2 dark:text-white"
                    />
                  </div>
                  <select
                    value={tipoFilter}
                    onChange={(e) => setTipoFilter(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-slate-900 outline-none dark:text-white"
                  >
                    <option value="">Todos los tipos</option>
                    {tipos.map((t) => (
                      <option key={t.idtipopeticion} value={t.idtipopeticion}>
                        {t.tipopeticion}
                      </option>
                    ))}
                  </select>
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={soloConCita}
                      onChange={(e) => setSoloConCita(e.target.checked)}
                      className="rounded border-slate-400 text-teal-500 focus:ring-teal-500"
                    />
                    Solo con cita en calendario
                  </label>
                </div>
              </GlassSurface>

              <GlassSurface variant="panel" isDarkMode={isDarkMode} className="max-h-[52vh] overflow-hidden">
                {loading ? (
                  <div className="flex items-center justify-center gap-2 py-16 text-slate-400">
                    <Loader2 size={20} className="animate-spin" />
                    Cargando peticiones…
                  </div>
                ) : items.length === 0 ? (
                  <div className={`py-16 text-center text-sm ${textMuted} space-y-2 px-4`}>
                    <p>No hay peticiones pendientes con estos filtros.</p>
                    {tallerIds.length > 0 && (
                      <p className="text-[11px] font-mono opacity-70">
                        {resolvedTalleres.length > 0
                          ? `Talleres CRM: ${resolvedTalleres.map((t) => `${t.nombre} (${t.idtaller})`).join(' · ')}`
                          : `IDTaller consultado: ${tallerIds.join(', ')}`}
                      </p>
                    )}
                  </div>
                ) : (
                  <ul className="custom-scrollbar-light max-h-[52vh] overflow-y-auto divide-y divide-white/5">
                    {items.map((p) => {
                      const active = p.idpeticion === selectedId
                      const c = p.cita
                      const cliente = c ? [c.nombre, c.apellidos].filter(Boolean).join(' ') : null
                      return (
                        <li key={p.idpeticion}>
                          <button
                            type="button"
                            onClick={() => setSelectedId(p.idpeticion)}
                            className={`w-full px-4 py-3.5 text-left transition ${
                              active ? 'bg-teal-500/15' : 'hover:bg-white/5'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className={`truncate text-sm font-semibold ${textMain}`}>
                                  {cliente || p.caller || 'Sin teléfono'}
                                </p>
                                <p className={`mt-0.5 truncate text-xs ${textMuted}`}>{p.tipopeticion}</p>
                              </div>
                              {p.idcita && (
                                <span className="shrink-0 rounded-full bg-sky-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase text-sky-300">
                                  Cita
                                </span>
                              )}
                            </div>
                            <p className={`mt-1 text-[11px] ${textMuted}`}>{formatFecha(p.fechainicio)}</p>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </GlassSurface>
            </div>

            {/* Detalle gestión */}
            <GlassSurface variant="panel" isDarkMode={isDarkMode} className="lg:col-span-3 p-5 sm:p-6">
              {!selected ? (
                <p className={`py-20 text-center text-sm ${textMuted}`}>Selecciona una petición para gestionarla.</p>
              ) : (
                <div className="animate-fade-in-up space-y-5">
                  <div>
                    <p className={`text-xs font-semibold uppercase tracking-wider ${textMuted}`}>Detalle</p>
                    <h2 className={`mt-1 text-xl font-bold ${textMain}`}>
                      {[selected.cita?.nombre, selected.cita?.apellidos].filter(Boolean).join(' ') ||
                        selected.caller ||
                        'Petición'}
                    </h2>
                    <p className={`mt-1 text-sm ${textMuted}`}>{selected.descripcion}</p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <InfoRow icon={Phone} label="Teléfono" value={selected.caller} isDarkMode={isDarkMode} />
                    <InfoRow icon={Clock} label="Inicio sesión" value={formatFecha(selected.fechainicio)} isDarkMode={isDarkMode} />
                    <InfoRow icon={CalendarClock} label="Cita programada" value={formatFecha(selected.cita?.fecha)} isDarkMode={isDarkMode} />
                    <InfoRow icon={User} label="Tipo" value={selected.tipopeticion} isDarkMode={isDarkMode} />
                    {selected.cita?.matricula && (
                      <InfoRow icon={Car} label="Matrícula" value={selected.cita.matricula} isDarkMode={isDarkMode} />
                    )}
                    {(selected.cita?.marca || selected.cita?.modelo) && (
                      <InfoRow
                        icon={Car}
                        label="Vehículo"
                        value={[selected.cita?.marca, selected.cita?.modelo].filter(Boolean).join(' ')}
                        isDarkMode={isDarkMode}
                      />
                    )}
                  </div>

                  <div className="space-y-3 border-t border-white/10 pt-5">
                    <p className={`text-xs font-semibold uppercase tracking-wider ${textMuted}`}>Gestión manual</p>
                    <input
                      type="email"
                      placeholder="Email de gestión (opcional)"
                      value={gestionEmail}
                      onChange={(e) => setGestionEmail(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-teal-500/40 dark:text-white"
                    />
                    <textarea
                      rows={3}
                      placeholder="Observaciones de gestión…"
                      value={gestionObs}
                      onChange={(e) => setGestionObs(e.target.value)}
                      className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-teal-500/40 dark:text-white"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void handleMarkGestionado(true)}
                        className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:bg-emerald-400 disabled:opacity-50"
                      >
                        {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                        Marcar gestionada
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void handleMarkGestionado(false)}
                        className="inline-flex items-center gap-2 rounded-full border border-white/20 px-5 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-white/10 dark:text-slate-300"
                      >
                        Guardar borrador
                      </button>
                    </div>
                    <p className={`text-[11px] ${textMuted}`}>
                      ID: {selected.idpeticion}
                      {selected.idcita ? ` · Cita: ${selected.idcita}` : ''}
                    </p>
                  </div>
                </div>
              )}
            </GlassSurface>
          </div>
        ) : (
          /* Reporte tab */
          <GlassSurface variant="panel" isDarkMode={isDarkMode} className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div className="flex items-center gap-2">
                <FileSpreadsheet size={18} className="text-teal-400" />
                <span className={`font-semibold ${textMain}`}>Reporte de citas pendientes</span>
              </div>
              <button
                type="button"
                onClick={handleExport}
                disabled={!items.length}
                className="text-sm font-medium text-teal-400 hover:text-teal-300 disabled:opacity-40"
              >
                Descargar
              </button>
            </div>
            <div className="custom-scrollbar-light max-h-[55vh] overflow-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="sticky top-0 bg-slate-900/80 backdrop-blur-md dark:bg-slate-950/80">
                  <tr className={`border-b border-white/10 text-xs uppercase tracking-wider ${textMuted}`}>
                    <th className="px-4 py-3 font-semibold">Teléfono</th>
                    <th className="px-4 py-3 font-semibold">Tipo</th>
                    <th className="px-4 py-3 font-semibold">Inicio</th>
                    <th className="px-4 py-3 font-semibold">Cita</th>
                    <th className="px-4 py-3 font-semibold">Cliente</th>
                    <th className="px-4 py-3 font-semibold">Matrícula</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((p) => {
                    const c = p.cita
                    const cliente = c ? [c.nombre, c.apellidos].filter(Boolean).join(' ') : '—'
                    return (
                      <tr
                        key={p.idpeticion}
                        className="border-b border-white/5 transition hover:bg-white/5"
                      >
                        <td className="px-4 py-3 font-mono text-xs">{p.caller ?? '—'}</td>
                        <td className="px-4 py-3">{p.tipopeticion ?? '—'}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{formatFecha(p.fechainicio)}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{formatFecha(c?.fecha)}</td>
                        <td className="px-4 py-3">{cliente}</td>
                        <td className="px-4 py-3 font-mono text-xs">{c?.matricula ?? '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {!items.length && !loading && (
                <p className={`py-12 text-center text-sm ${textMuted}`}>Sin datos para el reporte.</p>
              )}
            </div>
            <div className={`border-t border-white/10 px-5 py-3 text-xs ${textMuted}`}>
              Desglose por tipo:{' '}
              {Object.entries(stats.tipos)
                .map(([k, v]) => `${k} (${v})`)
                .join(' · ') || '—'}
            </div>
          </GlassSurface>
        )}
      </div>
    </div>
  )
}

function InfoRow({
  icon: Icon,
  label,
  value,
  isDarkMode,
}: {
  icon: typeof Phone
  label: string
  value: string | null | undefined
  isDarkMode: boolean
}) {
  return (
    <GlassSurface variant="card" isDarkMode={isDarkMode} className="flex items-center gap-3 p-3">
      <div className="rounded-xl bg-white/10 p-2">
        <Icon size={16} className="text-teal-400" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
        <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{value || '—'}</p>
      </div>
    </GlassSurface>
  )
}

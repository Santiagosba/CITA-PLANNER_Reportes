import { TrendingUp } from 'lucide-react'
import type { PeticionesStats } from '../lib/peticionesPendientes'

type Props = {
  stats: PeticionesStats
  periodLabel: string
  isDarkMode: boolean
  loading?: boolean
}

export default function PeticionesStatsPanel({ stats, periodLabel, isDarkMode, loading }: Props) {
  const surface = isDarkMode
    ? 'border border-white/10 bg-slate-900/60'
    : 'border border-slate-200 bg-white'
  const muted = isDarkMode ? 'text-slate-400' : 'text-slate-500'
  const tiposOrdenados = Object.entries(stats.tipos).sort((a, b) => b[1] - a[1])

  if (loading || stats.total === 0) return null

  return (
    <div className={`rounded-xl p-4 sm:p-5 ${surface}`}>
      <div className="mb-3 flex items-center gap-2">
        <TrendingUp size={16} className="text-blue-600" />
        <span className={`text-xs font-semibold uppercase tracking-wider ${muted}`}>
          Distribución · {periodLabel}
        </span>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-[11px] font-medium">
          <span className="text-amber-600 dark:text-amber-400">
            Faltan {stats.porHacer} ({stats.pctPendientes > 0 || stats.total > 0 ? Math.round(100 - stats.pctHechas) : 0}%)
          </span>
          <span className="text-emerald-600 dark:text-emerald-400">
            Hechas {stats.hechas} ({stats.pctHechas}%)
          </span>
        </div>
        <div className={`relative h-2 overflow-hidden rounded-full ${isDarkMode ? 'bg-white/10' : 'bg-slate-100'}`}>
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-amber-400"
            style={{ width: `${Math.max(0, 100 - stats.pctHechas)}%` }}
          />
          <div
            className="absolute inset-y-0 rounded-full bg-emerald-500"
            style={{ left: `${Math.max(0, 100 - stats.pctHechas)}%`, width: `${stats.pctHechas}%` }}
          />
        </div>
      </div>

      {tiposOrdenados.length > 0 && (
        <div className="custom-scrollbar-light mt-4 grid max-h-48 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3 lg:grid-cols-4">
          {tiposOrdenados.map(([name, count]) => (
            <div
              key={name}
              className={`rounded-lg px-3 py-2 ${isDarkMode ? 'bg-white/5' : 'bg-slate-50'}`}
            >
              <p className="truncate text-xs font-medium text-slate-700 dark:text-slate-200">{name}</p>
              <p className="text-lg font-bold tabular-nums text-slate-900 dark:text-white">{count}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

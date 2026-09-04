import { CalendarRange } from 'lucide-react'
import GlassSurface from './GlassSurface'
import {
  DATE_PRESET_OPTIONS,
  type DateRangePreset,
  type ResolvedDateRange,
} from '../lib/dateRangePresets'

type Props = {
  preset: DateRangePreset
  customFrom: string
  customTo: string
  resolved: ResolvedDateRange
  isDarkMode: boolean
  onPresetChange: (preset: DateRangePreset) => void
  onCustomFromChange: (v: string) => void
  onCustomToChange: (v: string) => void
}

export default function DateRangeFilter({
  preset,
  customFrom,
  customTo,
  resolved,
  isDarkMode,
  onPresetChange,
  onCustomFromChange,
  onCustomToChange,
}: Props) {
  const textMuted = isDarkMode ? 'text-slate-400' : 'text-slate-500'
  const textMain = isDarkMode ? 'text-white' : 'text-slate-900'

  return (
    <GlassSurface variant="apple" isDarkMode={isDarkMode} className="p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <CalendarRange size={18} className="text-blue-400 shrink-0" />
          <div>
            <p className={`text-xs font-semibold uppercase tracking-wider ${textMuted}`}>Periodo</p>
            <p className={`text-sm font-medium ${textMain}`}>{resolved.label}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {DATE_PRESET_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => onPresetChange(opt.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                preset === opt.id
                  ? 'bg-white/90 text-slate-900 shadow-sm dark:bg-white/20 dark:text-white'
                  : 'text-slate-600 hover:bg-white/10 dark:text-slate-300'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      {preset === 'personalizada' && (
        <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-white/10 pt-3">
          <label className="flex flex-col gap-1">
            <span className={`text-[10px] font-semibold uppercase tracking-wider ${textMuted}`}>Desde</span>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => onCustomFromChange(e.target.value)}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500/40 dark:text-white"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={`text-[10px] font-semibold uppercase tracking-wider ${textMuted}`}>Hasta</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => onCustomToChange(e.target.value)}
              min={customFrom || undefined}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500/40 dark:text-white"
            />
          </label>
        </div>
      )}
    </GlassSurface>
  )
}

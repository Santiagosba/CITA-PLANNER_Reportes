import { ChevronLeft, ChevronRight } from 'lucide-react'
import { localTodayIso } from '../lib/advisorWorkspace'
import {
  CALENDAR_SCALE_OPTIONS,
  calendarPeriod,
  shiftCalendarAnchor,
  type CalendarScale,
} from '../lib/calendarScale'
import SegmentedControl from './SegmentedControl'

type Props = {
  scale: CalendarScale
  anchor: Date
  onScaleChange: (scale: CalendarScale) => void
  onAnchorChange: (anchor: Date) => void
}

function todayAnchor() {
  return new Date(`${localTodayIso()}T12:00:00`)
}

function titleCaseEs(value: string) {
  return value ? value.charAt(0).toLocaleUpperCase('es-ES') + value.slice(1) : value
}

export default function PeriodFilter({ scale, anchor, onScaleChange, onAnchorChange }: Props) {
  const period = calendarPeriod(scale, anchor)
  const current = calendarPeriod(scale, todayAnchor())
  const isCurrent = period.from === current.from && period.to === current.to

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <SegmentedControl
        value={scale}
        options={CALENDAR_SCALE_OPTIONS}
        onChange={onScaleChange}
        ariaLabel="Periodo"
      />
      <div className="flex min-w-0 items-center gap-1">
        <button
          type="button"
          className="ghost-button min-h-tap min-w-tap px-2"
          onClick={() => onAnchorChange(shiftCalendarAnchor(scale, anchor, -1))}
          aria-label="Periodo anterior"
        >
          <ChevronLeft size={18} />
        </button>
        <p className="m-0 min-w-0 truncate px-1 text-sm font-semibold text-avi-fog-strong">
          {titleCaseEs(period.label)}
        </p>
        <button
          type="button"
          className="ghost-button min-h-tap min-w-tap px-2"
          onClick={() => onAnchorChange(shiftCalendarAnchor(scale, anchor, 1))}
          aria-label="Periodo siguiente"
        >
          <ChevronRight size={18} />
        </button>
        {isCurrent ? null : (
          <button type="button" className="ghost-button min-h-tap px-3" onClick={() => onAnchorChange(todayAnchor())}>
            Hoy
          </button>
        )}
      </div>
    </div>
  )
}

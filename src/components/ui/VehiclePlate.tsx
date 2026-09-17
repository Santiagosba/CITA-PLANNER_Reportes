import { formatMatricula } from '../../lib/ticketPlate'

export { formatMatricula }

type Props = {
  value: string
  compact?: boolean
  countryCode?: string
  className?: string
}

const STAR_POSITIONS = [
  [8, 1.5],
  [11.25, 2.37],
  [13.63, 4.75],
  [14.5, 8],
  [13.63, 11.25],
  [11.25, 13.63],
  [8, 14.5],
  [4.75, 13.63],
  [2.37, 11.25],
  [1.5, 8],
  [2.37, 4.75],
  [4.75, 2.37],
]

function codeSize(text: string, compact: boolean): string {
  const n = text.replace(/\s/g, '').length
  if (compact) {
    if (n <= 7) return 'text-[15px] tracking-[0.11em]'
    if (n <= 9) return 'text-[13px] tracking-[0.07em]'
    return 'text-[11px] tracking-[0.04em]'
  }
  if (n <= 7) return 'text-[18px] tracking-[0.12em]'
  if (n <= 9) return 'text-[16px] tracking-[0.08em]'
  return 'text-[13px] tracking-[0.05em]'
}

export default function VehiclePlate({
  value,
  compact = false,
  countryCode = 'E',
  className = '',
}: Props) {
  const normalized = formatMatricula(value)
  if (!normalized) return null

  return (
    <span
      className={`vehicle-plate ${compact ? 'is-compact' : ''} relative inline-flex shrink-0 items-stretch overflow-hidden border-solid border-[#1c1e22] bg-[linear-gradient(180deg,#fffdf8_0%,#f4f1ea_52%,#ebe6dc_100%)] text-[#141414] ${
        compact
          ? 'h-[30px] min-w-[154px] rounded-[5px] border-[1.5px]'
          : 'h-9 min-w-[176px] rounded-[6px] border-2'
      } shadow-[inset_0_1px_0_rgba(255,255,255,0.95),inset_0_0_0_1px_rgba(255,255,255,0.55),0_1px_2px_rgba(15,17,21,0.22)] ${className}`.trim()}
      role="img"
      aria-label={`Matrícula ${normalized}`}
      title={normalized}
    >
      <span
        className={`vehicle-plate-eu relative flex shrink-0 flex-col items-center justify-center bg-[linear-gradient(180deg,#1a4dad_0%,#003399_100%)] font-bold leading-none text-white ${
          compact ? 'w-[21px] gap-px text-[7px]' : 'w-6 gap-0.5 text-[8px]'
        }`}
        aria-hidden
        style={{ fontFamily: 'Arial, sans-serif' }}
      >
        <svg
          viewBox="0 0 16 16"
          focusable="false"
          className={`block fill-[#ffcc00] ${compact ? 'h-2.5 w-2.5' : 'h-3 w-3'}`}
        >
          {STAR_POSITIONS.map(([cx, cy], index) => (
            <circle key={index} cx={cx} cy={cy} r="0.7" />
          ))}
        </svg>
        <span className="font-extrabold tracking-[0.02em]">{countryCode}</span>
      </span>
      <span
        className={`vehicle-plate-code flex min-w-[7.5rem] flex-1 items-center justify-center whitespace-nowrap px-2 font-bold leading-none text-[#141414] [font-family:'Barlow_Condensed','Arial_Narrow','Roboto_Condensed',sans-serif] ${codeSize(normalized, compact)}`}
      >
        {normalized}
      </span>
    </span>
  )
}

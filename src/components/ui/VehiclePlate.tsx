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

const MODERN_LETTERS = 'BCDFGHJKLMNPRSTVWXYZ'

/** 1234ABC → 1234 ABC. Clásica M1234AB. Si hay basura detrás, se queda la chapa. */
export function formatMatricula(raw: string): string {
  const compact = raw.replace(/[\s.-]/g, '').toUpperCase()
  if (!compact) return ''

  const modern = compact.match(new RegExp(`^(\\d{4})([${MODERN_LETTERS}]{3})`))
  if (modern) return `${modern[1]} ${modern[2]}`

  const anyModern = compact.match(new RegExp(`(\\d{4})([A-Z]{3})`))
  if (anyModern && compact.length > 7) return `${anyModern[1]} ${anyModern[2]}`

  const classic = compact.match(/^([A-Z]{1,2})(\d{4})([A-Z]{2,3})$/)
  if (classic) return `${classic[1]} ${classic[2]} ${classic[3]}`

  const classicPrefix = compact.match(/^([A-Z]{1,2})(\d{4})([A-Z]{2,3})/)
  if (classicPrefix && compact.length > 9) return `${classicPrefix[1]} ${classicPrefix[2]} ${classicPrefix[3]}`

  return compact.replace(/([A-Z]+)(\d+)/g, '$1 $2').replace(/(\d+)([A-Z]+)/g, '$1 $2')
}

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
  const parts = normalized.split(/\s+/).filter(Boolean)

  return (
    <span
      className={`vehicle-plate ${compact ? 'is-compact' : ''} relative inline-flex shrink-0 items-stretch overflow-hidden border-solid border-[#1c1e22] bg-[linear-gradient(180deg,#fffdf8_0%,#f4f1ea_52%,#ebe6dc_100%)] text-[#141414] ${
        compact
          ? 'h-[30px] max-w-[196px] min-w-[142px] rounded-[5px] border-[1.5px]'
          : 'h-9 max-w-[228px] min-w-[164px] rounded-[6px] border-2'
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
        className={`vehicle-plate-code flex min-w-0 flex-1 items-center justify-center gap-[0.28em] overflow-hidden whitespace-nowrap px-1.5 font-bold leading-none [font-family:'Barlow_Condensed','Arial_Narrow','Roboto_Condensed',sans-serif] ${codeSize(normalized, compact)}`}
      >
        {parts.map((part, index) => (
          <span key={`${part}-${index}`} className="shrink-0">
            {part}
          </span>
        ))}
      </span>
    </span>
  )
}

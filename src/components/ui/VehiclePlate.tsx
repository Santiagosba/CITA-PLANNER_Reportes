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

/** Formato español actual: 1234ABC → 1234 ABC. Si no encaja, se deja tal cual. */
export function formatMatricula(raw: string): string {
  const compact = raw.replace(/[\s.-]/g, '').toUpperCase()
  const modern = compact.match(/^(\d{4})([BCDFGHJKLMNPRSTVWXYZ]{3})$/)
  if (modern) return `${modern[1]} ${modern[2]}`
  return compact
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
      className={`vehicle-plate ${compact ? 'is-compact' : ''} ${className}`.trim()}
      role="img"
      aria-label={`Matrícula ${normalized}`}
    >
      <span className="vehicle-plate-eu" aria-hidden>
        <svg viewBox="0 0 16 16" focusable="false">
          {STAR_POSITIONS.map(([cx, cy], index) => (
            <circle key={index} cx={cx} cy={cy} r="0.75" />
          ))}
        </svg>
        <span>{countryCode}</span>
      </span>
      <span className="vehicle-plate-code">{normalized}</span>
    </span>
  )
}

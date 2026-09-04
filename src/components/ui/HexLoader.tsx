type Size = 'sm' | 'md' | 'lg'

type Props = {
  size?: Size
  label?: string
  className?: string
}

const DOTS = [0, 1, 2, 3, 4, 5]

export default function HexLoader({ size = 'md', label = 'Cargando', className = '' }: Props) {
  return (
    <div
      className={`hex-loader is-${size} ${className}`.trim()}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <span className="hex-loader-aura" aria-hidden />
      <span className="hex-loader-wire" aria-hidden />
      <span className="hex-loader-orbit" aria-hidden>
        {DOTS.map((i) => (
          <i key={i} style={{ ['--i' as string]: i }} />
        ))}
      </span>
    </div>
  )
}

export function HexLoaderScreen({
  size = 'lg',
  label = 'Cargando',
  className = '',
}: Props) {
  return (
    <div className={`hex-loader-screen ${className}`.trim()}>
      <HexLoader size={size} label={label} />
      {label ? <p className="section-subtitle hex-loader-caption">{label}</p> : null}
    </div>
  )
}

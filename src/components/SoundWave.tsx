type Props = {
  levels: number[]
  /** Variante compacta para la burbuja flotante. */
  compact?: boolean
  label?: string
}

/** Barras de intensidad (estilo «en llamada») a partir de AnalyserNode. */
export default function SoundWave({ levels, compact = false, label = 'Intensidad de la llamada' }: Props) {
  return (
    <div className={`sound-wave${compact ? ' is-compact' : ''}`} role="img" aria-label={label}>
      {levels.map((level, i) => (
        <span
          key={i}
          className="sound-wave-bar"
          style={{ transform: `scaleY(${Math.max(0.08, Math.min(1, level))})` }}
        />
      ))}
    </div>
  )
}

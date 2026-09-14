import type { CSSProperties } from 'react'

type Props = {
  score: number
  reason?: string
}

/** Color de calor: claro = poca urgencia, rojo fuego = mucha. */
export function urgencyHeatColor(score: number): string {
  const t = Math.max(0, Math.min(100, score)) / 100
  const hue = 38 - t * 32
  const sat = 72 + t * 26
  const light = 74 - t * 30
  return `hsl(${hue} ${sat}% ${light}%)`
}

export default function UrgencyThermometer({ score, reason }: Props) {
  const safe = Math.max(0, Math.min(100, score))
  const heat = urgencyHeatColor(safe)
  const style = {
    '--heat': heat,
    '--heat-pct': `${safe}%`,
  } as CSSProperties

  return (
    <section className="lead-thermo" style={style} aria-label={`Urgencia ${safe} de 100`}>
      <div className="lead-thermo-head">
        <span>Urgencia</span>
        <strong style={{ color: heat }}>{safe}</strong>
      </div>
      <div
        className="lead-thermo-track"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={safe}
      >
        <span className="lead-thermo-bulb" aria-hidden />
        <span className="lead-thermo-fill" />
      </div>
      {reason ? <small className="lead-thermo-reason">{reason}</small> : null}
    </section>
  )
}

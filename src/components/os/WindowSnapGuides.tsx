import { useOsSnapLines } from '../../lib/osWindowRegistry'

/** Guías al alinear una ventana con otra o con el borde del escritorio. */
export default function WindowSnapGuides() {
  const lines = useOsSnapLines()
  if (lines.length === 0) return null
  return (
    <div className="os-snap-guides" aria-hidden>
      {lines.map((line, i) => (
        <span
          key={`${line.axis}-${line.at}-${i}`}
          className={`os-snap-line is-${line.axis}`}
          style={
            line.axis === 'x'
              ? { left: line.at, top: line.from, height: Math.max(12, line.to - line.from) }
              : { top: line.at, left: line.from, width: Math.max(12, line.to - line.from) }
          }
        />
      ))}
    </div>
  )
}

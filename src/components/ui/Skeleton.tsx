type Props = {
  lines?: number
  className?: string
}

export default function Skeleton({ lines = 3, className = '' }: Props) {
  return (
    <div className={`skeleton-block ${className}`.trim()} aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="skeleton-line" style={{ width: i === lines - 1 ? '72%' : '100%' }} />
      ))}
    </div>
  )
}

export function TodoSkeleton() {
  return (
    <div className="todo-item glass skeleton-todo" aria-busy="true" aria-label="Cargando consultas">
      <div className="todo-item-main">
        <div className="skeleton-marker" />
        <div className="flex-1 panel-stack">
          <div className="skeleton-line skeleton-line-lg" />
          <div className="skeleton-line skeleton-line-sm" />
        </div>
      </div>
    </div>
  )
}

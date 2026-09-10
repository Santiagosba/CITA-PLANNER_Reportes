import { useState, type ReactNode } from 'react'
import { pageBounds } from '../lib/pageBounds'

type Props<T> = {
  items: T[]
  label: string
  resetKey: string
  children: (visible: T[]) => ReactNode
}

/** Bound mounted rows, while callers retain the full dataset for filters and exports. */
export default function PaginatedItems<T>({ items, label, resetKey, children }: Props<T>) {
  const [selection, setSelection] = useState({ key: resetKey, page: 0 })
  const bounds = pageBounds(items.length, selection.key === resetKey ? selection.page : 0)
  const changePage = (page: number) => setSelection({ key: resetKey, page })
  const controls = items.length > bounds.size ? (
    <nav aria-label={label + ': páginas'} className="flex flex-wrap items-center justify-between gap-3 p-3">
      <span className="section-subtitle" aria-live="polite">
        {bounds.start + 1}–{bounds.end} de {items.length}
      </span>
      <div className="flex items-center gap-3">
        <button type="button" className="ghost-button" disabled={bounds.page === 0} onClick={() => changePage(bounds.page - 1)}>Anterior</button>
        <span>Página {bounds.page + 1} de {bounds.pages}</span>
        <button type="button" className="ghost-button" disabled={bounds.page + 1 >= bounds.pages} onClick={() => changePage(bounds.page + 1)}>Siguiente</button>
      </div>
    </nav>
  ) : null
  return <div>{controls}{children(items.slice(bounds.start, bounds.end))}</div>
}

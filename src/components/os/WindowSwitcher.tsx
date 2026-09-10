type Item = {
  id: string
  title: string
  kind: 'ficha' | 'app'
}

type Props = {
  items: Item[]
  index: number
}

/** Recorrido tipo Comando+Tabulador entre ventanas abiertas del CRM. */
export default function WindowSwitcher({ items, index }: Props) {
  if (items.length === 0) return null
  return (
    <div className="os-win-switcher" role="listbox" aria-label="Ventanas abiertas" aria-activedescendant={`os-switch-${items[index]?.id}`}>
      {items.map((item, i) => (
        <div
          key={`${item.kind}-${item.id}`}
          id={`os-switch-${item.id}`}
          role="option"
          aria-selected={i === index}
          className={`os-win-switcher-item${i === index ? ' is-active' : ''}`}
        >
          <strong>{item.title}</strong>
          <span>{item.kind === 'app' ? 'App' : 'Ficha'}</span>
        </div>
      ))}
    </div>
  )
}

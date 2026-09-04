import type { ReactNode } from 'react'

type Props = {
  children: ReactNode
  className?: string
  padding?: 'none' | 'sm' | 'md' | 'lg'
  inline?: boolean
}

const padClass = {
  none: '',
  sm: 'card-pad-sm',
  md: 'card-pad-md',
  lg: 'card-pad-lg',
}

export default function Card({ children, className = '', padding = 'md', inline = false }: Props) {
  // Radio + cristal nítido (`.glass-lite`) para que todas las tarjetas compartan
  // la misma silueta orgánica y legibilidad.
  const surface = inline ? 'glass-inline glass-lite' : 'glass glass-lite'
  return <div className={`${surface} ${padClass[padding]} ${className}`.trim()}>{children}</div>
}

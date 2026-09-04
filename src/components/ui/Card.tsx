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
  // El radio lo define `.glass`/`.glass-inline`: si lo forzamos con una utilidad
  // de Tailwind gana sobre los radios compactos del dashboard y las tarjetas
  // quedan con esquinas distintas al resto de superficies.
  const surface = inline ? 'glass-inline' : 'glass'
  return <div className={`${surface} ${padClass[padding]} ${className}`.trim()}>{children}</div>
}

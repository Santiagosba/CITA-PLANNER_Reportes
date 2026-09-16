import type { ReactNode } from 'react'

type Props = {
  children: ReactNode
  className?: string
  padding?: 'none' | 'sm' | 'md' | 'lg'
  inline?: boolean
}

const padClass = {
  none: '',
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-6',
}

export default function Card({ children, className = '', padding = 'md', inline = false }: Props) {
  const surface = inline ? 'glass-inline glass-lite' : 'glass glass-lite'
  return <div className={`${surface} squircle ${padClass[padding]} ${className}`.trim()}>{children}</div>
}

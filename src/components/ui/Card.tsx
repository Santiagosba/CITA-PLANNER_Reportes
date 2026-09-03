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
  const surface = inline ? 'glass-inline' : 'glass'
  const radius = inline ? 'rounded-[var(--radius-md)]' : 'rounded-[var(--radius-lg)]'
  return (
    <div className={`${surface} ${radius} ${padClass[padding]} ${className}`.trim()}>{children}</div>
  )
}

import type { ReactNode } from 'react'

type Props = {
  children: ReactNode
  className?: string
  isDarkMode?: boolean
  variant?: 'panel' | 'card' | 'pill' | 'apple'
  onClick?: () => void
}

export default function GlassSurface({
  children,
  className = '',
  isDarkMode: _isDarkMode = true,
  variant = 'panel',
  onClick,
}: Props) {
  // Misma capa AVI CRM (cristal nítido) en claro y oscuro vía tokens.
  const surface = 'glass glass-lite'
  const shape =
    variant === 'pill'
      ? 'rounded-full'
      : variant === 'card' || variant === 'apple'
        ? 'rounded-[var(--radius-lg)]'
        : 'rounded-[var(--radius-xl)]'
  const Tag = onClick ? 'button' : 'div'

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`${surface} ${shape} transition-all duration-300 ${onClick ? 'cursor-pointer hover:scale-[1.005] active:scale-[0.995]' : ''} ${className}`}
    >
      {children}
    </Tag>
  )
}

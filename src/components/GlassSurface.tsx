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
  isDarkMode = true,
  variant = 'panel',
  onClick,
}: Props) {
  const base =
    variant === 'apple'
      ? isDarkMode
        ? 'glass-apple-dark'
        : 'glass-apple-light'
      : isDarkMode
        ? 'glass-dark'
        : 'glass-light'
  const shape =
    variant === 'pill'
      ? 'rounded-full'
      : variant === 'card' || variant === 'apple'
        ? 'rounded-2xl'
        : 'rounded-3xl'
  const Tag = onClick ? 'button' : 'div'

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`${base} ${shape} transition-all duration-300 ${onClick ? 'cursor-pointer hover:scale-[1.005] active:scale-[0.995]' : ''} ${className}`}
    >
      {children}
    </Tag>
  )
}

import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  children: ReactNode
  fullWidth?: boolean
}

const variants: Record<Variant, string> = {
  primary: 'client-submit inline-flex min-h-tap items-center justify-center gap-2',
  secondary: 'ghost-button inline-flex min-h-tap items-center justify-center gap-2',
  ghost: 'ghost-action is-neutral inline-flex min-h-tap items-center justify-center gap-2',
  danger: 'ghost-action inline-flex min-h-tap items-center justify-center gap-2',
}

export default function Button({
  variant = 'primary',
  children,
  fullWidth,
  className = '',
  ...rest
}: Props) {
  return (
    <button type="button" className={`${variants[variant]} squircle ${fullWidth ? 'w-full-btn' : ''} ${className}`.trim()} {...rest}>
      {children}
    </button>
  )
}

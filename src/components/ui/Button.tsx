import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  children: ReactNode
  fullWidth?: boolean
}

const variants: Record<Variant, string> = {
  primary: 'client-submit',
  secondary: 'ghost-button',
  ghost: 'ghost-action is-neutral',
  danger: 'ghost-action',
}

export default function Button({
  variant = 'primary',
  children,
  fullWidth,
  className = '',
  ...rest
}: Props) {
  return (
    <button type="button" className={`${variants[variant]} ${fullWidth ? 'w-full-btn' : ''} ${className}`.trim()} {...rest}>
      {children}
    </button>
  )
}

type Props = {
  name: string
  photoUrl?: string | null
  muted?: boolean
  size?: 'sm' | 'md' | 'lg'
}

const sizeClass = {
  sm: 'h-8 w-8 text-[11px]',
  md: 'h-10 w-10 text-[13px]',
  lg: 'h-12 w-12 text-sm',
} as const

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
}

export default function OperatorAvatar({ name, photoUrl, muted = false, size = 'md' }: Props) {
  const src = String(photoUrl || '').trim()
  return (
    <span
      className={`operator-avatar is-${size}${muted ? ' is-muted' : ''}${src ? ' has-photo' : ''} inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-avi-brand-soft font-extrabold text-avi-brand-strong ${sizeClass[size]} ${muted ? 'opacity-60' : ''}`}
      aria-hidden
    >
      {src ? <img src={src} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" /> : initials(name)}
    </span>
  )
}

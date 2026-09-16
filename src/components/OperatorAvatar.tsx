type Props = {
  name: string
  photoUrl?: string | null
  muted?: boolean
  size?: 'sm' | 'md' | 'lg'
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
}

export default function OperatorAvatar({ name, photoUrl, muted = false, size = 'md' }: Props) {
  const src = String(photoUrl || '').trim()
  return (
    <span className={`operator-avatar is-${size}${muted ? ' is-muted' : ''}${src ? ' has-photo' : ''}`} aria-hidden>
      {src ? <img src={src} alt="" referrerPolicy="no-referrer" /> : initials(name)}
    </span>
  )
}

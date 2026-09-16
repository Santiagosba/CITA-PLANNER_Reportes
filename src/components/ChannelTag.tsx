import WhatsAppMark from './WhatsAppMark'
import { channelLabel, inferPeticionTipo, type InteractionTipo } from '../lib/interactionLabels'

type Props = {
  tipo?: InteractionTipo | string | null
  tipopeticion?: string | null
}

export default function ChannelTag({ tipo, tipopeticion }: Props) {
  const channel = tipo || inferPeticionTipo(tipopeticion)
  if (channel === 'whatsapp') {
    return (
      <span className="badge tone-wa is-wa-tag inline-flex items-center gap-1">
        <WhatsAppMark size={14} />
        WhatsApp
      </span>
    )
  }
  return <span className={`badge ${channel === 'email' ? 'tone-muted' : 'tone-neutral'}`}>{channelLabel(channel)}</span>
}

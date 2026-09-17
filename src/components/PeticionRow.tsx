import { ChevronDown, ExternalLink, Phone, UserRound } from 'lucide-react'
import { memo, type ReactNode } from 'react'
import ActionButton, { type ActionStatus } from './ui/ActionButton'
import TicketPlate from './TicketPlate'
import { formatAgendaTime } from '../lib/agendaGrouping'
import { isDemoTicketId } from '../lib/demoTickets'
import { formatFecha, isPeticionPendiente, type PeticionPendiente } from '../lib/peticionesPendientes'
import { ticketClientLabel, ticketClientPhone } from '../lib/ticketClient'
import TicketClientBlock from './TicketClientBlock'

type Props = {
  peticion: PeticionPendiente
  expanded: boolean
  saveStatus: ActionStatus
  gestionObs: string
  gestionEmail: string
  onToggle: (id: string) => void
  onGestionObsChange: (v: string) => void
  onGestionEmailChange: (v: string) => void
  onMarkGestionado: (gestionado: boolean) => void
  onOpenLead?: (peticion: PeticionPendiente) => void
  revealIndex?: number
  ownerSlot?: ReactNode
  teamLabel?: string
}

function PeticionRow({
  peticion: p,
  expanded,
  saveStatus,
  gestionObs,
  gestionEmail,
  onToggle,
  onGestionObsChange,
  onGestionEmailChange,
  onMarkGestionado,
  onOpenLead,
  revealIndex = 0,
  ownerSlot,
  teamLabel,
}: Props) {
  const pendiente = isPeticionPendiente(p)
  const c = p.cita
  const cliente = ticketClientLabel(p)
  const phone = ticketClientPhone(p)
  const titulo = cliente
  const vehiculo = c ? [c.marca, c.modelo].filter(Boolean).join(' ') : ''
  const tel = phone.replace(/\s/g, '')
  const telHref = tel ? `tel:${tel}` : null

  // Datos secundarios: la fecha completa ya aparece en el encabezado del día.
  const facts: { label: string; value: ReactNode }[] = []
  facts.push({ label: 'Tipo', value: p.tipopeticion ?? 'Sin tipo' })
  if (teamLabel) facts.push({ label: 'Grupo', value: teamLabel })
  facts.push({ label: 'Recibida', value: formatAgendaTime(p.fechainicio) })
  if (c?.fecha) facts.push({ label: 'Cita', value: formatFecha(c.fecha) })

  const openInWindow = Boolean(onOpenLead)
  const showBody = expanded && !openInWindow
  const animateEntry = revealIndex < 16

  return (
    <li
      className={`prow glass glass-lite squircle${animateEntry ? ' triage-item-enter' : ''}${showBody ? ' is-expanded' : ''}${openInWindow ? ' is-windowed' : ''} min-w-0 overflow-visible`}
      style={animateEntry ? { animationDelay: `${revealIndex * 24}ms` } : undefined}
    >
      <div className="flex min-w-0 flex-col gap-3 overflow-visible p-3">
        <button
          type="button"
          className="group min-w-0 rounded-md p-2 text-left transition-colors hover:bg-avi-surface focus-visible:outline-none focus-visible:shadow-focus"
          onClick={() => {
            if (onOpenLead) {
              onOpenLead(p)
              return
            }
            onToggle(p.idpeticion)
          }}
          aria-expanded={openInWindow ? undefined : expanded}
          aria-controls={openInWindow ? undefined : `prow-body-${p.idpeticion}`}
        >
          <span className="flex min-w-0 items-start gap-3">
            <span
              className={`mt-2 h-3 w-3 shrink-0 rounded-pill ${
                pendiente
                  ? 'bg-avi-warning shadow-[0_0_0_4px_rgba(180,100,10,0.12)]'
                  : 'bg-avi-success shadow-[0_0_0_4px_rgba(29,138,78,0.12)]'
              }`}
              aria-hidden
            />
            <span className="flex min-w-0 flex-1 flex-col gap-3">
              <span className="grid min-w-0 gap-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start">
                <TicketPlate peticion={p} />
                <span className="min-w-0">
                  <span className="mb-2 flex flex-wrap items-center gap-1.5">
                    {isDemoTicketId(p.idpeticion) ? <span className="badge tone-info">Prueba</span> : null}
                    <span className={`badge ${p.gestionado ? 'tone-positive' : 'tone-warning'}`}>
                      {p.gestionado ? 'Hecha' : 'Por hacer'}
                    </span>
                    {!p.gestionado ? (
                      <span className={`badge ${pendiente ? 'tone-warning' : 'tone-neutral'}`}>
                        {pendiente ? 'Sin cita' : 'Con cita'}
                      </span>
                    ) : null}
                    {p.canalentrada ? (
                      <span className="badge tone-neutral">
                        {p.canalentrada === 'whatsapp' ? 'WhatsApp' : 'Llamada'}
                      </span>
                    ) : null}
                  </span>
                  <span className="block">
                    <TicketClientBlock peticion={p} size="md" />
                  </span>
                </span>
              </span>

              <span className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4">
                {facts.map((fact) => (
                  <span
                    key={fact.label}
                    className="flex min-h-[62px] min-w-0 flex-col justify-center gap-0.5 rounded-sm border border-avi-line bg-avi-surface px-3 py-2"
                  >
                    <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-avi-muted">
                      {fact.label}
                    </span>
                    <span className="line-clamp-2 text-sm font-semibold leading-tight text-avi-fog-strong">
                      {fact.value}
                    </span>
                  </span>
                ))}
              </span>
            </span>

            {!openInWindow ? (
              <span className="hidden shrink-0 items-center self-center text-avi-brand min-[560px]:inline-flex">
                <ChevronDown
                  size={20}
                  className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
                  aria-hidden
                />
              </span>
            ) : null}
          </span>
        </button>

        <div className="grid min-w-0 gap-2 border-t border-avi-line pt-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          {ownerSlot ? (
            <div
              className="flex min-h-tap min-w-0 items-center gap-2 rounded-md border border-avi-line bg-avi-surface px-3 py-2"
              onClick={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <UserRound size={18} className="shrink-0 text-avi-muted" aria-hidden />
              <div className="min-w-0 flex-1">{ownerSlot}</div>
            </div>
          ) : null}

          <div className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end">
            {openInWindow ? (
              <button
                type="button"
                className="ghost-button min-h-tap flex-1 whitespace-nowrap sm:flex-none"
                onClick={() => onOpenLead?.(p)}
              >
                <ExternalLink size={16} aria-hidden />
                Abrir ficha
              </button>
            ) : null}

            {telHref ? (
              <a
                href={telHref}
                className="ghost-button confirm-action min-h-tap flex-1 whitespace-nowrap sm:flex-none"
                aria-label={`Llamar a ${titulo}`}
                data-call-label={titulo}
                data-call-peticion={p.idpeticion}
              >
                <Phone size={16} aria-hidden />
                Llamar
              </a>
            ) : null}
          </div>
        </div>
      </div>

      {showBody ? (
        <div id={`prow-body-${p.idpeticion}`} className="prow-body">
          <dl className="prow-detail-grid">
            <Detail label="Cliente" value={cliente} />
            <Detail label="Teléfono" value={phone || '—'} />
            <Detail label="Tipo de consulta" value={p.tipopeticion} />
            <Detail label="Fecha de la consulta" value={formatFecha(p.fechainicio)} />
            <Detail label="Cita en calendario" value={formatFecha(p.cita?.fecha) || 'Todavía no'} />
            <Detail label="Matrícula" value={<TicketPlate peticion={p} compact={false} />} />
            {vehiculo ? <Detail label="Vehículo" value={vehiculo} /> : null}
            {c?.email ? <Detail label="Email" value={c.email} /> : null}
          </dl>

          <div className="prow-gestion">
            <label className="field-label" htmlFor={`obs-${p.idpeticion}`}>
              Notas de gestión <span className="prow-optional">(opcional)</span>
            </label>
            <input
              type="email"
              placeholder="Correo de contacto"
              value={gestionEmail}
              onChange={(e) => onGestionEmailChange(e.target.value)}
              className="field-input"
            />
            <textarea
              id={`obs-${p.idpeticion}`}
              rows={3}
              placeholder="Qué has hecho con esta consulta…"
              value={gestionObs}
              onChange={(e) => onGestionObsChange(e.target.value)}
              className="field-input field-textarea"
            />
            <div className="prow-actions">
              <button
                type="button"
                className="ghost-button"
                disabled={saveStatus === 'loading' || saveStatus === 'success'}
                onClick={() => onMarkGestionado(false)}
              >
                Guardar nota
              </button>
              <ActionButton
                variant="success"
                status={saveStatus}
                successLabel="Gestionado"
                onClick={() => onMarkGestionado(true)}
              >
                Ya está gestionado
              </ActionButton>
            </div>
          </div>
        </div>
      ) : null}
    </li>
  )
}

function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="prow-detail">
      <dt>{label}</dt>
      <dd>{value || '—'}</dd>
    </div>
  )
}

export default memo(PeticionRow)

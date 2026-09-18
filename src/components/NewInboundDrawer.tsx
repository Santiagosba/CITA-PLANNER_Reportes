import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  CheckCircle2,
  ClipboardList,
  Loader2,
  MapPin,
  MessageSquare,
  PhoneCall,
  Sparkles,
  X,
} from 'lucide-react'
import type { Workshop } from '../types'
import AppSelect from './AppSelect'
import VehiclePlate, { formatMatricula } from './ui/VehiclePlate'
import { BOT_CONFIG_EVENT, loadActiveBotProfile } from '../lib/botProfiles'
import {
  loadInboundFormOptions,
  type CreateInboundInput,
  type InboundChannel,
  type InboundFormOptions,
} from '../lib/inboundPeticion'

type Props = {
  workshop: Workshop
  onClose: () => void
  onSubmit: (payload: CreateInboundInput) => Promise<void>
}

const TEMPLATES = [
  {
    id: 'motor',
    label: 'Avería de motor',
    typeId: 4,
    matricula: '2948 MLK',
    modelo: 'Seat León 1.5 eTSI',
    cliente: 'Mariano Gil Benítez',
    caller: '+34 677 820 411',
    canal: 'whatsapp' as const,
    descripcion: 'Al arrancar en frío suena un chirrido metálico y se enciende brevemente la luz de batería.',
  },
  {
    id: 'carroceria',
    label: 'Golpe de carrocería',
    typeId: 8,
    matricula: '4920 KXR',
    modelo: 'Peugeot 3008 GT Line',
    cliente: 'Beatriz Morales Alarcón',
    caller: '+34 654 332 198',
    canal: 'voz' as const,
    descripcion: 'Golpe lateral derecho con daños en la aleta, la puerta delantera y el espejo retrovisor.',
  },
  {
    id: 'mantenimiento',
    label: 'Mantenimiento',
    typeId: 2,
    matricula: '1084 LTB',
    modelo: 'Volkswagen Golf VIII',
    cliente: 'Javier Castillo Rivas',
    caller: '+34 689 712 045',
    canal: 'whatsapp' as const,
    descripcion: 'Solicita el mantenimiento de los 60.000 km y revisar las pastillas y el líquido de frenos.',
  },
  {
    id: 'peritaje',
    label: 'Peritaje de luna',
    typeId: 8,
    matricula: '7732 JVF',
    modelo: 'Audi A4 Avant',
    cliente: 'Elena Garrido Montero',
    caller: '+34 601 229 883',
    canal: 'voz' as const,
    descripcion: 'Necesita peritaje de la luna delantera por un impacto con una fisura que no parece reparable.',
  },
]

const inputClass = 'field-input min-h-tap max-w-none'
const labelClass = 'flex min-w-0 flex-col gap-2 text-sm font-semibold text-avi-fog-strong'

export default function NewInboundDrawer({ workshop, onClose, onSubmit }: Props) {
  const [caller, setCaller] = useState('')
  const [cliente, setCliente] = useState('')
  const [matricula, setMatricula] = useState('')
  const [modelo, setModelo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [canal, setCanal] = useState<InboundChannel>('voz')
  const [centerId, setCenterId] = useState('')
  const [typeId, setTypeId] = useState('')
  const [options, setOptions] = useState<InboundFormOptions>({ centers: [], types: [] })
  const [loadingOptions, setLoadingOptions] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [profile, setProfile] = useState(loadActiveBotProfile)
  const [avatarOk, setAvatarOk] = useState(true)

  useEffect(() => {
    const sync = () => {
      setProfile(loadActiveBotProfile())
      setAvatarOk(true)
    }
    window.addEventListener(BOT_CONFIG_EVENT, sync)
    return () => window.removeEventListener(BOT_CONFIG_EVENT, sync)
  }, [])

  useEffect(() => {
    let active = true
    setLoadingOptions(true)
    void loadInboundFormOptions(workshop)
      .then((next) => {
        if (!active) return
        setOptions(next)
        setCenterId(next.centers[0]?.idtaller ?? '')
        const contact = next.types.find((item) => item.idtipopeticion === 21)
        setTypeId(String(contact?.idtipopeticion ?? next.types[0]?.idtipopeticion ?? ''))
        setError(null)
      })
      .catch((reason) => {
        if (!active) return
        setError(reason instanceof Error ? reason.message : 'No se pudieron cargar los datos del formulario.')
      })
      .finally(() => {
        if (active) setLoadingOptions(false)
      })
    return () => {
      active = false
    }
  }, [workshop])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, submitting])

  const normalizedPlate = useMemo(() => formatMatricula(matricula.trim()), [matricula])
  const selectedType = options.types.find((item) => String(item.idtipopeticion) === typeId)
  const canSubmit = Boolean(
    !loadingOptions &&
    !submitting &&
    centerId &&
    selectedType &&
    caller.replace(/\D/g, '').length >= 7 &&
    descripcion.trim(),
  )

  const applyTemplate = (id: string) => {
    const template = TEMPLATES.find((item) => item.id === id)
    if (!template) return
    setMatricula(template.matricula)
    setModelo(template.modelo)
    setCliente(template.cliente)
    setCaller(template.caller)
    setCanal(template.canal)
    const matchingType = options.types.find((item) => item.idtipopeticion === template.typeId)
    if (matchingType) setTypeId(String(matchingType.idtipopeticion))
    setDescripcion(template.descripcion)
    setError(null)
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!canSubmit || !selectedType) return
    setSubmitting(true)
    setError(null)
    try {
      await onSubmit({
        idtaller: centerId,
        idtipopeticion: selectedType.idtipopeticion,
        tipoPeticion: selectedType.tipopeticion,
        caller: caller.trim(),
        cliente: cliente.trim(),
        matricula: normalizedPlate,
        modelo: modelo.trim(),
        descripcion: descripcion.trim(),
        canal,
      })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo crear la tarea.')
      setSubmitting(false)
    }
  }

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-[2400] flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="inbound-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-[rgba(14,25,43,0.42)] backdrop-blur-sm"
        aria-label="Cerrar nueva entrada"
        onClick={submitting ? undefined : onClose}
      />

      <section className="glass squircle relative flex max-h-[96dvh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-avi-line bg-avi-surface-solid shadow-popover sm:max-h-[92dvh]">
        <header className="flex min-w-0 items-start gap-3 border-b border-avi-line px-4 py-4 sm:px-6">
          <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-avi-brand-soft text-lg font-bold text-avi-brand">
            {avatarOk ? (
              <img
                src={profile.photo}
                alt=""
                className="h-full w-full object-cover"
                onError={() => setAvatarOk(false)}
              />
            ) : (
              profile.name.charAt(0).toUpperCase()
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="inbound-title" className="m-0 text-xl font-bold tracking-[-0.025em] text-avi-fog-strong">
                Nueva tarea de entrada
              </h2>
              <span className="badge tone-info">{profile.name}</span>
            </div>
            <p className="mb-0 mt-1 text-sm text-avi-muted">
              Registra una llamada o un WhatsApp y envíalo directamente a Triage.
            </p>
          </div>
          <button
            type="button"
            className="ghost-button min-h-tap min-w-tap shrink-0 p-0"
            onClick={onClose}
            disabled={submitting}
            aria-label="Cerrar"
          >
            <X size={19} />
          </button>
        </header>

        <form className="custom-scrollbar-light min-h-0 overflow-y-auto" onSubmit={(event) => void handleSubmit(event)}>
          <div className="grid min-w-0 gap-5 p-4 sm:p-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(260px,0.65fr)]">
            <div className="flex min-w-0 flex-col gap-5">
              {error ? (
                <div className="rounded-md border border-avi-danger bg-avi-surface-solid px-4 py-3 text-sm font-semibold text-avi-danger" role="alert">
                  {error}
                </div>
              ) : null}

              <fieldset className="m-0 min-w-0 rounded-md border border-avi-line bg-avi-surface p-4">
                <legend className="float-none flex items-center gap-2 px-1 text-base font-bold text-avi-fog-strong">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-pill bg-avi-brand text-sm text-white">1</span>
                  <ClipboardList size={18} className="text-avi-brand" aria-hidden />
                  Qué ha entrado
                </legend>
                <div className="mt-2 grid min-w-0 gap-4 sm:grid-cols-2">
                  <div className={labelClass}>
                    Tipo de tarea
                    <AppSelect
                      variant="field"
                      required
                      value={typeId}
                      disabled={loadingOptions || submitting}
                      placeholder={loadingOptions ? 'Cargando tipos…' : 'Elige un tipo'}
                      options={[
                        { id: '', label: loadingOptions ? 'Cargando tipos…' : 'Elige un tipo' },
                        ...options.types.map((item) => ({
                          id: String(item.idtipopeticion),
                          label: item.tipopeticion,
                        })),
                      ]}
                      onChange={setTypeId}
                      className="max-w-none"
                    />
                  </div>

                  <div className={labelClass}>
                    Canal de entrada
                    <div className="grid grid-cols-2 gap-2" role="group" aria-label="Canal de entrada">
                      {([
                        ['voz', 'Llamada', PhoneCall],
                        ['whatsapp', 'WhatsApp', MessageSquare],
                      ] as const).map(([value, label, Icon]) => (
                        <button
                          key={value}
                          type="button"
                          className={`inline-flex min-h-tap items-center justify-center gap-2 rounded-md border px-3 text-sm font-bold transition ${
                            canal === value
                              ? 'border-avi-brand bg-avi-brand-soft text-avi-brand shadow-sm'
                              : 'border-avi-line bg-avi-surface-solid text-avi-muted hover:border-avi-brand hover:text-avi-brand'
                          }`}
                          onClick={() => setCanal(value)}
                          aria-pressed={canal === value}
                          disabled={submitting}
                        >
                          <Icon size={17} aria-hidden />
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className={`${labelClass} sm:col-span-2`}>
                    Qué necesita el cliente
                    <textarea
                      className={`${inputClass} field-textarea resize-y`}
                      rows={3}
                      maxLength={255}
                      value={descripcion}
                      onChange={(event) => setDescripcion(event.target.value)}
                      placeholder="Ejemplo: quiere cita para revisar un ruido al arrancar"
                      disabled={submitting}
                      required
                    />
                    <span className="self-end text-xs font-normal text-avi-muted">{descripcion.length}/255</span>
                  </label>
                </div>
              </fieldset>

              <fieldset className="m-0 min-w-0 rounded-md border border-avi-line bg-avi-surface p-4">
                <legend className="float-none flex items-center gap-2 px-1 text-base font-bold text-avi-fog-strong">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-pill bg-avi-brand text-sm text-white">2</span>
                  Datos del cliente
                </legend>
                <div className="mt-2 grid min-w-0 gap-4 sm:grid-cols-2">
                  <label className={labelClass}>
                    Teléfono
                    <input
                      className={inputClass}
                      value={caller}
                      onChange={(event) => setCaller(event.target.value)}
                      inputMode="tel"
                      maxLength={50}
                      placeholder="+34 600 000 000"
                      disabled={submitting}
                      required
                    />
                    {caller && caller.replace(/\D/g, '').length < 7 ? (
                      <span className="text-xs font-normal text-avi-danger">Revisa el teléfono.</span>
                    ) : null}
                  </label>
                  <label className={labelClass}>
                    Nombre <span className="font-normal text-avi-muted">(opcional)</span>
                    <input
                      className={inputClass}
                      value={cliente}
                      onChange={(event) => setCliente(event.target.value)}
                      maxLength={160}
                      placeholder="Nombre y apellidos"
                      disabled={submitting}
                    />
                  </label>
                  <label className={labelClass}>
                    Matrícula <span className="font-normal text-avi-muted">(opcional)</span>
                    <input
                      className={inputClass}
                      value={matricula}
                      onChange={(event) => setMatricula(event.target.value.toUpperCase())}
                      maxLength={20}
                      placeholder="1234 ABC"
                      disabled={submitting}
                    />
                  </label>
                  <label className={labelClass}>
                    Vehículo <span className="font-normal text-avi-muted">(opcional)</span>
                    <input
                      className={inputClass}
                      value={modelo}
                      onChange={(event) => setModelo(event.target.value)}
                      maxLength={160}
                      placeholder="Marca y modelo"
                      disabled={submitting}
                    />
                  </label>
                </div>
              </fieldset>

              <fieldset className="m-0 min-w-0 rounded-md border border-avi-line bg-avi-surface p-4">
                <legend className="float-none flex items-center gap-2 px-1 text-base font-bold text-avi-fog-strong">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-pill bg-avi-brand text-sm text-white">3</span>
                  <MapPin size={18} className="text-avi-brand" aria-hidden />
                  Dónde se atenderá
                </legend>
                <div className={`${labelClass} mt-2`}>
                  Centro
                  <AppSelect
                    variant="field"
                    required
                    value={centerId}
                    disabled={loadingOptions || submitting || options.centers.length === 1}
                    placeholder={loadingOptions ? 'Cargando centros…' : 'Elige un centro'}
                    options={[
                      { id: '', label: loadingOptions ? 'Cargando centros…' : 'Elige un centro' },
                      ...options.centers.map((center) => ({
                        id: String(center.idtaller),
                        label: center.nombre || workshop.name,
                      })),
                    ]}
                    onChange={setCenterId}
                    className="max-w-none"
                  />
                  <span className="text-xs font-normal text-avi-muted">Licencia: {workshop.name}</span>
                </div>
              </fieldset>
            </div>

            <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-0">
              <div className="rounded-md border border-avi-line bg-avi-surface p-4">
                <p className="m-0 text-sm font-bold text-avi-fog-strong">Vista previa</p>
                <div className="mt-4 flex min-h-[96px] items-center justify-center overflow-visible rounded-md border border-dashed border-avi-line bg-avi-surface-solid p-3">
                  {normalizedPlate ? (
                    <VehiclePlate value={normalizedPlate} compact />
                  ) : (
                    <span className="text-center text-sm font-semibold text-avi-muted">Sin matrícula</span>
                  )}
                </div>
                <dl className="mt-4 grid gap-3 text-sm">
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-avi-muted">Tipo</dt>
                    <dd className="m-0 mt-0.5 font-semibold text-avi-fog-strong">
                      {selectedType?.tipopeticion || 'Pendiente de elegir'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-avi-muted">Cliente</dt>
                    <dd className="m-0 mt-0.5 font-semibold text-avi-fog-strong">
                      {cliente.trim() || caller.trim() || 'Pendiente de indicar'}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="rounded-md border border-avi-brand bg-avi-brand-soft p-4 text-sm text-avi-fog-strong">
                <CheckCircle2 size={20} className="mb-2 text-avi-brand" aria-hidden />
                <p className="m-0 font-bold">Al registrarla</p>
                <p className="mb-0 mt-1 text-avi-muted">
                  Se guardará en el centro, aparecerá en Triage y se propondrá el asesor que le tocaría.
                </p>
              </div>

              <div className="rounded-md border border-avi-line bg-avi-surface p-4">
                <p className="m-0 text-sm font-bold text-avi-fog-strong">Rellenar un ejemplo</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {TEMPLATES.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      className="ghost-button min-h-[40px] px-3 text-xs"
                      onClick={() => applyTemplate(template.id)}
                      disabled={submitting}
                    >
                      {template.label}
                    </button>
                  ))}
                </div>
              </div>
            </aside>
          </div>

          <footer className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-avi-line bg-avi-surface-solid px-4 py-3 sm:flex-row sm:items-center sm:justify-end sm:px-6">
            <button type="button" className="ghost-button min-h-tap" onClick={onClose} disabled={submitting}>
              Cancelar
            </button>
            <button type="submit" className="client-submit min-h-tap sm:min-w-[240px]" disabled={!canSubmit}>
              {submitting ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <Sparkles size={18} aria-hidden />}
              {submitting ? 'Registrando…' : 'Registrar y abrir en Triage'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  )
}

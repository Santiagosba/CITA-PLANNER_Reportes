import { useEffect, useState } from 'react'
import { MessageSquare, PhoneCall, Sparkles, X } from 'lucide-react'
import VehiclePlate, { formatMatricula } from './ui/VehiclePlate'
import { LAURA_AVATAR_EVENT, loadLauraAvatar } from '../lib/lauraProfile'

type Canal = 'voz' | 'whatsapp'

type Props = {
  workshopName: string
  onClose: () => void
  onSubmit: (payload: {
    caller: string
    cliente: string
    matricula: string
    modelo: string
    descripcion: string
    canal: Canal
  }) => void
}

const TEMPLATES = [
  {
    id: 'motor',
    label: 'Avería Motor / Encendido',
    matricula: '2948 MLK',
    modelo: 'Seat León 1.5 eTSI DSG 150CV',
    cliente: 'Mariano Gil Benítez',
    caller: '+34 677 820 411',
    canal: 'whatsapp' as const,
    descripcion:
      'Al arrancar en frío por las mañanas suena un chirrido metálico en la zona de la correa y se enciende brevemente la luz de advertencia de batería.',
  },
  {
    id: 'carroceria',
    label: 'Golpe Carrocería / Seguro',
    matricula: '4920 KXR',
    modelo: 'Peugeot 3008 GT Line BlueHDi 130',
    cliente: 'Beatriz Morales Alarcón',
    caller: '+34 654 332 198',
    canal: 'voz' as const,
    descripcion:
      'Impacto lateral derecho en estacionamiento subterráneo con deformación de aleta, puerta delantera y espejo retrovisor.',
  },
  {
    id: 'mantenimiento',
    label: 'Mantenimiento Periódico',
    matricula: '1084 LTB',
    modelo: 'Volkswagen Golf VIII Life 2.0 TDI',
    cliente: 'Javier Castillo Rivas',
    caller: '+34 689 712 045',
    canal: 'whatsapp' as const,
    descripcion:
      'Mantenimiento oficial programado de los 60.000 km con inspección de pastillas de freno y cambio de líquido de frenos.',
  },
  {
    id: 'peritaje',
    label: 'Peritaje Luna / ADAS',
    matricula: '7732 JVF',
    modelo: 'Audi A4 Avant 40 TFSI S tronic',
    cliente: 'Elena Garrido Montero',
    caller: '+34 601 229 883',
    canal: 'voz' as const,
    descripcion:
      'Peritaje presencial de luna delantera con impacto de gravilla y fisura ramificada de 18 cm no reparable por resina.',
  },
]

export default function NewInboundDrawer({ workshopName, onClose, onSubmit }: Props) {
  const [caller, setCaller] = useState('')
  const [cliente, setCliente] = useState('')
  const [matricula, setMatricula] = useState('')
  const [modelo, setModelo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [canal, setCanal] = useState<Canal>('voz')
  const [avatar, setAvatar] = useState(loadLauraAvatar)
  const [avatarOk, setAvatarOk] = useState(true)

  useEffect(() => {
    const sync = () => {
      setAvatar(loadLauraAvatar())
      setAvatarOk(true)
    }
    window.addEventListener(LAURA_AVATAR_EVENT, sync)
    return () => window.removeEventListener(LAURA_AVATAR_EVENT, sync)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const applyTemplate = (id: string) => {
    const t = TEMPLATES.find((item) => item.id === id)
    if (!t) return
    setMatricula(t.matricula)
    setModelo(t.modelo)
    setCliente(t.cliente)
    setCaller(t.caller)
    setCanal(t.canal)
    setDescripcion(t.descripcion)
  }

  return (
    <div className="inbound-modal-root" role="dialog" aria-modal="true" aria-labelledby="inbound-title">
      <button type="button" className="inbound-modal-backdrop" aria-label="Cerrar" onClick={onClose} />
      <div className="inbound-modal">
        <header className="inbound-modal-header">
          <div className="inbound-modal-title-row">
            <span className="inbound-modal-avatar" aria-hidden>
              {avatarOk ? (
                <img
                  src={avatar}
                  alt=""
                  onError={() => setAvatarOk(false)}
                />
              ) : (
                <span className="inbound-modal-avatar-fallback">L</span>
              )}
            </span>
            <div className="min-w-0">
              <div className="inbound-modal-heading">
                <h2 id="inbound-title">Simulador de Inbound / Nueva Tarea</h2>
                <span className="inbound-laura-badge">Laura</span>
              </div>
              <p className="section-subtitle">
                Simula una llamada entrante o mensaje entrante con previsualización en vivo de la placa europea.
              </p>
            </div>
          </div>
          <button type="button" className="ghost-button lead-icon-btn" onClick={onClose} title="Cerrar">
            <X size={18} />
          </button>
        </header>

        <form
          className="inbound-modal-body custom-scrollbar-light"
          onSubmit={(e) => {
            e.preventDefault()
            onSubmit({
              caller: caller.trim(),
              cliente: cliente.trim(),
              matricula: formatMatricula(matricula.trim()),
              modelo: modelo.trim(),
              descripcion: descripcion.trim(),
              canal,
            })
          }}
        >
          <section className="inbound-plate-preview">
            <div>
              <p className="inbound-plate-preview-title">Previsualización reglamentaria en tiempo real</p>
              <p className="section-subtitle">
                Banda oficial azul de la UE con 12 estrellas doradas y formato español (4 cifras + 3 letras)
              </p>
            </div>
            {formatMatricula(matricula) ? (
              <VehiclePlate value={matricula} className="inbound-plate-live" />
            ) : (
              <div className="inbound-plate-example">
                <VehiclePlate value="2948 MLK" className="inbound-plate-live" />
                <span className="inbound-plate-example-hint">Ejemplo</span>
              </div>
            )}
          </section>

          <div className="inbound-templates">
            <p className="field-label mb-0">Casos típicos de concesionario (cargar plantilla rápida):</p>
            <div className="inbound-templates-row">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="inbound-template-chip"
                  onClick={() => applyTemplate(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="inbound-form-grid">
            <label className="field-label">
              Matrícula del vehículo (teclea para previsualizar)
              <input
                className="field-input"
                value={matricula}
                onChange={(e) => setMatricula(e.target.value.toUpperCase())}
                placeholder="1234 ABC"
                required
              />
            </label>
            <label className="field-label">
              Modelo y motorización
              <input
                className="field-input"
                value={modelo}
                onChange={(e) => setModelo(e.target.value)}
                placeholder="Marca modelo motor"
              />
            </label>
            <label className="field-label">
              Nombre y apellidos del titular
              <input
                className="field-input"
                value={cliente}
                onChange={(e) => setCliente(e.target.value)}
                placeholder="Nombre y apellidos"
              />
            </label>
            <label className="field-label">
              Teléfono de contacto
              <input
                className="field-input"
                value={caller}
                onChange={(e) => setCaller(e.target.value)}
                placeholder="+34 600 000 000"
                required
              />
            </label>
            <label className="field-label">
              Sede concesionario / taller
              <select className="field-select" value={workshopName} disabled>
                <option value={workshopName}>{workshopName}</option>
              </select>
            </label>
            <div className="field-label">
              Canal de entrada
              <div className="inbound-canal-toggle" role="group" aria-label="Canal de entrada">
                <button
                  type="button"
                  className={`inbound-canal-btn ${canal === 'voz' ? 'is-active' : ''}`}
                  onClick={() => setCanal('voz')}
                >
                  <PhoneCall size={14} />
                  Voz Laura
                </button>
                <button
                  type="button"
                  className={`inbound-canal-btn is-wa ${canal === 'whatsapp' ? 'is-active' : ''}`}
                  onClick={() => setCanal('whatsapp')}
                >
                  <MessageSquare size={14} />
                  WhatsApp
                </button>
              </div>
            </div>
          </div>

          <label className="field-label">
            Motivo expresado por el cliente (transcripción de voz Laura)
            <textarea
              className="field-input field-textarea"
              rows={3}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Resumen de la llamada o mensaje…"
              required
            />
          </label>

          <div className="inbound-modal-footer">
            <button type="button" className="ghost-button" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="client-submit inbound-submit">
              <Sparkles size={15} />
              Registrar e iniciar triage
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

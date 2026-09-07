import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BadgeCheck, Camera, Check, PhoneCall, RotateCcw } from 'lucide-react'
import Card from '../components/ui/Card'
import { resizeImageFile } from '../lib/lauraProfile'
import {
  BOT_CONFIG_EVENT,
  DEFAULT_BOT_PROFILES,
  type ResolvedBotProfile,
  loadActiveBotId,
  loadBotProfiles,
  resetAllBots,
  resetBotProfile,
  setActiveBot,
  updateBotProfile,
} from '../lib/botProfiles'

function Portrait({ src, name, className }: { src: string; name: string; className?: string }) {
  const [ok, setOk] = useState(true)
  useEffect(() => setOk(true), [src])
  if (ok) {
    return <img className={className} src={src} alt="" onError={() => setOk(false)} />
  }
  return (
    <span className={`bot-id-initial ${className ?? ''}`.trim()} aria-hidden>
      {name.charAt(0).toUpperCase()}
    </span>
  )
}

export default function BotIdentityView() {
  const [profiles, setProfiles] = useState<ResolvedBotProfile[]>(loadBotProfiles)
  const [activeId, setActiveId] = useState<string>(loadActiveBotId)
  const [selectedId, setSelectedId] = useState<string>(loadActiveBotId)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const sync = useCallback(() => {
    setProfiles(loadBotProfiles())
    setActiveId(loadActiveBotId())
  }, [])

  useEffect(() => {
    window.addEventListener(BOT_CONFIG_EVENT, sync)
    return () => window.removeEventListener(BOT_CONFIG_EVENT, sync)
  }, [sync])

  const active = useMemo(
    () => profiles.find((p) => p.id === activeId) ?? profiles[0],
    [profiles, activeId],
  )
  const selected = useMemo(
    () => profiles.find((p) => p.id === selectedId) ?? active,
    [profiles, selectedId, active],
  )

  const operadoras = profiles.filter((p) => p.gender === 'operadora').length
  const operadores = profiles.filter((p) => p.gender === 'operador').length

  const pick = (id: string) => {
    setActiveBot(id)
    setSelectedId(id)
    setActiveId(id)
  }

  const onField = (field: 'name' | 'specialty' | 'description' | 'greeting', value: string) => {
    updateBotProfile(selectedId, { [field]: value })
  }

  const onUpload = async (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Elige una imagen (JPG, PNG o WebP).')
      return
    }
    try {
      const dataUrl = await resizeImageFile(file)
      updateBotProfile(selectedId, { photo: dataUrl })
      setError(null)
    } catch {
      setError('No se pudo guardar la foto.')
    }
  }

  if (!selected || !active) return null

  return (
    <div className="dashboard-page bot-id-page">
      <header className="bot-id-hero glass glass-lite">
        <div className="bot-id-hero-copy">
          <p className="section-eyebrow">Configuración del Bot IA</p>
          <h2 className="ops-card-title">Perfil activo</h2>
        </div>
        <div className="bot-id-active">
          <span className="bot-id-active-photo">
            <Portrait src={active.photo} name={active.name} />
          </span>
          <div className="bot-id-active-copy">
            <p className="section-eyebrow">Asistente de IA {active.name}</p>
            <strong>{active.name}</strong>
            <span>{active.specialty}</span>
          </div>
          <button type="button" className="ghost-button" onClick={() => resetAllBots()}>
            <RotateCcw size={16} aria-hidden />
            Restaurar todos
          </button>
        </div>
      </header>

      <Card className="laura-panel" padding="md">
        <div className="bot-id-list-head">
          <div>
            <p className="section-eyebrow">Perfiles disponibles</p>
            <h2 className="ops-card-title">Elige quién atiende las llamadas</h2>
          </div>
          <span className="badge tone-neutral">
            {operadoras} operadoras · {operadores} operadores
          </span>
        </div>

        <ul className="bot-id-grid">
          {profiles.map((profile) => {
            const isActive = profile.id === activeId
            const isSelected = profile.id === selectedId
            return (
              <li key={profile.id}>
                <button
                  type="button"
                  className={`bot-id-card${isActive ? ' is-active' : ''}${isSelected ? ' is-selected' : ''}`}
                  onClick={() => pick(profile.id)}
                  aria-pressed={isActive}
                >
                  <span className="bot-id-avatar">
                    <Portrait src={profile.photo} name={profile.name} />
                  </span>
                  <div className="bot-id-card-copy">
                    <p className="section-eyebrow">Asistente de IA {profile.name}</p>
                    <strong>
                      {profile.name}
                      {isActive ? (
                        <em className="badge tone-positive bot-id-chip">
                          <BadgeCheck size={12} aria-hidden />
                          Activo
                        </em>
                      ) : null}
                    </strong>
                    <span>{profile.specialty}</span>
                    <small>{profile.description}</small>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      </Card>

      <Card className="laura-panel bot-id-editor" padding="md">
        <div className="bot-id-editor-head">
          <span className="bot-id-editor-photo">
            <Portrait src={selected.photo} name={selected.name} />
          </span>
          <div>
            <p className="section-eyebrow">Asistente de IA {selected.name}</p>
            <h2 className="ops-card-title">Personalizar perfil</h2>
            <p className="section-subtitle">Asistente de IA · voz del concesionario</p>
          </div>
        </div>

        <div className="bot-id-form">
          <div className="bot-id-field">
            <label className="field-label" htmlFor="bot-name">
              Nombre visible
            </label>
            <input
              id="bot-name"
              className="field-input"
              value={selected.name}
              onChange={(e) => onField('name', e.target.value)}
              placeholder="Nombre del asistente"
            />
          </div>

          <div className="bot-id-field">
            <label className="field-label" htmlFor="bot-specialty">
              Especialidad
            </label>
            <input
              id="bot-specialty"
              className="field-input"
              value={selected.specialty}
              onChange={(e) => onField('specialty', e.target.value)}
              placeholder="Ej: Recepción y citas"
            />
          </div>

          <div className="bot-id-field bot-id-field-wide">
            <label className="field-label" htmlFor="bot-desc">
              Descripción
            </label>
            <textarea
              id="bot-desc"
              className="field-input field-textarea"
              rows={3}
              value={selected.description}
              onChange={(e) => onField('description', e.target.value)}
              placeholder="Describe la función del asistente"
            />
          </div>

          <div className="bot-id-field bot-id-field-wide">
            <label className="field-label" htmlFor="bot-greeting">
              Saludo de llamada
            </label>
            <textarea
              id="bot-greeting"
              className="field-input field-textarea"
              rows={2}
              value={selected.greeting}
              onChange={(e) => onField('greeting', e.target.value)}
              placeholder="Frase con la que abre la llamada"
            />
          </div>

          <div className="bot-id-field bot-id-field-wide">
            <label className="field-label">Fotografía del operador</label>
            <div className="bot-id-photo-row">
              <button type="button" className="ghost-button" onClick={() => fileRef.current?.click()}>
                <Camera size={16} aria-hidden />
                Subir foto propia
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                hidden
                onChange={(e) => {
                  void onUpload(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
              <ul className="bot-id-portraits">
                {DEFAULT_BOT_PROFILES.map((p) => {
                  const chosen = selected.photo === p.portrait
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        className={`bot-id-portrait${chosen ? ' is-chosen' : ''}`}
                        onClick={() => updateBotProfile(selectedId, { photo: p.portrait })}
                        title={p.name}
                        aria-label={`Usar retrato de ${p.name}`}
                      >
                        <Portrait src={p.portrait} name={p.name} />
                        {chosen ? (
                          <span className="bot-id-portrait-check" aria-hidden>
                            <Check size={12} />
                          </span>
                        ) : null}
                      </button>
                      <span>{p.name}</span>
                    </li>
                  )
                })}
              </ul>
            </div>
            <p className="section-subtitle bot-id-hint">
              <PhoneCall size={13} aria-hidden />
              Puede usar uno de los seis retratos o una fotografía propia del concesionario.
            </p>
            {error ? <p className="laura-profile-error">{error}</p> : null}
          </div>
        </div>

        <div className="bot-id-editor-actions">
          <button
            type="button"
            className="ghost-button"
            onClick={() => resetBotProfile(selectedId)}
            disabled={!selected.customized}
          >
            <RotateCcw size={16} aria-hidden />
            Restaurar este perfil
          </button>
        </div>
      </Card>
    </div>
  )
}

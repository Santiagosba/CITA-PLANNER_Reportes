import { DEFAULT_LAURA_AVATAR } from './lauraProfile'

export type BotGender = 'operadora' | 'operador'

export type BotProfile = {
  id: string
  name: string
  gender: BotGender
  specialty: string
  description: string
  greeting: string
  /** Retrato por defecto del catálogo (URL remota). */
  portrait: string
}

/** Campos editables por el usuario para cada perfil. */
export type BotProfileOverride = Partial<Pick<BotProfile, 'name' | 'specialty' | 'description' | 'greeting'>> & {
  /** Foto propia del concesionario (data URL) o URL de otro retrato del catálogo. */
  photo?: string
}

export const BOT_CONFIG_KEY = 'avi_bot_config_v1'
export const BOT_CONFIG_EVENT = 'avi-bot-config-changed'

const portraitFor = (id: string) =>
  id === 'laura' ? DEFAULT_LAURA_AVATAR : `https://app.avibot.pro/assets/avi-bot/bots/${id}/${id}-avatar.png`

export const DEFAULT_BOT_PROFILES: BotProfile[] = [
  {
    id: 'laura',
    name: 'Laura',
    gender: 'operadora',
    specialty: 'Recepción y citas',
    description:
      'Asistente de voz para recepción del taller. Atiende llamadas, identifica el vehículo y agenda citas oficiales.',
    greeting: 'Buenos días, le atiende Laura. ¿En qué podemos ayudarle hoy con su vehículo?',
    portrait: portraitFor('laura'),
  },
  {
    id: 'marta',
    name: 'Marta',
    gender: 'operadora',
    specialty: 'Atención al cliente',
    description:
      'Asistente de voz para consultas, seguimiento de expedientes y resolución de incidencias con trato cercano.',
    greeting: 'Hola, soy Marta, del servicio de atención al cliente. ¿En qué puedo ayudarle?',
    portrait: portraitFor('marta'),
  },
  {
    id: 'elena',
    name: 'Elena',
    gender: 'operadora',
    specialty: 'Posventa y taller',
    description:
      'Asistente de voz especializada en posventa: revisiones, garantías, recambios y coordinación con boxes.',
    greeting: 'Buenos días, le atiende Elena, de posventa. ¿Qué necesita para su vehículo?',
    portrait: portraitFor('elena'),
  },
  {
    id: 'alex',
    name: 'Alex',
    gender: 'operador',
    specialty: 'Seguimiento comercial',
    description:
      'Asistente de voz para cualificar oportunidades de VN y VO y derivar al asesor comercial cuando corresponde.',
    greeting: 'Hola, soy Alex, del departamento comercial. ¿En qué puedo ayudarle hoy?',
    portrait: portraitFor('alex'),
  },
  {
    id: 'daniel',
    name: 'Daniel',
    gender: 'operador',
    specialty: 'Soporte y derivación',
    description:
      'Asistente de voz para casos complejos: siniestros, peritajes y escalado inmediato al asesor humano.',
    greeting: 'Buenos días, le atiende Daniel. Cuénteme su caso y le ayudo a resolverlo.',
    portrait: portraitFor('daniel'),
  },
  {
    id: 'pablo',
    name: 'Pablo',
    gender: 'operador',
    specialty: 'Coordinación de llamadas',
    description:
      'Asistente de voz para centralita: clasifica el motivo, toma datos y reparte cada llamada al departamento.',
    greeting: 'Hola, soy Pablo, de centralita. ¿Con qué departamento desea hablar?',
    portrait: portraitFor('pablo'),
  },
]

export const DEFAULT_ACTIVE_BOT_ID = 'laura'

type BotConfig = {
  activeId: string
  overrides: Record<string, BotProfileOverride>
}

function readConfig(): BotConfig {
  try {
    const raw = localStorage.getItem(BOT_CONFIG_KEY)
    if (!raw) return { activeId: DEFAULT_ACTIVE_BOT_ID, overrides: {} }
    const parsed = JSON.parse(raw) as Partial<BotConfig>
    return {
      activeId: parsed.activeId || DEFAULT_ACTIVE_BOT_ID,
      overrides: parsed.overrides && typeof parsed.overrides === 'object' ? parsed.overrides : {},
    }
  } catch {
    return { activeId: DEFAULT_ACTIVE_BOT_ID, overrides: {} }
  }
}

function writeConfig(config: BotConfig) {
  try {
    localStorage.setItem(BOT_CONFIG_KEY, JSON.stringify(config))
  } catch {
    /* quota / private mode */
  }
  window.dispatchEvent(new Event(BOT_CONFIG_EVENT))
}

export type ResolvedBotProfile = BotProfile & {
  /** Foto efectiva a mostrar (override o retrato por defecto). */
  photo: string
  /** true si el usuario ha modificado algún campo de este perfil. */
  customized: boolean
}

function resolveOne(base: BotProfile, override?: BotProfileOverride): ResolvedBotProfile {
  const customized = Boolean(override && Object.keys(override).length > 0)
  return {
    ...base,
    name: override?.name ?? base.name,
    specialty: override?.specialty ?? base.specialty,
    description: override?.description ?? base.description,
    greeting: override?.greeting ?? base.greeting,
    photo: override?.photo || base.portrait,
    customized,
  }
}

export function loadBotProfiles(): ResolvedBotProfile[] {
  const { overrides } = readConfig()
  return DEFAULT_BOT_PROFILES.map((base) => resolveOne(base, overrides[base.id]))
}

export function loadActiveBotId(): string {
  return readConfig().activeId
}

export function loadActiveBotProfile(): ResolvedBotProfile {
  const { activeId, overrides } = readConfig()
  const base = DEFAULT_BOT_PROFILES.find((p) => p.id === activeId) || DEFAULT_BOT_PROFILES[0]
  return resolveOne(base, overrides[base.id])
}

export function setActiveBot(id: string) {
  const config = readConfig()
  writeConfig({ ...config, activeId: id })
}

export function updateBotProfile(id: string, patch: BotProfileOverride) {
  const config = readConfig()
  const next: BotProfileOverride = { ...(config.overrides[id] || {}), ...patch }
  // Elimina claves vacías/undefined para no marcar como personalizado sin motivo.
  ;(Object.keys(next) as (keyof BotProfileOverride)[]).forEach((key) => {
    if (next[key] === undefined || next[key] === '') delete next[key]
  })
  writeConfig({ ...config, overrides: { ...config.overrides, [id]: next } })
}

export function resetBotProfile(id: string) {
  const config = readConfig()
  const overrides = { ...config.overrides }
  delete overrides[id]
  writeConfig({ ...config, overrides })
}

export function resetAllBots() {
  writeConfig({ activeId: DEFAULT_ACTIVE_BOT_ID, overrides: {} })
}

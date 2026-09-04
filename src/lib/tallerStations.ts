/** Puestos / ramas del taller compartidos entre triage y calendario. */

export type StationId = 'elev1' | 'elev2' | 'elev3' | 'paint' | 'peritaje'

export type Station = {
  id: StationId
  label: string
  responsibles: string
  keywords: string[]
}

export const TALLER_STATIONS: Station[] = [
  {
    id: 'elev1',
    label: 'Elevador 1 - Mecánica Rápida',
    responsibles: 'Resp: Manuel Rivas (Oficial 1ª)',
    keywords: ['mec', 'rápid', 'rapid', 'manten', 'aceite', 'revisi', 'filtro', 'itv'],
  },
  {
    id: 'elev2',
    label: 'Elevador 2 - Diagnosis / Motor',
    responsibles: 'Resp: Alberto Cuesta (Master Tech)',
    keywords: ['diagn', 'motor', 'aver', 'ruido', 'inyec', 'turbo'],
  },
  {
    id: 'elev3',
    label: 'Elevador 3 - Híbridos / EV',
    responsibles: 'Resp: Sonia Gil (Certificada Alta Tensión)',
    keywords: ['híbrid', 'hibrid', 'ev', 'eléct', 'elect', 'bater', 'alta tensión'],
  },
  {
    id: 'paint',
    label: 'Cabina Pintura 1 & Secado',
    responsibles: 'Resp: Pedro Navas (Carrocero Pintor)',
    keywords: ['pint', 'chapa', 'carrocer', 'luna', 'golpe', 'cabina'],
  },
  {
    id: 'peritaje',
    label: 'Puesto Peritaje Seguros / ADAS',
    responsibles: 'Resp: Raúl Sanz (Perito Técnico)',
    keywords: ['perit', 'seguro', 'siniestro', 'adas', 'mapfre', 'mutua', 'allianz'],
  },
]

export const BRANCH_OPTIONS = [
  { id: 'all', label: 'Todas las ramas' },
  ...TALLER_STATIONS.map((station) => ({ id: station.id, label: station.label })),
]

export const CHANNEL_OPTIONS = [
  { id: 'voz-wa', label: 'Voz & WhatsApp' },
  { id: 'voz', label: 'Solo voz' },
  { id: 'wa', label: 'Solo WhatsApp' },
]

export function assignStationFromText(text: string, seed = ''): StationId {
  const normalized = text.toLowerCase()
  const hit = TALLER_STATIONS.find((station) =>
    station.keywords.some((keyword) => normalized.includes(keyword)),
  )
  if (hit) return hit.id
  const hash = [...seed].reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
  return TALLER_STATIONS[hash % TALLER_STATIONS.length].id
}

export function matchesChannelText(text: string, channel: string): boolean {
  const normalized = text.toLowerCase()
  if (channel === 'voz') {
    return /voz|llamad|tel[eé]fono|call/.test(normalized) || !/whats?app|wa\b/.test(normalized)
  }
  if (channel === 'wa') return /whats?app|wa\b|mensaje/.test(normalized)
  return true
}

export function isSlaCritico(isoDate: string | null | undefined, now = Date.now()): boolean {
  if (!isoDate) return false
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) return false
  const diffMin = Math.abs(now - date.getTime()) / 60000
  return diffMin <= 15
}

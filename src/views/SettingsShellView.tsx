import React, { useEffect, useMemo, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Building,
  CheckCircle2,
  Clock,
  Edit2,
  Globe,
  Image,
  Mail,
  MapPin,
  Palette,
  Phone,
  PhoneCall,
  Plus,
  Save,
  Settings,
  Tag,
  Trash2,
  Upload,
  UserPlus,
  Users,
} from 'lucide-react'
import type { Workshop } from '../types'
import { ACCENT_PALETTES } from '../lib/crmAccentTheme'

export type SettingsShellTab = 'general' | 'centers' | 'team' | 'branding'

type TabDef = {
  id: SettingsShellTab
  label: string
  icon: LucideIcon
}

const TABS: TabDef[] = [
  { id: 'general', label: 'General', icon: Building },
  { id: 'centers', label: 'Centros', icon: MapPin },
  { id: 'team', label: 'Equipo', icon: Users },
  { id: 'branding', label: 'Marca', icon: Palette },
]

type Props = {
  workshop: Workshop
  isDarkMode: boolean
  showBrandingTab?: boolean
}

const MOCK_CENTERS = [
  {
    id: '1',
    name: 'Centro principal',
    address: 'Polígono ejemplo, nave 12',
    city: 'Madrid',
    schedule: 'L–V 8:00–19:30',
    phone: '+34 900 000 000',
    brand: 'Ejemplo Motors',
    repairTypes: ['Mecánica', 'Chapa'],
  },
  {
    id: '2',
    name: 'Express',
    address: 'Av. rápida 45',
    city: 'Madrid',
    schedule: 'L–S 9:00–14:00',
    phone: '+34 912 345 678',
    brand: 'Ejemplo Motors',
    repairTypes: ['Ruedas'],
  },
]

const MOCK_TEAM = [
  {
    display_name: 'Ana Ruiz',
    email: 'ana.ruiz@taller.demo',
    taller_roles: 'Asesora de triage',
    is_banned: false,
    last_sign_in: 'Hoy',
  },
  {
    display_name: 'Luis Mora',
    email: 'luis.mora@taller.demo',
    taller_roles: 'Asesor comercial',
    is_banned: false,
    last_sign_in: 'Hoy',
  },
  {
    display_name: 'Carmen Vidal',
    email: 'carmen.vidal@taller.demo',
    taller_roles: 'Asesora de peritaje',
    is_banned: false,
    last_sign_in: 'Hoy',
  },
]

function SaveButton({ label, onClick }: { label: string; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className="client-submit">
      <Save size={18} />
      {label}
    </button>
  )
}

function inputCls(disabled?: boolean): string {
  return `field-input${disabled ? ' opacity-60 cursor-not-allowed' : ''}`
}

function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`glass glass-lite card-pad-md ${className}`.trim()}>{children}</div>
}

export default function SettingsShellView({ workshop, isDarkMode: _isDarkMode, showBrandingTab = false }: Props) {
  const [activeTab, setActiveTab] = useState<SettingsShellTab>('general')

  const visibleTabs = TABS.filter((t) => t.id !== 'branding' || showBrandingTab)

  const isDemo = workshop.source === 'demo'

  const [generalMulti, setGeneralMulti] = useState(false)
  const [dealerBrands, setDealerBrands] = useState('')

  const paletteSwatches = useMemo(() => {
    const teal = ACCENT_PALETTES.teal?.palette?.[500]
    return [
      { id: 'teal', label: 'Teal estándar', color: teal || '#14b8a6' },
      { id: 'indigo', label: 'Índigo', color: '#6366f1' },
      { id: 'blue', label: 'Azul', color: '#3b82f6' },
      { id: 'rose', label: 'Rosa', color: '#f43f5e' },
      { id: 'amber', label: 'Ámbar', color: '#f59e0b' },
    ]
  }, [])

  useEffect(() => {
    if (activeTab === 'branding' && !showBrandingTab) setActiveTab('general')
  }, [activeTab, showBrandingTab])

  const renderTabPanels = (): React.ReactNode => {
    switch (activeTab) {
      case 'general':
        return (
          <div className="panel-stack animate-fade-in">
            {isDemo && (
              <div className="alert alert-warning">
                Modo demo: la ficha es solo maqueta y <strong>no guarda</strong> en AVI.
              </div>
            )}

            <Panel>
              <h3 className="section-title mb-6 flex items-center gap-2" style={{ fontSize: 'var(--font-lg)' }}>
                <Building size={20} style={{ color: 'var(--color-brand)' }} /> Datos del Concesionario
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="field-label">Razón Social</label>
                  <input type="text" defaultValue={workshop.name} className={inputCls()} />
                </div>
                <div className="space-y-2">
                  <label className="field-label">CIF / NIF</label>
                  <input type="text" placeholder="B00000000" className={inputCls()} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="field-label">Dirección Fiscal</label>
                  <input type="text" placeholder="Calle ejemplo 1" className={inputCls()} />
                </div>
                <div className="space-y-2">
                  <label className="field-label">Código postal</label>
                  <input type="text" placeholder="28001" className={inputCls()} />
                </div>
                <div className="space-y-2">
                  <label className="field-label">Código Taller Oficial</label>
                  <input
                    type="text"
                    placeholder="codigoexterno en AVI"
                    className={inputCls()}
                  />
                </div>
                <div className="space-y-2">
                  <label className="field-label">Población</label>
                  <input type="text" placeholder="Madrid" className={inputCls()} />
                </div>
                <div className="space-y-2">
                  <label className="field-label">Provincia</label>
                  <input type="text" placeholder="Madrid" className={inputCls()} />
                </div>

                <div className="col-span-1 md:col-span-2">
                  <div className="mb-2 flex items-center justify-between">
                    <label className="field-label">
                      Marcas Oficiales / Representadas
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 select-none">
                      <span className="sr-only">Multimarca</span>
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={generalMulti}
                        onChange={(e) => setGeneralMulti(e.target.checked)}
                      />
                      <div
                        className={`relative h-6 w-10 rounded-full transition-colors ${generalMulti ? 'bg-[var(--color-brand)]' : 'bg-[rgba(15,17,21,0.12)]'}`}
                      >
                        <span
                          className={`absolute top-1 left-1 block h-4 w-4 rounded-full bg-white transition-transform ${generalMulti ? 'translate-x-4' : ''}`}
                        />
                      </div>
                      <span className="text-xs font-medium text-[var(--muted)]">Concesionario Multimarca</span>
                    </label>
                  </div>
                  <div className="relative">
                    <Tag
                      size={16}
                      className={`absolute top-1/2 left-3 -translate-y-1/2 ${generalMulti ? 'text-[var(--muted)] opacity-50' : 'text-[var(--muted)]'}`}
                    />
                    <input
                      type="text"
                      readOnly={generalMulti}
                      placeholder="Ej: Peugeot, Citroën, Opel"
                      className={`field-input pl-10 ${generalMulti ? 'cursor-not-allowed italic opacity-60' : ''}`}
                      value={generalMulti ? 'Todas las marcas (Multimarca)' : dealerBrands}
                      onChange={(e) => setDealerBrands(e.target.value)}
                    />
                  </div>
                  <p className="mt-1.5 ml-1 text-[10px] text-[var(--muted)]">
                    Se guarda en el campo <span className="font-medium">grupo</span> de AVI en la app real.
                  </p>
                </div>
              </div>
            </Panel>

            <Panel>
              <h3 className="section-title mb-6 flex items-center gap-2" style={{ fontSize: 'var(--font-lg)' }}>
                <Phone size={20} style={{ color: 'var(--color-brand)' }} /> Información de Contacto
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="field-label">Email General</label>
                  <div className="relative">
                    <Mail size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-[var(--muted)]" />
                    <input type="email" className={`${inputCls()} pl-10`} placeholder="contacto@ejemplo.es" />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="field-label">Teléfono Principal</label>
                  <div className="relative">
                    <Phone size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-[var(--muted)]" />
                    <input type="tel" className={`${inputCls()} pl-10`} placeholder="+34 …" />
                  </div>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="field-label">Sitio Web</label>
                  <div className="relative">
                    <Globe size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-[var(--muted)]" />
                    <input type="url" placeholder="https://" className={`${inputCls()} pl-10`} />
                  </div>
                </div>
              </div>
            </Panel>

            <div className="flex justify-end">
              <SaveButton label="Guardar cambios" />
            </div>
          </div>
        )

      case 'centers':
        return (
          <div className="panel-stack animate-fade-in">
            <Panel>
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="section-title flex items-center gap-2" style={{ fontSize: 'var(--font-lg)' }}>
                    <MapPin size={20} style={{ color: 'var(--color-brand)' }} /> Gestión de Centros
                  </h3>
                  <p className="section-subtitle mt-1">
                    Centros del taller en AVI (tabla centros). En plantilla solo se muestra el diseño.
                  </p>
                </div>
                <button type="button" className="confirm-action">
                  <Plus size={16} /> Añadir Centro
                </button>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {MOCK_CENTERS.map((center) => (
                  <div
                    key={center.id}
                    className="glass-inline glass-lite group relative flex h-full flex-col rounded-[var(--radius-md)] p-4 transition-colors hover:border-[rgba(11,99,214,0.25)]"
                  >
                    <div className="absolute top-4 right-4 flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                      <span className="ghost-action is-neutral p-1.5">
                        <Edit2 size={14} />
                      </span>
                      <span className="ghost-action p-1.5">
                        <Trash2 size={14} />
                      </span>
                    </div>

                    <h4 className="list-row-title mb-1 pr-12">{center.name}</h4>
                    <p className="list-row-meta mb-3 flex items-center gap-1">
                      <MapPin size={12} /> {center.address}, {center.city}
                    </p>

                    <div className="mb-4 flex-1 space-y-2">
                      <div className="list-row-meta flex items-center gap-2">
                        <Clock size={12} /> {center.schedule}
                      </div>
                      <div className="list-row-meta flex items-center gap-2">
                        <PhoneCall size={12} /> {center.phone}
                      </div>
                      <div className="list-row-meta flex items-center gap-2">
                        <Tag size={12} /> {center.brand}
                      </div>
                    </div>

                    <div className="mt-auto flex flex-wrap gap-1">
                      {center.repairTypes.map((type) => (
                        <span key={type} className="badge tone-muted">
                          {type}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        )

      case 'team':
        return (
          <div className="panel-stack animate-fade-in">
            <Panel>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="section-title flex items-center gap-2" style={{ fontSize: 'var(--font-lg)' }}>
                    <Users size={20} style={{ color: 'var(--color-brand)' }} /> Equipo (tu licencia y esta web)
                  </h3>
                  <p className="section-subtitle mt-1 max-w-3xl">
                    Vista maqueta: en producción enlazas Hub allowlist +{' '}
                    <code className="rounded bg-[rgba(15,17,21,0.06)] px-1 py-0.5 text-[10px]">taller_users</code> como
                    en el CRM.
                  </p>
                </div>
                <button
                  type="button"
                  disabled
                  title="Invita desde Hub Connect / gestión de usuarios."
                  className="ghost-button cursor-not-allowed opacity-60"
                >
                  <UserPlus size={16} /> Invitar usuario
                </button>
              </div>

              <div className="scroll-panel overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="border-b border-[rgba(15,17,21,0.08)] text-[var(--muted)]">
                    <tr>
                      <th className="px-4 py-3 font-medium">Nombre</th>
                      <th className="px-4 py-3 font-medium">Email</th>
                      <th className="px-4 py-3 font-medium">Rol en taller</th>
                      <th className="px-4 py-3 font-medium">Estado Auth</th>
                      <th className="px-4 py-3 font-medium">Último acceso</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[rgba(15,17,21,0.06)]">
                    {MOCK_TEAM.map((member, idx) => (
                      <tr key={`${member.email}-${idx}`} className="hover:bg-[rgba(255,255,255,0.55)]">
                        <td className="px-4 py-3 font-semibold text-[var(--fog-strong)]">{member.display_name}</td>
                        <td className="px-4 py-3 text-[var(--muted)]">{member.email}</td>
                        <td className="px-4 py-3">{member.taller_roles}</td>
                        <td className="px-4 py-3">
                          <span className={`badge ${member.is_banned ? 'tone-negative' : 'tone-positive'}`}>
                            {member.is_banned ? 'Restringido' : 'Activo'}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-[var(--muted)] tabular-nums">{member.last_sign_in}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>
        )

      case 'branding':
        return (
          <div className="panel-stack animate-fade-in">
            <Panel>
              <h3 className="section-title mb-6 flex items-center gap-2" style={{ fontSize: 'var(--font-lg)' }}>
                <Palette size={20} style={{ color: 'var(--color-brand)' }} /> Identidad Visual
              </h3>

              <div className="panel-stack">
                <div className="space-y-3">
                  <label className="field-label">Logo del Concesionario</label>
                  <p className="section-subtitle">
                    En producción enlazas <code className="rounded bg-[rgba(15,17,21,0.06)] px-0.5 text-[10px]">ui_branding</code>{' '}
                    y bucket de marca.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="field-input flex flex-1 cursor-pointer items-center gap-2 truncate text-xs text-[var(--muted)]">
                      <Image size={14} />
                      Sin archivo (solo diseño)
                    </div>
                    <button type="button" className="ghost-button min-h-0 px-3 py-2">
                      <Upload size={16} />
                    </button>
                  </div>
                </div>

                <hr className="border-[rgba(15,17,21,0.08)]" />

                <div className="space-y-3">
                  <label className="field-label">Paleta de acento (plantilla)</label>
                  <div className="flex flex-wrap gap-3">
                    {paletteSwatches.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="glass-inline glass-lite flex flex-col items-center gap-2 rounded-[var(--radius-md)] p-4 transition-all hover:border-[rgba(11,99,214,0.25)]"
                      >
                        <span
                          className="h-12 w-12 rounded-full border-2 border-white shadow-md ring-1 ring-[rgba(15,17,21,0.08)]"
                          style={{ backgroundColor: p.color }}
                        />
                        <span className="text-center text-[10px] font-bold uppercase text-[var(--muted)]">{p.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="glass-inline glass-lite rounded-[var(--radius-md)] p-4">
                  <span className="section-eyebrow mb-3 block">Vista previa</span>
                  <div className="flex flex-wrap items-center gap-3">
                    <button type="button" className="client-submit min-h-0 px-4 py-2 text-sm">
                      Acción Principal
                    </button>
                    <button type="button" className="ghost-button min-h-0 px-4 py-2 text-sm">
                      Secundario
                    </button>
                    <span className="text-sm font-semibold" style={{ color: 'var(--color-brand)' }}>
                      Enlace de ejemplo
                    </span>
                    <span className="badge tone-neutral inline-flex items-center gap-1">
                      <CheckCircle2 size={12} /> Badge
                    </span>
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="field-label">Pantalla de Acceso / Portal</label>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-6">
                    <div>
                      <label className="section-eyebrow mb-1 block">Título del Portal</label>
                      <input type="text" placeholder="Portal clientes" className={`${inputCls()} text-sm`} />
                    </div>
                    <div>
                      <label className="section-eyebrow mb-1 block">Imagen de Fondo (Login)</label>
                      <div className="flex items-center gap-2">
                        <div className="field-input flex flex-1 cursor-pointer items-center gap-2 truncate text-xs">
                          <Image size={14} /> Sin imagen
                        </div>
                        <button type="button" className="ghost-button min-h-0 px-3 py-2">
                          <Upload size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-8 flex justify-end">
                <SaveButton label="Guardar Apariencia" />
              </div>
            </Panel>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col panel-stack animate-fade-in-up">
      <div className="shrink-0">
        <p className="section-eyebrow">Ajustes</p>
        <h1 className="section-title flex items-center gap-2">
          <Settings size={24} className="text-[var(--muted)]" aria-hidden />
          Configuración
        </h1>
        <p className="section-subtitle mt-1">
          Gestiona los parámetros generales de la plataforma (maqueta Hub).
        </p>
      </div>

      <div className="nav-segment custom-scrollbar-light shrink-0 overflow-x-auto">
        {visibleTabs.map((tab) => {
          const Icon = tab.icon
          const active = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`nav-segment-btn flex shrink-0 items-center gap-2 ${active ? 'is-active' : ''}`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          )
        })}
      </div>

      <div className="custom-scrollbar-light min-h-0 flex-1 overflow-y-auto pr-1 pb-4">
        {renderTabPanels()}
      </div>
    </div>
  )
}

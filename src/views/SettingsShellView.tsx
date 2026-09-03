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
  activeClass: string
}

const TABS: TabDef[] = [
  {
    id: 'general',
    label: 'General',
    icon: Building,
    activeClass: 'border-teal-500 text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/10',
  },
  {
    id: 'centers',
    label: 'Centros',
    icon: MapPin,
    activeClass: 'border-indigo-500 text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/10',
  },
  {
    id: 'team',
    label: 'Equipo',
    icon: Users,
    activeClass: 'border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/10',
  },
  {
    id: 'branding',
    label: 'Marca',
    icon: Palette,
    activeClass: 'border-rose-500 text-rose-600 dark:text-rose-400 bg-rose-900/10',
  },
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
    display_name: 'Usuario demostración',
    email: 'demo@ejemplo.es',
    taller_roles: 'Admin taller',
    is_banned: false,
    last_sign_in: '11/05/2026 10:12',
  },
  {
    display_name: 'Asesor comercial',
    email: 'asesor@ejemplo.es',
    taller_roles: 'Usuario',
    is_banned: false,
    last_sign_in: '—',
  },
]

function SaveButton({ label, onClick }: { label: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-lg bg-teal-600 px-6 py-2 font-medium text-white shadow-sm transition-all hover:bg-teal-500 active:scale-95"
    >
      <Save size={18} />
      {label}
    </button>
  )
}

function inputCls(disabled?: boolean): string {
  return `w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-2 text-slate-800 outline-none focus:ring-2 focus:ring-teal-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 ${
    disabled ? 'cursor-not-allowed opacity-60' : ''
  }`
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
          <div className="space-y-6 animate-fade-in">
            {isDemo && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/25 dark:text-amber-200">
                Modo demo: la ficha es solo maqueta y <strong>no guarda</strong> en AVI.
              </div>
            )}

            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-4 md:p-6">
              <h3 className="mb-6 flex items-center gap-2 text-lg font-semibold text-slate-800 dark:text-white">
                <Building size={20} className="text-teal-500" /> Datos del Concesionario
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Razón Social</label>
                  <input type="text" defaultValue={workshop.name} className={inputCls()} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">CIF / NIF</label>
                  <input type="text" placeholder="B00000000" className={inputCls()} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Dirección Fiscal</label>
                  <input type="text" placeholder="Calle ejemplo 1" className={inputCls()} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Código postal</label>
                  <input type="text" placeholder="28001" className={inputCls()} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Código Taller Oficial</label>
                  <input
                    type="text"
                    placeholder="codigoexterno en AVI"
                    className={`${inputCls()} placeholder:text-slate-400`}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Población</label>
                  <input type="text" placeholder="Madrid" className={inputCls()} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Provincia</label>
                  <input type="text" placeholder="Madrid" className={inputCls()} />
                </div>

                <div className="col-span-1 md:col-span-2">
                  <div className="mb-2 flex items-center justify-between">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
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
                        className={`relative h-6 w-10 rounded-full transition-colors ${generalMulti ? 'bg-teal-500' : 'bg-slate-200 dark:bg-slate-700'}`}
                      >
                        <span
                          className={`absolute top-1 left-1 block h-4 w-4 rounded-full bg-white transition-transform ${generalMulti ? 'translate-x-4' : ''}`}
                        />
                      </div>
                      <span className="text-xs font-medium text-slate-500">Concesionario Multimarca</span>
                    </label>
                  </div>
                  <div className="relative">
                    <Tag
                      size={16}
                      className={`absolute top-1/2 left-3 -translate-y-1/2 ${generalMulti ? 'text-slate-300' : 'text-slate-400'}`}
                    />
                    <input
                      type="text"
                      readOnly={generalMulti}
                      placeholder="Ej: Peugeot, Citroën, Opel"
                      className={`w-full rounded-lg border border-slate-300 py-2 pr-4 pl-10 text-slate-800 outline-none focus:ring-2 focus:ring-teal-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 ${generalMulti ? 'cursor-not-allowed bg-slate-100 italic text-slate-400 dark:bg-slate-900' : 'bg-slate-50'}`}
                      value={generalMulti ? 'Todas las marcas (Multimarca)' : dealerBrands}
                      onChange={(e) => setDealerBrands(e.target.value)}
                    />
                  </div>
                  <p className="mt-1.5 ml-1 text-[10px] text-slate-400">
                    Se guarda en el campo <span className="font-medium">grupo</span> de AVI en la app real.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-4 md:p-6">
              <h3 className="mb-6 flex items-center gap-2 text-lg font-semibold text-slate-800 dark:text-white">
                <Phone size={20} className="text-teal-500" /> Información de Contacto
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Email General</label>
                  <div className="relative">
                    <Mail size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
                    <input type="email" className={`${inputCls()} pl-10`} placeholder="contacto@ejemplo.es" />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Teléfono Principal</label>
                  <div className="relative">
                    <Phone size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
                    <input type="tel" className={`${inputCls()} pl-10`} placeholder="+34 …" />
                  </div>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Sitio Web</label>
                  <div className="relative">
                    <Globe size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
                    <input type="url" placeholder="https://" className={`${inputCls()} pl-10`} />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <SaveButton label="Guardar cambios" />
            </div>
          </div>
        )

      case 'centers':
        return (
          <div className="space-y-6 animate-fade-in">
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-4 md:p-6">
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-800 dark:text-white">
                    <MapPin size={20} className="text-teal-500" /> Gestión de Centros
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Centros del taller en AVI (tabla centros). En plantilla solo se muestra el diseño.
                  </p>
                </div>
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-bold text-indigo-600 transition-colors hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400"
                >
                  <Plus size={16} /> Añadir Centro
                </button>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {MOCK_CENTERS.map((center) => (
                  <div
                    key={center.id}
                    className="group relative flex h-full flex-col rounded-xl border border-slate-200 bg-slate-50 p-4 transition-colors hover:border-teal-500/50 dark:border-slate-800 dark:bg-slate-950/30"
                  >
                    <div className="absolute top-4 right-4 flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                      <span className="rounded bg-white p-1.5 text-blue-500 shadow-sm dark:bg-slate-800">
                        <Edit2 size={14} />
                      </span>
                      <span className="rounded bg-white p-1.5 text-rose-500 shadow-sm dark:bg-slate-800">
                        <Trash2 size={14} />
                      </span>
                    </div>

                    <h4 className="mb-1 pr-12 font-bold text-slate-800 dark:text-white">{center.name}</h4>
                    <p className="mb-3 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                      <MapPin size={12} /> {center.address}, {center.city}
                    </p>

                    <div className="mb-4 flex-1 space-y-2">
                      <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                        <Clock size={12} className="text-slate-400" /> {center.schedule}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                        <PhoneCall size={12} className="text-slate-400" /> {center.phone}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                        <Tag size={12} className="text-slate-400" /> {center.brand}
                      </div>
                    </div>

                    <div className="mt-auto flex flex-wrap gap-1">
                      {center.repairTypes.map((type) => (
                        <span
                          key={type}
                          className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-400"
                        >
                          {type}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )

      case 'team':
        return (
          <div className="space-y-6 animate-fade-in">
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-4 md:p-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-800 dark:text-white">
                    <Users size={20} className="text-blue-500" /> Equipo (tu licencia y esta web)
                  </h3>
                  <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                    Vista maqueta: en producción enlazas Hub allowlist +{' '}
                    <code className="rounded bg-slate-100 px-1 py-0.5 text-[10px] dark:bg-slate-800">taller_users</code> como
                    en el CRM.
                  </p>
                </div>
                <button
                  type="button"
                  disabled
                  title="Invita desde Hub Connect / gestión de usuarios."
                  className="flex cursor-not-allowed items-center gap-2 rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-bold text-slate-400 dark:border-slate-700 dark:bg-slate-800"
                >
                  <UserPlus size={16} /> Invitar usuario
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-950/50">
                    <tr>
                      <th className="px-4 py-3 font-medium">Nombre</th>
                      <th className="px-4 py-3 font-medium">Email</th>
                      <th className="px-4 py-3 font-medium">Rol en taller</th>
                      <th className="px-4 py-3 font-medium">Estado Auth</th>
                      <th className="px-4 py-3 font-medium">Último acceso</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {MOCK_TEAM.map((member, idx) => (
                      <tr key={`${member.email}-${idx}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                        <td className="px-4 py-3 font-bold text-slate-700 dark:text-slate-200">{member.display_name}</td>
                        <td className="px-4 py-3 text-slate-500">{member.email}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{member.taller_roles}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2 py-1 text-xs font-bold ${
                              member.is_banned
                                ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
                                : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                            }`}
                          >
                            {member.is_banned ? 'Restringido' : 'Activo'}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-500 tabular-nums">{member.last_sign_in}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )

      case 'branding':
        return (
          <div className="space-y-6 animate-fade-in">
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-4 md:p-6">
              <h3 className="mb-6 flex items-center gap-2 text-lg font-semibold text-slate-800 dark:text-white">
                <Palette size={20} className="text-teal-500" /> Identidad Visual
              </h3>

              <div className="space-y-8">
                <div className="space-y-3">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Logo del Concesionario</label>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    En producción enlazas <code className="rounded bg-slate-100 px-0.5 text-[10px] dark:bg-slate-800">ui_branding</code>{' '}
                    y bucket de marca.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex flex-1 cursor-pointer items-center gap-2 truncate rounded-lg border border-slate-300 bg-slate-50 px-2 py-2 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-950">
                      <Image size={14} />
                      Sin archivo (solo diseño)
                    </div>
                    <button
                      type="button"
                      className="rounded-lg border border-slate-200 bg-slate-100 p-2 text-slate-500 dark:border-slate-700 dark:bg-slate-800"
                    >
                      <Upload size={16} />
                    </button>
                  </div>
                </div>

                <hr className="border-slate-100 dark:border-slate-800" />

                <div className="space-y-3">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Paleta de acento (plantilla)
                  </label>
                  <div className="flex flex-wrap gap-3">
                    {paletteSwatches.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 p-4 transition-all hover:border-teal-500/50 dark:border-slate-800"
                      >
                        <span
                          className="h-12 w-12 rounded-full border-2 border-white shadow-md ring-1 ring-slate-200 dark:border-slate-900 dark:ring-slate-700"
                          style={{ backgroundColor: p.color }}
                        />
                        <span className="text-center text-[10px] font-bold uppercase text-slate-500">{p.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/50">
                  <span className="mb-3 block text-xs font-bold uppercase text-slate-400">Vista previa</span>
                  <div className="flex flex-wrap items-center gap-3">
                    <button type="button" className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-bold text-white shadow-md">
                      Acción Principal
                    </button>
                    <button
                      type="button"
                      className="rounded-lg bg-teal-100 px-4 py-2 text-sm font-bold text-teal-700 dark:bg-teal-900/30 dark:text-teal-300"
                    >
                      Secundario
                    </button>
                    <span className="text-sm font-semibold text-teal-600 dark:text-teal-400">Enlace de ejemplo</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-xs font-bold text-teal-700 ring-1 ring-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:ring-teal-800">
                      <CheckCircle2 size={12} /> Badge
                    </span>
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Pantalla de Acceso / Portal</label>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-6">
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-500 uppercase">Título del Portal</label>
                      <input type="text" placeholder="Portal clientes" className={`${inputCls()} text-sm`} />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-500 uppercase">
                        Imagen de Fondo (Login)
                      </label>
                      <div className="flex items-center gap-2">
                        <div className="flex flex-1 cursor-pointer items-center gap-2 truncate rounded-lg border border-slate-300 bg-slate-50 px-2 py-2 text-xs dark:border-slate-700 dark:bg-slate-950">
                          <Image size={14} /> Sin imagen
                        </div>
                        <button
                          type="button"
                          className="rounded-lg border border-slate-200 bg-slate-100 p-2 dark:border-slate-700 dark:bg-slate-800"
                        >
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
            </div>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col space-y-6 animate-fade-in-up">
      <div className="mb-2 shrink-0 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-white sm:text-2xl">
            <Settings size={24} className="text-slate-400" aria-hidden />
            Configuración
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Gestiona los parámetros generales de la plataforma (maqueta Hub).
          </p>
        </div>
      </div>

      <div className="custom-scrollbar-light flex shrink-0 items-center gap-1 overflow-x-auto border-b border-slate-200 pb-2 dark:border-slate-800">
        {visibleTabs.map((tab) => {
          const Icon = tab.icon
          const active = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex shrink-0 items-center gap-2 border-b-2 px-4 py-2 text-sm font-bold transition-colors ${
                active
                  ? tab.activeClass
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
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

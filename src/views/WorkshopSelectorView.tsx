/**
 * Elige grupo, licencia y centro. Misma capa visual que el login (Card, pasos, tarjetas).
 */

import React, { useEffect, useMemo, useState } from 'react'
import type { Workshop } from '../types'
import { ArrowRight, Building2, ChevronLeft, LogOut, Search as SearchIcon } from 'lucide-react'
import { HexLoaderScreen } from '../components/ui/HexLoader'
import { filterCentersForUser, filterWorkshopsForUser } from '../lib/crmAccess'
import { canBrowseAllWorkshops } from '../lib/operationsConnect'
import {
  parseConnectSiteIds,
  scopedSitesEmptyDenied,
  sessionAllowsThisHubWeb,
} from '../lib/connectSiteScope'
import { getCrmHubWebIdFromEnv, MISSING_VITE_HUB_WEB_ID_MESSAGE } from '../lib/hubWebEnv'
import {
  fetchAllActiveContainers,
  fetchCentrosForGrupo,
  fetchCentrosForTalleres,
  fetchContainersByIds,
  fetchLicenciaModuleTalleres,
  fetchUserContainerIds,
  type ContainerRow,
  type LicenciaTaller,
  type TallerCentro,
} from '../lib/licenciaGrupo'
import { signOut } from '../utils/auth'
import { getAppProductName } from '../lib/appIdentity'
import { LOCAL_PREVIEW_WORKSHOP, readLocalPreview } from '../lib/localPreview'
import type { TallerBranding } from '../lib/tallerBranding'
import Card from '../components/ui/Card'

const LOCAL_PREVIEW_CONTAINERS: ContainerRow[] = [
  {
    idtaller: 'local-preview',
    hubWebId: null,
    idlicenciagrupo: '1',
    nombre_personalizado: 'Grupo local',
    slug: 'local',
    data_schema: 'demo',
    isModuleActive: true,
  },
]

const LOCAL_PREVIEW_SHOPS: Workshop[] = [
  LOCAL_PREVIEW_WORKSHOP,
  {
    id: 'local-preview-2',
    name: 'Licencia norte',
    city: 'Bilbao',
    source: 'demo',
    originalId: 'local-preview-2',
    containerIdTaller: 'local-preview',
  },
]

const LOCAL_PREVIEW_CENTERS: TallerCentro[] = [
  { idcentro: 'local-center-1', idtaller: 'local-preview', nombre: 'Recepción Madrid', poblacion: 'Madrid' },
  { idcentro: 'local-center-2', idtaller: 'local-preview', nombre: 'Chapa Madrid', poblacion: 'Madrid' },
  { idcentro: 'local-center-3', idtaller: 'local-preview-2', nombre: 'Recepción Bilbao', poblacion: 'Bilbao' },
]

interface WorkshopSelectorViewProps {
  user: unknown
  onSelect: (workshop: Workshop) => void
  isDarkMode?: boolean
  onLogout?: () => void | Promise<void>
  preferredWorkshopIdTaller?: string | null
  licenseBranding?: TallerBranding | null
  hubWebIconUrl?: string | null
  licenseDisplayName?: string | null
}

const RECENT_WORKSHOP_KEY = 'crm_last_workshop'
const RECENT_LICENSE_KEY = 'crm_last_license'

function dataSchemaToSource(dataSchema: string | null | undefined): Workshop['source'] {
  const s = String(dataSchema || '').trim().toLowerCase()
  if (s === 'main' || s === 'public') return 'main'
  if (s === 'starmadrid' || s === 'star') return 'starmadrid'
  return 'aviold'
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2)
  const letters = parts.map((part) => part[0] || '').join('')
  return (letters || 'L').toUpperCase()
}

function shopCountLabel(count: number | undefined): string {
  if (count == null) return 'Elige la licencia después'
  if (count === 1) return '1 licencia'
  return `${count} licencias`
}

function centerCountLabel(count: number | undefined): string {
  if (count == null) return 'Elige el centro después'
  if (count === 0) return 'Sin centros'
  if (count === 1) return '1 centro'
  return `${count} centros`
}

function buildWorkshopFromLicenciaTaller(
  t: LicenciaTaller,
  hubWebId?: string | null,
  containerIdtaller?: string | null,
): Workshop {
  const source = dataSchemaToSource(t.data_schema)
  const hid = hubWebId != null && String(hubWebId).trim() !== '' ? String(hubWebId).trim() : undefined
  const cid =
    containerIdtaller != null && String(containerIdtaller).trim() !== ''
      ? String(containerIdtaller).trim()
      : undefined
  return {
    id: `${source}-${t.idtaller}`,
    originalId: t.idtaller,
    name: (t.nombre || 'Licencia').trim() || 'Licencia',
    address: t.direccion || undefined,
    city: t.poblacion || undefined,
    logo: t.logo || undefined,
    source,
    ...(hid ? { hubWebId: hid } : {}),
    ...(cid ? { containerIdTaller: cid } : {}),
  } as Workshop
}

function buildWorkshopFromContainer(c: ContainerRow): Workshop {
  const source = dataSchemaToSource(c.data_schema)
  const hid =
    c.hubWebId != null && String(c.hubWebId).trim() !== '' ? String(c.hubWebId).trim() : undefined
  return {
    id: `${source}-${c.idtaller}`,
    originalId: c.idtaller,
    containerIdTaller: c.idtaller,
    name: (c.nombre_personalizado || 'Licencia').trim() || 'Licencia',
    source,
    ...(hid ? { hubWebId: hid } : {}),
  } as Workshop
}

const WorkshopSelectorView: React.FC<WorkshopSelectorViewProps> = ({
  user,
  onSelect,
  onLogout,
  preferredWorkshopIdTaller: _preferredWorkshopIdTaller = null,
  licenseBranding = null,
  hubWebIconUrl = null,
  licenseDisplayName = null,
}) => {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [lastWorkshopId, setLastWorkshopId] = useState<string | null>(null)
  const [lastLicenseId, setLastLicenseId] = useState<string | null>(null)

  const [containers, setContainers] = useState<ContainerRow[]>([])
  const [shopCounts, setShopCounts] = useState<Record<string, number>>({})
  const [centerCounts, setCenterCounts] = useState<Record<string, number>>({})
  const [activeContainer, setActiveContainer] = useState<ContainerRow | null>(null)
  const [workshops, setWorkshops] = useState<Workshop[]>([])
  const [groupCenters, setGroupCenters] = useState<TallerCentro[]>([])
  const [searchQuery, setSearchQuery] = useState('')

  const isSuperUser = useMemo(() => canBrowseAllWorkshops({ user }), [user])
  const headerLogoSrc = (licenseBranding?.logo_url ?? '').trim() || (hubWebIconUrl ?? '').trim() || ''
  const step: 'group' | 'license' = !activeContainer ? 'group' : 'license'
  const groupName =
    activeContainer?.nombre_personalizado ||
    activeContainer?.slug ||
    licenseDisplayName ||
    ''

  const userId = (user as { id?: string } | null)?.id ?? ''
  const userRole = String((user as { app_metadata?: { role?: string } } | null)?.app_metadata?.role ?? '')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    void (async () => {
      try {
        try {
          setLastWorkshopId(localStorage.getItem(RECENT_WORKSHOP_KEY))
          setLastLicenseId(localStorage.getItem(RECENT_LICENSE_KEY))
        } catch {
          /* ignore */
        }

        if (readLocalPreview()) {
          setContainers(LOCAL_PREVIEW_CONTAINERS)
          setShopCounts({ 'local-preview': LOCAL_PREVIEW_SHOPS.length })
          setLoading(false)
          return
        }

        const crmWebId = getCrmHubWebIdFromEnv()
        if (!crmWebId) {
          setError(MISSING_VITE_HUB_WEB_ID_MESSAGE)
          setLoading(false)
          return
        }

        const parse = parseConnectSiteIds(user)
        if (!isSuperUser && scopedSitesEmptyDenied(parse)) {
          setError(
            'Tu cuenta no tiene webs asignadas en Hub Connect (connect_site_ids vacío). Solicita acceso desde el panel Hub.',
          )
          setLoading(false)
          return
        }
        if (!isSuperUser && !sessionAllowsThisHubWeb(parse, crmWebId, false)) {
          setError(
            'Tu sesión no incluye esta instalación en Hub Connect (UUID de web ausente o no permitido en connect_site_ids).',
          )
          setLoading(false)
          return
        }

        let visible: ContainerRow[] = []
        if (isSuperUser) {
          visible = (await fetchAllActiveContainers()).filter((row) => row.isModuleActive)
        } else {
          const userId = (user as { id?: string } | null)?.id ?? null
          const legacyId = (user as { user_metadata?: { legacy_id?: string } } | null)?.user_metadata?.legacy_id ?? null
          const ownIds = await fetchUserContainerIds(userId, legacyId)
          if (cancelled) return
          if (ownIds.length === 0) {
            setError('Tu usuario no tiene grupos asignados en esta web. Contacta con el administrador.')
            setLoading(false)
            return
          }
          visible = (await fetchContainersByIds(ownIds)).filter((row) => row.isModuleActive)
        }
        if (cancelled) return

        if (visible.length === 0) {
          setError(
            isSuperUser
              ? 'No hay grupos activos para este módulo.'
              : 'Tus grupos no tienen esta web activa en Hub para este despliegue.',
          )
          setLoading(false)
          return
        }

        visible.sort((a, b) =>
          String(a.nombre_personalizado || a.slug || a.idtaller).localeCompare(
            String(b.nombre_personalizado || b.slug || b.idtaller),
            'es',
            { numeric: true, sensitivity: 'base' },
          ),
        )
        setContainers(visible)
        setLoading(false)

        const counts: Record<string, number> = {}
        await Promise.all(
          visible.map(async (row) => {
            if (!row.idlicenciagrupo) {
              counts[row.idtaller] = 1
              return
            }
            const shops = await fetchLicenciaModuleTalleres(row.idlicenciagrupo, row.hubWebId)
            counts[row.idtaller] = shops.length
          }),
        )
        if (!cancelled) setShopCounts(counts)
      } catch {
        if (!cancelled) {
          setError('Error de conexión al cargar el listado de grupos.')
          setLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [userId, userRole, isSuperUser])

  useEffect(() => {
    if (!activeContainer) return
    let cancelled = false
    setLoading(true)
    setError(null)

    void (async () => {
      try {
        if (readLocalPreview()) {
          setWorkshops(LOCAL_PREVIEW_SHOPS)
          setGroupCenters(LOCAL_PREVIEW_CENTERS)
          const counts: Record<string, number> = {}
          for (const shop of LOCAL_PREVIEW_SHOPS) {
            counts[shop.id] = LOCAL_PREVIEW_CENTERS.filter((item) => item.idtaller === shop.originalId).length
          }
          setCenterCounts(counts)
          setLoading(false)
          return
        }

        if (!activeContainer.isModuleActive) {
          setError('Este grupo no tiene activada esta web. Contacta con el administrador.')
          setLoading(false)
          return
        }

        let real: Workshop[] = []
        if (!activeContainer.idlicenciagrupo) {
          real = [buildWorkshopFromContainer(activeContainer)]
        } else {
          const rows = await fetchLicenciaModuleTalleres(
            activeContainer.idlicenciagrupo,
            activeContainer.hubWebId,
          )
          if (cancelled) return
          real = rows.map((item) =>
            buildWorkshopFromLicenciaTaller(
              item,
              activeContainer.hubWebId ?? getCrmHubWebIdFromEnv(),
              activeContainer.idtaller,
            ),
          )
          if (real.length === 0) {
            setError('Este grupo no tiene licencias activas para esta web.')
            setLoading(false)
            return
          }
        }

        const scoped = filterWorkshopsForUser(real, user, isSuperUser)
        if (cancelled) return
        setWorkshops(scoped)
        const centroRows = activeContainer.idlicenciagrupo
          ? await fetchCentrosForGrupo(activeContainer.idlicenciagrupo, activeContainer.hubWebId)
          : await fetchCentrosForTalleres(scoped.map((item) => String(item.originalId || '')))
        if (cancelled) return
        setGroupCenters(centroRows)
        const counts: Record<string, number> = {}
        for (const shop of scoped) {
          const id = String(shop.originalId || '').trim().toLowerCase()
          counts[shop.id] = centroRows.filter((item) => item.idtaller === id).length
        }
        setCenterCounts(counts)
        setLoading(false)
      } catch {
        if (!cancelled) {
          setError('Error consultando las licencias del grupo.')
          setLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [activeContainer, user, isSuperUser])

  const handleLogout = async () => {
    try {
      if (onLogout) await onLogout()
      else await signOut()
    } catch (err) {
      console.error('Error al cerrar sesión:', err)
    }
  }

  const enterWorkshop = (workshop: Workshop) => {
    setScanning(true)
    setTimeout(() => {
      try {
        localStorage.setItem(RECENT_WORKSHOP_KEY, workshop.id)
        if (activeContainer) localStorage.setItem(RECENT_LICENSE_KEY, activeContainer.idtaller)
      } catch {
        /* ignore */
      }
      onSelect(workshop)
    }, 400)
  }

  const handlePickWorkshop = (workshop: Workshop) => {
    const shopId = String(workshop.originalId || '').trim().toLowerCase()
    const rows = filterCentersForUser(
      (readLocalPreview() ? LOCAL_PREVIEW_CENTERS : groupCenters).filter((item) => item.idtaller === shopId),
      user,
    )
    enterWorkshop({
      ...workshop,
      groupName: workshop.groupName || groupName || undefined,
      centers: rows.map((item) => ({ id: item.idcentro, name: item.nombre })),
      centerId: rows.length === 1 ? rows[0].idcentro : undefined,
      centerName: rows.length === 1 ? rows[0].nombre : rows.length ? `${rows.length} centros` : undefined,
    })
  }

  const handlePickContainer = (row: ContainerRow) => {
    setSearchQuery('')
    setError(null)
    setGroupCenters([])
    setLoading(true)
    setActiveContainer(row)
    if (readLocalPreview()) {
      setWorkshops(LOCAL_PREVIEW_SHOPS)
      setGroupCenters(LOCAL_PREVIEW_CENTERS)
      const counts: Record<string, number> = {}
      for (const shop of LOCAL_PREVIEW_SHOPS) {
        counts[shop.id] = LOCAL_PREVIEW_CENTERS.filter((item) => item.idtaller === shop.originalId).length
      }
      setCenterCounts(counts)
      setLoading(false)
    }
  }

  const handleBackToLicenses = () => {
    setSearchQuery('')
    setActiveContainer(null)
    setWorkshops([])
    setGroupCenters([])
    setError(null)
  }

  const filteredWorkshops = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return workshops
    return workshops.filter((workshop) => {
      const nameMatch = (workshop.name || '').toLowerCase().includes(q)
      const cityMatch = (workshop.city || '').toLowerCase().includes(q)
      return nameMatch || cityMatch
    })
  }, [workshops, searchQuery])

  const filteredContainers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return containers
    return containers.filter((row) => {
      const name = (row.nombre_personalizado || row.slug || row.idtaller).toLowerCase()
      return name.includes(q)
    })
  }, [containers, searchQuery])

  const showSearch = step === 'group' ? containers.length > 6 : workshops.length > 6
  const empty = step === 'group' ? filteredContainers.length === 0 : filteredWorkshops.length === 0

  if (loading && step === 'group') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4">
        <HexLoaderScreen label="Cargando grupos…" />
      </div>
    )
  }

  if (error && step === 'group') {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-10">
        <Card padding="lg" className="w-full max-w-md text-center">
          <h2 className="section-title">No se puede continuar</h2>
          <p className="section-subtitle mt-3">{error}</p>
          <button type="button" onClick={() => void handleLogout()} className="ghost-button mt-6 w-full">
            <LogOut size={18} />
            Cerrar sesión
          </button>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      {scanning ? (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center" style={{ background: 'rgba(238,241,245,0.92)' }}>
          <HexLoaderScreen label="Abriendo licencia…" />
        </div>
      ) : null}

      <div className="workshop-gate w-full max-w-md">
        <Card padding="lg" className="text-center">
          <div className="workshop-gate-top mb-5 flex items-center justify-between gap-3">
            {headerLogoSrc ? (
              <div className="logo-slot logo-slot-sm">
                <img
                  src={headerLogoSrc}
                  alt=""
                  className="logo-slot-img"
                  referrerPolicy="no-referrer"
                />
              </div>
            ) : (
              <span />
            )}
            <button type="button" onClick={() => void handleLogout()} className="ghost-action is-neutral">
              <LogOut size={16} />
              Salir
            </button>
          </div>

          <p className="section-eyebrow">{getAppProductName()}</p>
          <h1 className="section-title mt-1">{step === 'group' ? 'Elige tu grupo' : 'Elige tu licencia'}</h1>
          <p className="section-subtitle mt-2">
            {step === 'group'
              ? 'Primero el grupo. Luego la licencia, ya con sus centros.'
              : groupName
                ? `Licencias de ${groupName}. Al entrar, los centros ya van listos.`
                : 'Toca la licencia. Entras con todos sus centros.'}
          </p>

          <nav className="wizard-steps wizard-steps-compact mt-4" aria-label="Pasos para entrar">
            <span className={`wizard-step ${step === 'group' ? 'is-current' : 'is-done'}`}>
              <span className="wizard-step-num">{step === 'group' ? '1' : '✓'}</span>
              Grupo
            </span>
            <span className={`wizard-step ${step === 'license' ? 'is-current' : ''}`}>
              <span className="wizard-step-num">2</span>
              Licencia
            </span>
          </nav>

          {step === 'license' ? (
            <button type="button" onClick={handleBackToLicenses} className="ghost-button mt-6 w-full">
              <ChevronLeft size={18} />
              Volver a grupos
            </button>
          ) : null}

          {error && step !== 'group' ? (
            <div className="alert alert-error mt-6" role="alert">
              {error}
            </div>
          ) : null}

          {showSearch ? (
            <div className="relative mt-6 text-left">
              <SearchIcon className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)]" size={20} />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={step === 'group' ? 'Buscar grupo…' : 'Buscar licencia…'}
                className="field-input pl-12"
                aria-label={step === 'group' ? 'Buscar grupo' : 'Buscar licencia'}
              />
            </div>
          ) : null}

          {loading && step !== 'group' ? (
            <div className="mt-8">
              <HexLoaderScreen label="Cargando licencias…" />
            </div>
          ) : (
            <ul className={`workshop-gate-list mt-5 flex max-h-[min(52vh,480px)] list-none flex-col gap-2 overflow-auto p-0 text-left${showSearch ? '' : ' is-spaced mt-6'}`}>
              {step === 'group'
                ? filteredContainers.map((row) => {
                    const name = row.nombre_personalizado || row.slug || row.idtaller
                    const recent = row.idtaller === lastLicenseId
                    return (
                      <li key={row.idtaller}>
                        <button
                          type="button"
                          onClick={() => handlePickContainer(row)}
                          className="login-asesor-card squircle flex min-h-tap w-full items-center gap-3 px-3 py-2.5 text-left"
                        >
                          <span className="login-asesor-avatar" aria-hidden>
                            {initialsOf(name)}
                          </span>
                          <span className="login-asesor-copy">
                            <strong>{name}</strong>
                            <small>
                              {row.slug ? `/${row.slug} · ` : ''}
                              {shopCountLabel(shopCounts[row.idtaller])}
                            </small>
                          </span>
                          {recent ? <span className="badge tone-neutral">Última</span> : null}
                          <ArrowRight size={18} className="workshop-gate-arrow" />
                        </button>
                      </li>
                    )
                  })
                : filteredWorkshops.map((workshop) => {
                    const recent = workshop.id === lastWorkshopId
                    return (
                      <li key={workshop.id}>
                        <button
                          type="button"
                          onClick={() => handlePickWorkshop(workshop)}
                          className="login-asesor-card squircle flex min-h-tap w-full items-center gap-3 px-3 py-2.5 text-left"
                        >
                          {workshop.logo ? (
                            <img
                              src={workshop.logo}
                              alt=""
                              className="workshop-gate-logo"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <span className="login-asesor-avatar" aria-hidden>
                              {initialsOf(workshop.name)}
                            </span>
                          )}
                          <span className="login-asesor-copy">
                            <strong>{workshop.name}</strong>
                            <small>
                              {[workshop.city, centerCountLabel(centerCounts[workshop.id])]
                                .filter(Boolean)
                                .join(' · ')}
                            </small>
                          </span>
                          {recent ? <span className="badge tone-neutral">Última</span> : null}
                          <ArrowRight size={18} className="workshop-gate-arrow" />
                        </button>
                      </li>
                    )
                  })}
            </ul>
          )}

          {empty && !loading ? (
            <div className="mt-6">
              <Building2 size={36} className="mx-auto mb-3 text-[var(--muted)]" />
              <h3 className="section-title">No hay resultados</h3>
              <p className="section-subtitle mt-2">
                {searchQuery.trim()
                  ? 'Prueba con otro nombre o borra la búsqueda.'
                  : step === 'group'
                    ? 'No hay grupos activos para esta cuenta.'
                    : 'Este grupo no tiene licencias.'}
              </p>
              {searchQuery.trim() ? (
                <button type="button" onClick={() => setSearchQuery('')} className="ghost-button mt-6">
                  Borrar búsqueda
                </button>
              ) : null}
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  )
}

export default WorkshopSelectorView

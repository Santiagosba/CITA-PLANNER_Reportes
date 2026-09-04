/**
 * WorkshopSelector — modelo Hub Connect (contenedor + RPC de talleres reales).
 * Ajusta copys en `src/lib/appIdentity.ts` o vía `VITE_APP_*`.
 */

import React, { useEffect, useMemo, useState } from 'react';
import type { Workshop } from '../types';
import {
  LogOut, Search as SearchIcon, ArrowRight, ChevronLeft, Building2,
} from 'lucide-react';
import { HexLoaderScreen } from '../components/ui/HexLoader';
import { canBrowseAllWorkshops } from '../lib/operationsConnect';
import {
  parseConnectSiteIds,
  scopedSitesEmptyDenied,
  sessionAllowsThisHubWeb,
} from '../lib/connectSiteScope';
import { getCrmHubWebIdFromEnv, MISSING_VITE_HUB_WEB_ID_MESSAGE } from '../lib/hubWebEnv';
import {
  fetchAllActiveContainers,
  fetchContainerRow,
  fetchContainersByIds,
  fetchLicenciaModuleTalleres,
  fetchUserContainerIds,
  type ContainerRow,
  type LicenciaTaller,
} from '../lib/licenciaGrupo';
import { signOut } from '../utils/auth';
import {
  getAppProductName,
} from '../lib/appIdentity';
import type { TallerBranding } from '../lib/tallerBranding';
import Card from '../components/ui/Card';

interface WorkshopSelectorViewProps {
  user: unknown;
  onSelect: (workshop: Workshop) => void;
  isDarkMode?: boolean;
  onLogout?: () => void | Promise<void>;
  preferredWorkshopIdTaller?: string | null;
  /**
   * Branding cuando la URL lleva slug de taller (misma fuente que el login:
   * `crm_config.ui_branding` para ese contenedor).
   */
  licenseBranding?: TallerBranding | null;
  /** Icono de la web Hub (`VITE_HUB_WEB_ICON_URL` o `hub_webs.icon_image_url`) si no hay `logo_url` de licencia. */
  hubWebIconUrl?: string | null;
  /** Nombre mostrado del taller/licencia vía slug (subtítulo de cabecera, alineado al login). */
  licenseDisplayName?: string | null;
}

const RECENT_STORAGE_KEY = 'crm_last_workshop';

function dataSchemaToSource(dataSchema: string | null | undefined): Workshop['source'] {
  const s = String(dataSchema || '').trim().toLowerCase();
  if (s === 'main' || s === 'public') return 'main';
  if (s === 'starmadrid' || s === 'star') return 'starmadrid';
  return 'aviold';
}

function buildWorkshopFromLicenciaTaller(
  t: LicenciaTaller,
  hubWebId?: string | null,
  containerIdtaller?: string | null,
): Workshop {
  const source = dataSchemaToSource(t.data_schema);
  const hid = hubWebId != null && String(hubWebId).trim() !== '' ? String(hubWebId).trim() : undefined;
  const cid =
    containerIdtaller != null && String(containerIdtaller).trim() !== ''
      ? String(containerIdtaller).trim()
      : undefined;
  return {
    id: `${source}-${t.idtaller}`,
    originalId: t.idtaller,
    name: (t.nombre || 'Taller').trim() || 'Taller',
    address: t.direccion || undefined,
    city: t.poblacion || undefined,
    logo: t.logo || undefined,
    source,
    ...(hid ? { hubWebId: hid } : {}),
    ...(cid ? { containerIdTaller: cid } : {}),
  } as Workshop;
}

function buildWorkshopFromContainer(c: ContainerRow): Workshop {
  const source = dataSchemaToSource(c.data_schema);
  const hid =
    c.hubWebId != null && String(c.hubWebId).trim() !== '' ? String(c.hubWebId).trim() : undefined;
  return {
    id: `${source}-${c.idtaller}`,
    originalId: c.idtaller,
    containerIdTaller: c.idtaller,
    name: (c.nombre_personalizado || 'Taller').trim() || 'Taller',
    source,
    ...(hid ? { hubWebId: hid } : {}),
  } as Workshop;
}

async function mergeAllWorkshopsFromContainers(containers: ContainerRow[]): Promise<Workshop[]> {
  const merged: Workshop[] = [];
  const seen = new Set<string>();
  for (const c of containers) {
    if (!c.isModuleActive) continue;
    if (!c.idlicenciagrupo) {
      const w = buildWorkshopFromContainer(c);
      const k = `${w.source}:${String(w.originalId).toLowerCase()}`;
      if (!seen.has(k)) {
        seen.add(k);
        merged.push(w);
      }
      continue;
    }
    const rows = await fetchLicenciaModuleTalleres(c.idlicenciagrupo, c.hubWebId);
    for (const t of rows) {
      const w = buildWorkshopFromLicenciaTaller(t, c.hubWebId, c.idtaller);
      const k = `${w.source}:${String(w.originalId).toLowerCase()}`;
      if (!seen.has(k)) {
        seen.add(k);
        merged.push(w);
      }
    }
  }
  merged.sort((a, b) =>
    (a.name || '').localeCompare(b.name || '', 'es', { numeric: true, sensitivity: 'base' }),
  );
  return merged;
}

const WorkshopSelectorView: React.FC<WorkshopSelectorViewProps> = ({
  user,
  onSelect,
  isDarkMode = true,
  onLogout,
  preferredWorkshopIdTaller = null,
  licenseBranding = null,
  hubWebIconUrl = null,
  licenseDisplayName = null,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [lastWorkshopId, setLastWorkshopId] = useState<string | null>(null);

  const [containers, setContainers] = useState<ContainerRow[]>([]);
  const [activeContainer, setActiveContainer] = useState<ContainerRow | null>(null);
  const [workshops, setWorkshops] = useState<Workshop[]>([]);

  const [searchQuery, setSearchQuery] = useState('');

  const isSuperUser = useMemo(() => canBrowseAllWorkshops({ user }), [user]);

  const headerLogoSrc = (licenseBranding?.logo_url ?? '').trim() || (hubWebIconUrl ?? '').trim() || '';

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const saved = localStorage.getItem(RECENT_STORAGE_KEY);
        if (saved) setLastWorkshopId(saved);

        const crmWebId = getCrmHubWebIdFromEnv();
        if (!crmWebId) {
          setError(MISSING_VITE_HUB_WEB_ID_MESSAGE);
          setLoading(false);
          return;
        }

        const parse = parseConnectSiteIds(user);
        if (!isSuperUser && scopedSitesEmptyDenied(parse)) {
          setError(
            'Tu cuenta no tiene webs asignadas en Hub Connect (connect_site_ids vacío). Solicita acceso desde el panel Hub.',
          );
          setLoading(false);
          return;
        }
        if (!isSuperUser && !sessionAllowsThisHubWeb(parse, crmWebId, false)) {
          setError(
            'Tu sesión no incluye esta instalación en Hub Connect (UUID de web ausente o no permitido en connect_site_ids).',
          );
          setLoading(false);
          return;
        }

        if (preferredWorkshopIdTaller) {
          const row = await fetchContainerRow(preferredWorkshopIdTaller);
          if (cancelled) return;
          if (!row) {
            setError('La URL del taller no existe o ha sido desactivada.');
            setLoading(false);
            return;
          }
          setContainers([row]);
          setActiveContainer(row);
          return;
        }

        if (isSuperUser) {
          const allContainers = await fetchAllActiveContainers();
          if (cancelled) return;
          const visible = allContainers.filter((r) => r.isModuleActive);
          if (visible.length === 0) {
            setError('No hay licencias activas para este módulo.');
            setLoading(false);
            return;
          }
          const merged = await mergeAllWorkshopsFromContainers(visible);
          if (cancelled) return;
          if (merged.length === 0) {
            setError('No hay talleres activos en las licencias de este módulo.');
            setLoading(false);
            return;
          }
          setWorkshops(merged);
          setContainers([]);
          setActiveContainer(null);
          if (merged.length === 1) {
            try { localStorage.setItem(RECENT_STORAGE_KEY, merged[0].id); } catch { /* ignore */ }
            onSelect(merged[0]);
            return;
          }
          setLoading(false);
          return;
        }

        const userId = (user as any)?.id ?? null;
        const legacyId = (user as any)?.user_metadata?.legacy_id ?? null;
        let ownContainerIds: string[] = [];
        if (!isSuperUser) {
          ownContainerIds = await fetchUserContainerIds(userId, legacyId);
          if (cancelled) return;
          if (ownContainerIds.length === 0) {
            setError('Tu usuario no tiene talleres asignados en esta web. Contacta con el administrador.');
            setLoading(false);
            return;
          }
        }

        const rows = await fetchContainersByIds(ownContainerIds);
        if (cancelled) return;

        const visible = rows.filter((r) => r.isModuleActive);
        if (visible.length === 0) {
          setError(
            'Tus talleres no tienen esta web activa en Hub (tabla taller_web_activo) para este despliegue.',
          );
          setLoading(false);
          return;
        }

        setContainers(visible);
        if (visible.length === 1) setActiveContainer(visible[0]);
        else setLoading(false);
      } catch {
        if (!cancelled) setError('Error de conexión al cargar el listado de talleres.');
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [user, isSuperUser, preferredWorkshopIdTaller, onSelect]);

  useEffect(() => {
    if (!activeContainer) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        if (!activeContainer.isModuleActive) {
          setError('Esta licencia no tiene activada esta web. Contacta con el administrador.');
          setLoading(false);
          return;
        }

        let real: Workshop[] = [];

        if (!activeContainer.idlicenciagrupo) {
          real = [buildWorkshopFromContainer(activeContainer)];
        } else {
          const rows = await fetchLicenciaModuleTalleres(activeContainer.idlicenciagrupo);
          if (cancelled) return;
          real = rows.map((t) =>
            buildWorkshopFromLicenciaTaller(
              t,
              activeContainer.hubWebId ?? getCrmHubWebIdFromEnv(),
              activeContainer.idtaller,
            ),
          );
          if (real.length === 0) {
            setError('La licencia no tiene talleres activos para esta web.');
            setLoading(false);
            return;
          }
        }

        setWorkshops(real);

        if (real.length === 1) {
          try { localStorage.setItem(RECENT_STORAGE_KEY, real[0].id); } catch { /* ignore */ }
          onSelect(real[0]);
          return;
        }

        setLoading(false);
      } catch {
        if (!cancelled) setError('Error consultando los talleres de la licencia.');
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [activeContainer, onSelect]);

  const handleSelect = (w: Workshop) => {
    setScanning(true);
    setTimeout(() => {
      try { localStorage.setItem(RECENT_STORAGE_KEY, w.id); } catch { /* ignore */ }
      onSelect(w);
    }, 600);
  };

  const handlePickContainer = (c: ContainerRow) => {
    setActiveContainer(c);
  };

  const handleBackToContainers = () => {
    setActiveContainer(null);
    setWorkshops([]);
  };

  const filteredWorkshops = useMemo(() => {
    const searchLower = (searchQuery || '').toLowerCase();
    return workshops.filter((w) => {
      const nameMatch = (w.name || '').toLowerCase().includes(searchLower);
      const cityMatch = (w.city || '').toLowerCase().includes(searchLower);
      return nameMatch || cityMatch;
    });
  }, [workshops, searchQuery]);

  const filteredContainers = useMemo(() => {
    const q = (searchQuery || '').toLowerCase();
    return containers.filter((c) => {
      const name = (c.nombre_personalizado || c.slug || c.idtaller).toLowerCase();
      return name.includes(q);
    });
  }, [containers, searchQuery]);


  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4">
        <HexLoaderScreen label="Cargando talleres…" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card padding="lg" className="w-full max-w-md text-center">
          <h2 className="section-title">No se puede continuar</h2>
          <p className="section-subtitle mt-3">{error}</p>
          <button
            type="button"
            onClick={async () => {
              try {
                if (onLogout) await onLogout()
                else await signOut()
              } catch (e) {
                console.error('Error al cerrar sesión:', e)
              }
            }}
            className="ghost-button mt-6 w-full"
          >
            <LogOut size={18} />
            Cerrar sesión
          </button>
        </Card>
      </div>
    )
  }

  const showContainerPicker = !activeContainer && containers.length > 1

  return (
    <div className="min-h-screen">
      <header className="glass glass-lite" style={{ borderRadius: 0, borderTop: 0, borderLeft: 0, borderRight: 0 }}>
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            {headerLogoSrc ? (
              <img
                src={headerLogoSrc}
                alt=""
                className="h-10 w-auto max-w-[140px] object-contain"
                referrerPolicy="no-referrer"
              />
            ) : null}
            <div className="min-w-0">
              <p className="section-eyebrow">{getAppProductName()}</p>
              {licenseDisplayName ? <p className="section-subtitle">{licenseDisplayName}</p> : null}
            </div>
          </div>
          <button
            type="button"
            onClick={async () => {
              try {
                if (onLogout) await onLogout()
                else await signOut()
              } catch (e) {
                console.error('Error al cerrar sesión:', e)
              }
            }}
            className="ghost-action is-neutral"
          >
            <LogOut size={16} className="inline" />
            {' '}Salir
          </button>
        </div>
      </header>

      {scanning ? (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center" style={{ background: 'rgba(238,241,245,0.92)' }}>
          <HexLoaderScreen label="Abriendo taller…" />
        </div>
      ) : null}

      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6 panel-stack">
        <div>
          <p className="section-eyebrow">{showContainerPicker ? 'Licencias' : 'Talleres'}</p>
          <h1 className="section-title">
            {showContainerPicker ? 'Elige tu licencia' : 'Elige tu taller'}
          </h1>
          <p className="section-subtitle mt-2">
            {showContainerPicker
              ? 'Toca la licencia con la que quieres trabajar.'
              : 'Toca el taller que quieres gestionar hoy.'}
          </p>
        </div>

        {!showContainerPicker && activeContainer && containers.length > 1 ? (
          <button type="button" onClick={handleBackToContainers} className="ghost-button w-fit">
            <ChevronLeft size={18} />
            Volver a licencias
          </button>
        ) : null}

        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)]" size={20} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={showContainerPicker ? 'Buscar licencia…' : 'Buscar taller…'}
            className="field-input pl-12"
          />
        </div>

        <ul className="panel-stack list-none p-0">
          {showContainerPicker
            ? filteredContainers.map((c) => (
                <li key={c.idtaller}>
                  <button
                    type="button"
                    onClick={() => handlePickContainer(c)}
                    className="list-row flex w-full items-center justify-between gap-3"
                  >
                    <span className="list-row-title">
                      {c.nombre_personalizado || c.slug || c.idtaller}
                    </span>
                    <ArrowRight size={22} className="shrink-0" style={{ color: 'var(--color-brand)' }} />
                  </button>
                </li>
              ))
            : filteredWorkshops.map((workshop) => {
                const isRecent = workshop.id === lastWorkshopId
                return (
                  <li key={workshop.id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(workshop)}
                      className={`list-row flex w-full items-center justify-between gap-3 ${isRecent ? 'is-active' : ''}`}
                    >
                      <div className="min-w-0 text-left">
                        <p className="list-row-title">{workshop.name}</p>
                        {(workshop.city || workshop.address) && (
                          <p className="list-row-meta mt-1">
                            {[workshop.city, workshop.address].filter(Boolean).join(' · ')}
                          </p>
                        )}
                        {isRecent ? (
                          <p className="list-row-meta mt-1" style={{ color: 'var(--color-brand)' }}>
                            Usado la última vez
                          </p>
                        ) : null}
                      </div>
                      <ArrowRight size={22} className="shrink-0" style={{ color: 'var(--color-brand)' }} />
                    </button>
                  </li>
                )
              })}
        </ul>

        {(showContainerPicker ? filteredContainers.length === 0 : filteredWorkshops.length === 0) && (
          <EmptyState onClear={() => setSearchQuery('')} />
        )}
      </main>
    </div>
  )
}

const EmptyState: React.FC<{ onClear: () => void }> = ({ onClear }) => (
  <Card padding="lg" className="text-center">
    <Building2 size={36} className="mx-auto mb-4 text-[var(--muted)]" />
    <h3 className="section-title">No hay resultados</h3>
    <p className="section-subtitle mt-2">Prueba con otro nombre o borra la búsqueda.</p>
    <button type="button" onClick={onClear} className="ghost-button mt-6">
      Borrar búsqueda
    </button>
  </Card>
)

export default WorkshopSelectorView

/**
 * WorkshopSelector — modelo Hub Connect (contenedor + RPC de talleres reales).
 * Ajusta copys en `src/lib/appIdentity.ts` o vía `VITE_APP_*`.
 */

import React, { useEffect, useMemo, useState } from 'react';
import type { Workshop } from '../types';
import {
  Loader2, LogOut, Search as SearchIcon, MapPin, ArrowRight, ShieldCheck,
  RefreshCcw, Globe, Activity, Command, ChevronLeft, AlertTriangle, Building2,
  Info,
} from 'lucide-react';
import { isGlobalAviAdmin } from '../lib/operationsConnect';
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
  getAppFooterStamp,
  getAppProductAccentLine,
  getAppProductName,
  getWorkshopSelectorTaglineDefault,
} from '../lib/appIdentity';
import type { TallerBranding } from '../lib/tallerBranding';
import type { BrandingFullscreenHero } from '../lib/brandingVisual';
import {
  brandingFullscreenHeroStyle,
  hexToRgba,
  safeBrandHex,
} from '../lib/brandingVisual';

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

function SelectorBackdrop({ hero }: { hero: BrandingFullscreenHero | null }) {
  if (hero) {
    return (
      <div className="pointer-events-none fixed inset-0 z-0" style={hero.overlayStyle} aria-hidden />
    );
  }
  return (
    <div className="fixed inset-0 pointer-events-none z-0">
      <div className="absolute -top-[10%] left-[10%] h-[40%] w-[40%] rounded-full bg-teal-500/5 blur-[120px]" />
      <div className="absolute top-[20%] right-[5%] h-[30%] w-[30%] rounded-full bg-blue-500/5 blur-[100px]" />
    </div>
  );
}

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

  const isSuperUser = useMemo(() => isGlobalAviAdmin({ user }), [user]);

  const hero = useMemo(
    () => brandingFullscreenHeroStyle(licenseBranding ?? null),
    [licenseBranding],
  );

  const headerLogoSrc = (licenseBranding?.logo_url ?? '').trim() || (hubWebIconUrl ?? '').trim() || '';
  const fallbackIconBg = safeBrandHex(licenseBranding?.primary_color);

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

  const adminAviRootFlat = useMemo(
    () =>
      isSuperUser &&
      !preferredWorkshopIdTaller &&
      workshops.length > 0 &&
      containers.length === 0 &&
      !activeContainer,
    [isSuperUser, preferredWorkshopIdTaller, workshops.length, containers.length, activeContainer],
  );

  const bgMain = isDarkMode ? 'bg-[#020617]' : 'bg-slate-50';
  const textPrimary = isDarkMode ? 'text-white' : 'text-slate-900';
  const textSecondary = isDarkMode ? 'text-slate-400' : 'text-slate-600';

  if (loading) {
    return (
      <div
        className={`h-screen relative flex flex-col items-center justify-center overflow-hidden p-4 font-sans ${hero ? '' : bgMain}`}
        style={hero?.outerStyle}
      >
        <SelectorBackdrop hero={hero} />
        <Loader2 size={32} className="relative z-10 text-teal-500 animate-spin mb-4" />
        <p className={`relative z-10 ${textSecondary} text-sm font-medium animate-pulse`}>
          Sincronizando red de terminales...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={`h-screen relative flex flex-col items-center justify-center overflow-hidden p-6 font-sans ${hero ? '' : bgMain}`}
        style={hero?.outerStyle}
      >
        <SelectorBackdrop hero={hero} />
        <div
          className={`relative z-10 w-full max-w-md rounded-2xl border ${isDarkMode ? 'border-rose-500/30 bg-rose-500/5' : 'border-rose-300 bg-rose-50'} p-6 text-center`}
        >
          <div className="flex justify-center mb-3">
            <div className="p-3 rounded-full bg-rose-500/15">
              <AlertTriangle className="text-rose-400" size={24} />
            </div>
          </div>
          <h3 className={`text-lg font-bold ${textPrimary} mb-2`}>No se puede acceder</h3>
          <p className={`${textSecondary} text-sm mb-5`}>{error}</p>
          <button
            type="button"
            onClick={async () => {
              try {
                if (onLogout) await onLogout();
                else await signOut();
              } catch (e) {
                console.error('Error al cerrar sesión:', e);
              }
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 hover:bg-rose-500/20 text-sm font-bold uppercase tracking-wider"
          >
            <LogOut size={14} />
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  const showContainerPicker = !activeContainer && containers.length > 1;

  return (
    <div
      className={`h-screen flex flex-col items-center justify-start relative overflow-y-auto no-scrollbar font-sans ${hero ? '' : bgMain}`}
      style={hero?.outerStyle}
    >
      <SelectorBackdrop hero={hero} />

      {scanning && (
        <div className={`fixed inset-0 ${isDarkMode ? 'bg-slate-950/60' : 'bg-slate-900/40'} backdrop-blur-md z-[100] flex flex-col items-center justify-center animate-fade-in`}>
          <Loader2 size={40} className="text-teal-400 animate-spin mb-4" />
          <p className="text-teal-400 font-bold tracking-widest text-xs uppercase">Estableciendo conexión segura...</p>
        </div>
      )}

      <div className="w-full flex justify-between items-center py-4 sm:py-6 px-4 sm:px-8 relative z-10 shrink-0">
        <div className="flex min-w-0 items-start gap-2 sm:gap-3">
          {headerLogoSrc ? (
            <img
              src={headerLogoSrc}
              alt={licenseDisplayName || getAppProductName()}
              className="h-10 w-auto max-w-[160px] shrink-0 object-contain md:max-w-[200px]"
              referrerPolicy="no-referrer"
              crossOrigin={(licenseBranding?.logo_url ?? '').trim() ? 'anonymous' : undefined}
            />
          ) : (
            <div
              className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center shadow-lg"
              style={{
                backgroundColor: fallbackIconBg,
                boxShadow: `0 10px 15px -3px ${hexToRgba(fallbackIconBg, 0.25)}`,
              }}
            >
              <Activity size={18} className="text-white" />
            </div>
          )}
          <div className="min-w-0">
            <h2 className={`${textPrimary} flex flex-wrap items-center gap-x-2 font-black text-sm uppercase tracking-tighter`}>
              <span>{getAppProductName()}</span>
              {getAppProductAccentLine() ? (
                <span className="text-app-accent normal-case tracking-normal">{getAppProductAccentLine()}</span>
              ) : null}
            </h2>
            {licenseDisplayName ? (
              <p
                className={`mt-1 max-w-[14rem] truncate text-xs font-medium sm:max-w-xs ${hero ? 'text-white/80' : textSecondary}`}
                title={licenseDisplayName}
              >
                {licenseDisplayName}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="hidden sm:flex flex-col items-end">
            <span className={`text-[10px] font-bold ${textSecondary} uppercase tracking-widest`}>Operador</span>
            <span className={`text-xs ${textSecondary} font-medium`}>{(user as any)?.email}</span>
          </div>
          <button
            type="button"
            onClick={async () => {
              try {
                if (onLogout) await onLogout();
                else await signOut();
              } catch (e) {
                console.error('Error al cerrar sesión:', e);
              }
            }}
            className={`p-2.5 ${textSecondary} hover:text-rose-400 ${isDarkMode ? 'bg-slate-900/50 hover:bg-rose-500/10 border-slate-800' : 'bg-slate-200/80 hover:bg-rose-50 border-slate-300'} border rounded-xl transition-all`}
            title="Cerrar Sesión"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>

      <div className="max-w-5xl w-full px-3 sm:px-6 z-10 relative flex-1">
        <div className="text-center mt-4 sm:mt-8 mb-6 sm:mb-12 animate-fade-in-down">
          <h1 className={`text-2xl sm:text-3xl md:text-4xl font-black ${textPrimary} mb-3 sm:mb-4 tracking-tight font-montserrat`}>
            {showContainerPicker
              ? <>Selecciona <span className="text-teal-500">tu licencia</span></>
              : <>Selecciona tu <span className="text-teal-500">Terminal de Trabajo</span></>}
          </h1>
          <p className={`${textSecondary} text-xs sm:text-sm max-w-xl mx-auto font-medium`}>
            {showContainerPicker
              ? 'Tienes acceso a varias licencias del Hub. Elige una para continuar.'
              : adminAviRootFlat
                ? 'Vista administrador global: talleres con esta web activa en Hub (añadirás aquí tus listados y acciones).'
                : activeContainer?.nombre_personalizado
                  ? `Talleres activos en ${activeContainer.nombre_personalizado}.`
                  : getWorkshopSelectorTaglineDefault()}
          </p>
          {!isSuperUser && (
            <p
              className={`${textSecondary} text-[11px] max-w-lg mx-auto mt-3 flex items-start justify-center gap-2 text-center leading-snug`}
              title="Las webs y talleres que ves dependen de tu acceso en Hub Connect (JWT connect_site_ids). Los cambios de acceso se gestionan desde Connect / panel Hub, no solo desde esta aplicación."
            >
              <Info size={14} className="shrink-0 mt-0.5 opacity-70" aria-hidden />
              <span>
                Lista acotada por Hub Connect. Para cambiar qué webs ves, usa Connect / panel Hub.
              </span>
            </p>
          )}
        </div>

        {!showContainerPicker && activeContainer && containers.length > 1 && (
          <div className="mb-6 flex justify-center">
            <button
              type="button"
              onClick={handleBackToContainers}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border ${isDarkMode ? 'bg-slate-900/50 border-slate-800 text-slate-300 hover:text-teal-400' : 'bg-white border-slate-200 text-slate-700 hover:text-teal-600'} text-xs font-bold uppercase tracking-wider transition-all`}
            >
              <ChevronLeft size={14} />
              Cambiar de licencia
            </button>
          </div>
        )}

        <div className="mb-6 sm:mb-10 space-y-3 sm:space-y-4 animate-fade-in">
          <div className="relative group max-w-2xl mx-auto">
            <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-teal-500 transition-colors" size={20} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={showContainerPicker ? 'Buscar licencia...' : 'Buscar por nombre o ciudad...'}
              className={`w-full ${isDarkMode ? 'bg-slate-900/40 border-slate-800 text-white placeholder:text-slate-600' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'} backdrop-blur-xl border focus:border-teal-500/50 rounded-2xl py-4 pl-12 pr-4 text-base outline-none transition-all shadow-2xl`}
            />
            <div className={`absolute right-4 top-1/2 -translate-y-1/2 hidden md:flex items-center gap-1 px-2 py-1 ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-200 border-slate-300'} rounded-md border`}>
              <Command size={10} className={textSecondary} />
              <span className={`text-[10px] font-bold ${textSecondary}`}>F</span>
            </div>
          </div>
        </div>

        {showContainerPicker ? (
          filteredContainers.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-20">
              {filteredContainers.map((c, idx) => (
                <button
                  key={c.idtaller}
                  type="button"
                  onClick={() => handlePickContainer(c)}
                  className={`text-left ${isDarkMode ? 'bg-slate-900/40 border-slate-800/60 hover:bg-slate-800/40' : 'bg-white border-slate-200 hover:bg-slate-50'} backdrop-blur-xl border hover:border-teal-500/50 hover:translate-y-[-4px] cursor-pointer transition-all duration-300 group p-6 rounded-[1.5rem] flex flex-col relative overflow-hidden animate-fade-in-up shadow-sm`}
                  style={{ animationDelay: `${idx * 30}ms` }}
                >
                  <div className="flex items-center gap-4 mb-6">
                    <div className={`w-12 h-12 rounded-xl ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-300'} border flex items-center justify-center font-black text-lg group-hover:border-teal-500/40 ${isDarkMode ? 'text-white' : 'text-slate-700'}`}>
                      {(c.nombre_personalizado || c.slug || 'L').charAt(0).toUpperCase()}
                    </div>
                    <div className="flex flex-col">
                      <span className={`text-[9px] font-black px-2 py-0.5 rounded-md border tracking-widest uppercase w-fit mb-1 bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/30`}>
                        Licencia
                      </span>
                      <h3 className={`font-bold ${textPrimary} text-base group-hover:text-teal-400 transition-colors leading-tight`}>
                        {c.nombre_personalizado || c.slug || c.idtaller}
                      </h3>
                    </div>
                  </div>
                  {c.slug && (
                    <div className="flex items-center gap-2 text-xs text-slate-500 mb-4">
                      <Globe size={12} />/{c.slug}
                    </div>
                  )}
                  <div className={`mt-auto pt-4 border-t ${isDarkMode ? 'border-slate-800/50' : 'border-slate-200'} flex items-center justify-between`}>
                    <div className="flex items-center gap-2 text-emerald-500/60">
                      <ShieldCheck size={14} />
                      <span className="text-[10px] font-bold uppercase tracking-widest">Hub Connect</span>
                    </div>
                    <div className="text-teal-400 transform group-hover:translate-x-1 transition-transform">
                      <ArrowRight size={18} />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState textPrimary={textPrimary} textSecondary={textSecondary} isDarkMode={isDarkMode} onClear={() => setSearchQuery('')} />
          )
        ) : (
          filteredWorkshops.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-20">
              {filteredWorkshops.map((workshop, idx) => {
                const isRecent = workshop.id === lastWorkshopId;
                return (
                  <div
                    key={workshop.id}
                    onClick={() => handleSelect(workshop)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') handleSelect(workshop);
                    }}
                    className={`${isDarkMode ? 'bg-slate-900/40 border-slate-800/60 hover:bg-slate-800/40' : 'bg-white border-slate-200 hover:bg-slate-50'} backdrop-blur-xl border hover:border-teal-500/50 hover:translate-y-[-4px] cursor-pointer transition-all duration-300 group p-6 rounded-[1.5rem] flex flex-col relative overflow-hidden animate-fade-in-up shadow-sm ${isRecent ? 'ring-2 ring-teal-500/40 bg-teal-500/5' : ''}`}
                    style={{ animationDelay: `${idx * 30}ms` }}
                  >
                    {isRecent && (
                      <div className="absolute top-0 right-0 px-3 py-1 bg-teal-500 text-white text-[9px] font-black uppercase tracking-tighter rounded-bl-lg animate-pulse">
                        Último Acceso
                      </div>
                    )}
                    <div className="flex items-center gap-4 mb-6">
                      <div className={`w-12 h-12 rounded-xl ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-300'} border flex items-center justify-center font-black text-lg transition-colors shadow-inner ${isRecent ? 'border-teal-500/40 text-teal-600' : 'group-hover:border-teal-500/40'} ${isDarkMode ? 'text-white' : 'text-slate-700'}`}>
                        {workshop.name?.charAt(0) || 'T'}
                      </div>
                      <div className="flex flex-col">
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-md border tracking-widest uppercase w-fit mb-1 ${
                          workshop.source === 'main' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' :
                          workshop.source === 'starmadrid' ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30' :
                          'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'
                        }`}>
                          {workshop.source}
                        </span>
                        <h3 className={`font-bold ${textPrimary} text-base group-hover:text-teal-400 transition-colors leading-tight`}>{workshop.name}</h3>
                      </div>
                    </div>
                    <div className="space-y-3 mb-6">
                      <div className={`flex items-start gap-2.5 ${textSecondary} group-hover:text-slate-500 transition-colors`}>
                        <MapPin size={14} className="mt-0.5 shrink-0" />
                        <div className="flex flex-col">
                          <span className={`text-xs font-bold ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>{workshop.city || 'Ubicación no disp.'}</span>
                          <span className="text-[11px] truncate max-w-[180px]">{workshop.address || 'Punto de acceso a red'}</span>
                        </div>
                      </div>
                    </div>
                    <div className={`mt-auto pt-4 border-t ${isDarkMode ? 'border-slate-800/50' : 'border-slate-200'} flex items-center justify-between`}>
                      <div className="flex items-center gap-2 text-emerald-500/60">
                        <ShieldCheck size={14} />
                        <span className="text-[10px] font-bold uppercase tracking-widest">Enlace Seguro</span>
                      </div>
                      <div className="flex items-center gap-2 text-teal-400">
                        {isRecent ? (
                          <div className="flex items-center gap-2 px-3 py-1 bg-teal-500/10 rounded-full border border-teal-500/30 text-[10px] font-black uppercase">
                            <RefreshCcw size={10} className="animate-spin-slow" />
                            Reconectar
                          </div>
                        ) : (
                          <div className="text-teal-400 transform group-hover:translate-x-1 transition-transform">
                            <ArrowRight size={18} />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState textPrimary={textPrimary} textSecondary={textSecondary} isDarkMode={isDarkMode} onClear={() => setSearchQuery('')} />
          )
        )}
      </div>

      <div className="w-full py-6 sm:py-8 px-4 sm:px-12 border-t border-slate-900 flex flex-col sm:flex-row justify-center items-center gap-2 relative z-10 opacity-40 hover:opacity-70 transition-opacity shrink-0">
        <p className="text-[10px] font-bold text-slate-600 text-center uppercase tracking-[0.15em]">
          <span>{getAppProductName()}</span>
          {getAppProductAccentLine() ? (
            <>
              {' '}
              · <span className="text-app-accent normal-case">{getAppProductAccentLine()}</span>
            </>
          ) : null}
          <span>{` · ${getAppFooterStamp()}`}</span>
        </p>
      </div>
    </div>
  );
};

const EmptyState: React.FC<{
  textPrimary: string;
  textSecondary: string;
  isDarkMode: boolean;
  onClear: () => void;
}> = ({ textPrimary, textSecondary, isDarkMode, onClear }) => (
  <div className="flex-1 flex flex-col items-center justify-center py-20 animate-fade-in text-center">
    <div className={`p-6 rounded-full mb-6 border ${isDarkMode ? 'bg-slate-900/50 border-slate-800' : 'bg-slate-100 border-slate-300'}`}>
      <Building2 size={32} className={textSecondary} />
    </div>
    <h3 className={`text-xl font-bold ${textPrimary} mb-2`}>No se han encontrado terminales</h3>
    <p className={`${textSecondary} text-sm max-w-xs mx-auto`}>Prueba a cambiar la búsqueda.</p>
    <button
      type="button"
      onClick={onClear}
      className="mt-6 text-teal-400 text-xs font-bold uppercase tracking-widest hover:text-teal-300 underline underline-offset-4"
    >
      Limpiar búsqueda
    </button>
  </div>
);

export default WorkshopSelectorView;

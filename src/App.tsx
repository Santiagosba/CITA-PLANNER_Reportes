import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { Loader2 } from 'lucide-react'
import { supabase } from './lib/supabase'
import { CRM_FAVICON_FALLBACK_HREF, fetchCrmHubWebBranding, type CrmHubWebBranding } from './lib/crmHubWebBranding'
import { HUB_WEB_PATH_SYNC_EVENT, replaceStateToRoot } from './lib/urlSync'
import { parseWorkshopSlugFromPathname } from './lib/routePath'
import { applyTealAccentVars } from './lib/brandTheme'
import {
  hydrateBrandAccentFromStorage,
  applyUiBrandingAccentPalette,
  applyLicenseUiBrandingCssVars,
} from './lib/crmAccentTheme'
import {
  fetchRouteBySlug,
  fetchConnectRouteByContainerId,
  fetchSlugForTaller,
  userMayAccessTaller,
  isGlobalAviAdmin,
  type ConnectRoute,
} from './lib/operationsConnect'
import { parseConnectSiteIds, scopedSitesEmptyDenied } from './lib/connectSiteScope'
import type { SlugBrandingContext } from './lib/licenseBrandingContext'
import { buildSlugBrandingContext } from './lib/licenseBrandingContext'
import { resolveNonAdminBaseRoute } from './lib/licenciaGrupo'
import { fetchTallerBranding, brandingContainerId } from './lib/tallerBranding'
import { signOut } from './utils/auth'
import DashboardShell from './views/DashboardShell'
import LoginView from './views/LoginView'
import WorkshopSelectorView from './views/WorkshopSelectorView'
import type { Workshop } from './types'

type LoginNotice = {
  kind: 'error' | 'info'
  message: string
}

async function redirectNonAdminUserToBaseUrl(
  session: { user?: unknown },
  setSlugBranding: Dispatch<SetStateAction<SlugBrandingContext | null>>,
  setPreferredWorkshopIdTaller: Dispatch<SetStateAction<string | null>>,
  setLoginNotice: Dispatch<SetStateAction<LoginNotice | null>>,
): Promise<void> {
  if (scopedSitesEmptyDenied(parseConnectSiteIds(session?.user))) {
    replaceStateToRoot(null)
    setSlugBranding(null)
    setPreferredWorkshopIdTaller(null)
    setLoginNotice({
      kind: 'error',
      message:
        'Tu cuenta no tiene webs asignadas en Hub Connect. Solicita acceso desde el panel Hub.',
    })
    return
  }

  const base = await resolveNonAdminBaseRoute(session)

  if (!base) {
    replaceStateToRoot(null)
    setSlugBranding(null)
    setPreferredWorkshopIdTaller(null)
    setLoginNotice({
      kind: 'error',
      message: 'Tu usuario no tiene un taller asignado en esta web.',
    })
    return
  }

  if (base.slug) {
    const ctx = await buildSlugBrandingContext(base.slug)
    replaceStateToRoot(base.slug)
    setSlugBranding(ctx)
    setPreferredWorkshopIdTaller(ctx?.idtaller ?? base.containerIdTaller)
  } else {
    replaceStateToRoot(null)
    setSlugBranding(null)
    setPreferredWorkshopIdTaller(null)
  }

  setLoginNotice({
    kind: 'info',
    message: 'La URL no corresponde a tu taller. Se ha restaurado tu enlace.',
  })
}

const THEME_KEY = 'hub_web_theme'

export default function App() {
  const [session, setSession] = useState<unknown>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [bootLoading, setBootLoading] = useState(true)
  const [urlPathname, setUrlPathname] = useState(() =>
    typeof window !== 'undefined' ? window.location.pathname : '/',
  )
  const [slugBranding, setSlugBranding] = useState<SlugBrandingContext | null>(null)
  const [preferredWorkshopIdTaller, setPreferredWorkshopIdTaller] = useState<string | null>(null)
  const [loginNotice, setLoginNotice] = useState<LoginNotice | null>(null)
  const accessCheckInFlight = useRef(false)
  const firstSlugResolveDone = useRef(false)
  const lastPathSlugRef = useRef<string | null | undefined>(undefined)
  const faviconAppliedFor = useRef<string | null>(null)

  const [selectedWorkshop, setSelectedWorkshop] = useState<Workshop | null>(null)
  const [licenseLogoUrl, setLicenseLogoUrl] = useState<string | null>(null)
  const [crmHubWebBranding, setCrmHubWebBranding] = useState<CrmHubWebBranding | null>(null)
  const [isDarkMode, setIsDarkMode] = useState(() => {
    try {
      return localStorage.getItem(THEME_KEY) === 'dark'
    } catch {
      return false
    }
  })

  const hubIcon = (import.meta.env.VITE_HUB_WEB_ICON_URL ?? '').trim() || null

  useEffect(() => {
    applyTealAccentVars()
    hydrateBrandAccentFromStorage()
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const row = await fetchCrmHubWebBranding()
      if (!cancelled) setCrmHubWebBranding(row)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  /** Favicon: env override → icono Hub (`hub_webs`) → logo de licencia (`ui_branding`), fallback estático. */
  useEffect(() => {
    if (typeof document === 'undefined') return

    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (!link) {
      link = document.createElement('link')
      link.rel = 'icon'
      document.head.appendChild(link)
    }
    if (!link.dataset.defaultHref) {
      link.dataset.defaultHref = link.getAttribute('href')?.trim() || CRM_FAVICON_FALLBACK_HREF
    }

    const hubIconEnv = hubIcon?.trim()
    const hubRowIcon = (crmHubWebBranding?.icon_image_url || '').trim()
    const licenseLogo = (
      licenseLogoUrl?.trim() ||
      (slugBranding?.branding?.logo_url as string | undefined)?.trim() ||
      ''
    ).trim()
    const desired = hubIconEnv || hubRowIcon || licenseLogo
    const fallback = link.dataset.defaultHref || CRM_FAVICON_FALLBACK_HREF

    if (desired) {
      if (faviconAppliedFor.current !== desired) {
        const base = desired.split(/[?#]/)[0]?.toLowerCase() ?? ''
        if (base.endsWith('.svg')) link.type = 'image/svg+xml'
        else if (base.endsWith('.png')) link.type = 'image/png'
        else link.removeAttribute('type')
        link.setAttribute('href', desired)
        faviconAppliedFor.current = desired
      }
    } else if (faviconAppliedFor.current !== null || link.getAttribute('href') !== fallback) {
      link.setAttribute('href', fallback)
      faviconAppliedFor.current = null
    }

    return () => {
      if (link && link.dataset.defaultHref) link.setAttribute('href', link.dataset.defaultHref)
    }
  }, [hubIcon, slugBranding, licenseLogoUrl, crmHubWebBranding])

  useEffect(() => {
    const sync = () => setUrlPathname(window.location.pathname)
    window.addEventListener('popstate', sync)
    window.addEventListener(HUB_WEB_PATH_SYNC_EVENT, sync)
    return () => {
      window.removeEventListener('popstate', sync)
      window.removeEventListener(HUB_WEB_PATH_SYNC_EVENT, sync)
    }
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode)
    try {
      localStorage.setItem(THEME_KEY, isDarkMode ? 'dark' : 'light')
    } catch {
      /* ignore */
    }
  }, [isDarkMode])

  /** Branding pre-login según pathname (`/<slug>` → taller + ui_branding). */
  useEffect(() => {
    const pathSlug = parseWorkshopSlugFromPathname(urlPathname)
    if (lastPathSlugRef.current !== pathSlug) {
      const prevPathSlug = lastPathSlugRef.current
      lastPathSlugRef.current = pathSlug
      const switchedBetweenTwoSlugs =
        prevPathSlug != null &&
        pathSlug != null &&
        String(prevPathSlug).toLowerCase() !== String(pathSlug).toLowerCase()
      const leftSlugForRoot = pathSlug == null && prevPathSlug != null && prevPathSlug !== undefined
      if (switchedBetweenTwoSlugs || leftSlugForRoot) {
        setPreferredWorkshopIdTaller(null)
      }
    }

    const slugMatchesPath = (prev: SlugBrandingContext | null) => {
      if (!pathSlug || !prev?.slug) return false
      return String(prev.slug).trim().toLowerCase() === String(pathSlug).toLowerCase()
    }

    setSlugBranding((prev) => {
      if (pathSlug) {
        if (prev && slugMatchesPath(prev)) return prev
        if (prev && !slugMatchesPath(prev)) return null
        return null
      }
      if (prev?.resolvedFromPath) return null
      return prev
    })

    let cancelled = false
    void (async () => {
      try {
        if (pathSlug) {
          const route = await fetchRouteBySlug(pathSlug)
          if (cancelled) return
          if (route) {
            const branding = await fetchTallerBranding(route.idtaller)
            if (cancelled) return
            setSlugBranding((prev) => {
              if (prev && slugMatchesPath(prev) && prev.idtaller === route.idtaller) {
                if (prev.resolvedFromPath && prev.branding) return prev
              }
              return {
                slug: String(route.slug || '').trim().toLowerCase(),
                idtaller: route.idtaller,
                displayName: route.nombrePersonalizado,
                branding,
                resolvedFromPath: true,
              }
            })
          } else {
            replaceStateToRoot(null)
            setLoginNotice({
              kind: 'info',
              message: 'La URL del taller no existe. Cargando login general.',
            })
            setSlugBranding(null)
          }
        } else if (!cancelled) {
          setSlugBranding((prev) => {
            if ((session as any)?.user && prev?.idtaller && !String(prev.slug || '').trim()) {
              return prev
            }
            return null
          })
        }
      } finally {
        if (!firstSlugResolveDone.current) {
          firstSlugResolveDone.current = true
          setBootLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [urlPathname, (session as any)?.user?.id])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const {
        data: { session: s },
      } = await supabase.auth.getSession()
      if (cancelled) return
      setSession(s)
      if ((s?.user as any)?.user_metadata?.calendar_theme != null) {
        const theme = (s!.user as any).user_metadata.calendar_theme === 'dark'
        setIsDarkMode(theme)
        try {
          localStorage.setItem(THEME_KEY, theme ? 'dark' : 'light')
        } catch (_) {
          /* ignore */
        }
      }
      setAuthLoading(false)
    })()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      if (!newSession) {
        setSelectedWorkshop(null)
        setPreferredWorkshopIdTaller(null)
      }
      if (_event === 'SIGNED_OUT') {
        replaceStateToRoot(null)
      }
      if ((newSession?.user as any)?.user_metadata?.calendar_theme != null) {
        const theme = (newSession!.user as any).user_metadata.calendar_theme === 'dark'
        setIsDarkMode(theme)
        try {
          localStorage.setItem(THEME_KEY, theme ? 'dark' : 'light')
        } catch (_) {
          /* ignore */
        }
      }
      setAuthLoading(false)
    })
    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (bootLoading || authLoading) return
    if (!(session as any)?.user) return
    if (parseWorkshopSlugFromPathname(urlPathname)) return
    if (isGlobalAviAdmin(session as any)) return

    let cancelled = false
    void (async () => {
      if (scopedSitesEmptyDenied(parseConnectSiteIds((session as any)?.user))) {
        try {
          await signOut()
        } catch {
          /* ignore */
        }
        if (!cancelled) {
          setSession(null)
          setPreferredWorkshopIdTaller(null)
          setSlugBranding(null)
          setLoginNotice({
            kind: 'error',
            message:
              'Tu cuenta no tiene webs asignadas en Hub Connect. Solicita acceso desde el panel Hub.',
          })
        }
        return
      }

      const base = await resolveNonAdminBaseRoute(session as any)
      if (cancelled) return
      if (!base) {
        try {
          await signOut()
        } catch {
          /* ignore */
        }
        if (!cancelled) {
          setSession(null)
          setPreferredWorkshopIdTaller(null)
          setSlugBranding(null)
          setLoginNotice({
            kind: 'error',
            message: 'Email o contraseña incorrectos.',
          })
        }
        return
      }

      if (base.slug) {
        const ctx = await buildSlugBrandingContext(base.slug, { resolvedFromPath: false })
        if (cancelled) return
        if (!ctx) {
          try {
            await signOut()
          } catch {
            /* ignore */
          }
          if (!cancelled) {
            setSession(null)
            setPreferredWorkshopIdTaller(null)
            setSlugBranding(null)
            setLoginNotice({
              kind: 'error',
              message: 'Email o contraseña incorrectos.',
            })
          }
          return
        }
        const normalized = { ...ctx, slug: String(ctx.slug || '').trim().toLowerCase() }
        replaceStateToRoot(normalized.slug)
        setSlugBranding(normalized)
        setPreferredWorkshopIdTaller(normalized.idtaller)
        return
      }

      const route = await fetchConnectRouteByContainerId(base.containerIdTaller)
      if (cancelled) return
      if (!route) {
        try {
          await signOut()
        } catch {
          /* ignore */
        }
        if (!cancelled) {
          setSession(null)
          setPreferredWorkshopIdTaller(null)
          setSlugBranding(null)
          setLoginNotice({
            kind: 'error',
            message: 'Email o contraseña incorrectos.',
          })
        }
        return
      }
      const branding = await fetchTallerBranding(route.idtaller)
      if (cancelled) return
      replaceStateToRoot(null)
      setSlugBranding({
        slug: route.slug ? String(route.slug).trim().toLowerCase() : '',
        idtaller: route.idtaller,
        displayName: route.nombrePersonalizado,
        branding,
        resolvedFromPath: false,
      })
      setPreferredWorkshopIdTaller(route.idtaller)
    })()

    return () => {
      cancelled = true
    }
  }, [bootLoading, authLoading, session, urlPathname])

  useEffect(() => {
    if (bootLoading || authLoading) return
    if (!(session as any)?.user) return
    if (!slugBranding) return
    if (selectedWorkshop) return
    if (preferredWorkshopIdTaller === slugBranding.idtaller) return
    if (accessCheckInFlight.current) return

    accessCheckInFlight.current = true
    let cancelled = false

    void (async () => {
      try {
        const slugTrim = (slugBranding.slug || '').trim()
        const route: ConnectRoute | null = slugTrim
          ? await fetchRouteBySlug(slugTrim)
          : await fetchConnectRouteByContainerId(slugBranding.idtaller)
        if (cancelled) return
        if (!route) {
          setSlugBranding(null)
          replaceStateToRoot(null)
          setLoginNotice({
            kind: 'info',
            message: 'La URL del taller no existe. Cargando login general.',
          })
          return
        }

        const legacyId =
          (((session as any).user?.user_metadata?.legacy_id as string | undefined) ?? null)
        const allowed = await userMayAccessTaller(session as any, route.idtaller, legacyId)
        if (cancelled) return

        if (allowed) {
          setPreferredWorkshopIdTaller(route.idtaller)
        } else if (!cancelled) {
          if (isGlobalAviAdmin(session as any)) {
            replaceStateToRoot(null)
            setSlugBranding(null)
            setPreferredWorkshopIdTaller(null)
            setLoginNotice({
              kind: 'info',
              message: 'No se pudo validar el taller de la URL. Acceso general.',
            })
          } else {
            await redirectNonAdminUserToBaseUrl(session as any, setSlugBranding, setPreferredWorkshopIdTaller, setLoginNotice)
          }
        }
      } finally {
        accessCheckInFlight.current = false
      }
    })()

    return () => {
      cancelled = true
    }
  }, [bootLoading, authLoading, session, slugBranding, selectedWorkshop, preferredWorkshopIdTaller])

  useEffect(() => {
    if (bootLoading || authLoading || !(session as any)?.user || isGlobalAviAdmin(session as any)) return

    let cancelled = false
    const legacyId = (((session as any).user?.user_metadata?.legacy_id as string | undefined) ?? null)

    const enforce = async () => {
      const pathSlug = parseWorkshopSlugFromPathname(urlPathname)
      if (!pathSlug) return

      const route = await fetchRouteBySlug(pathSlug)
      if (cancelled) return

      const allowed = !!route && (await userMayAccessTaller(session as any, route.idtaller, legacyId))
      if (allowed) return

      await redirectNonAdminUserToBaseUrl(session as any, setSlugBranding, setPreferredWorkshopIdTaller, setLoginNotice)
    }

    void enforce()
    return () => {
      cancelled = true
    }
  }, [bootLoading, authLoading, session, urlPathname])

  useEffect(() => {
    if (bootLoading) return
    let cancelled = false

    void (async () => {
      if (!selectedWorkshop) {
        const s = slugBranding?.slug?.trim()
        if (s) {
          replaceStateToRoot(s)
          return
        }
        const pathSlug = parseWorkshopSlugFromPathname(
          typeof window !== 'undefined' ? window.location.pathname : urlPathname,
        )
        if ((session as any)?.user && pathSlug) {
          return
        }
        replaceStateToRoot(null)
        return
      }
      const idtaller = String(selectedWorkshop.originalId || '')
      if (!idtaller) {
        replaceStateToRoot(slugBranding?.slug?.trim() || null)
        return
      }
      const containerSlug = slugBranding?.slug?.trim()
      if (containerSlug) {
        replaceStateToRoot(containerSlug)
        return
      }
      const slug = await fetchSlugForTaller(idtaller)
      if (cancelled) return
      if (slug?.trim()) {
        replaceStateToRoot(slug.trim())
        return
      }
      const pathSlugLive = parseWorkshopSlugFromPathname(
        typeof window !== 'undefined' ? window.location.pathname : urlPathname,
      )
      if ((session as any)?.user && pathSlugLive) return
      replaceStateToRoot(null)
    })()

    return () => {
      cancelled = true
    }
  }, [bootLoading, selectedWorkshop, slugBranding, (session as any)?.user, urlPathname])

  useEffect(() => {
    if (selectedWorkshop) return
    if (!slugBranding?.branding) {
      applyLicenseUiBrandingCssVars(null)
      return
    }
    applyUiBrandingAccentPalette(slugBranding.branding)
    applyLicenseUiBrandingCssVars(slugBranding.branding)
  }, [slugBranding, selectedWorkshop])

  useEffect(() => {
    if (!selectedWorkshop) {
      setLicenseLogoUrl(null)
      return
    }
    const id = brandingContainerId(selectedWorkshop)
    if (!id) {
      setLicenseLogoUrl(null)
      return
    }
    let cancelled = false
    void fetchTallerBranding(id).then((b) => {
      if (!cancelled) setLicenseLogoUrl((b?.logo_url || '').trim() || null)
    })
    return () => {
      cancelled = true
    }
  }, [selectedWorkshop])

  const handleLogout = useCallback(async () => {
    try {
      await signOut()
      setSession(null)
      setSelectedWorkshop(null)
      setSlugBranding(null)
      setPreferredWorkshopIdTaller(null)
      replaceStateToRoot(null)
    } catch (e) {
      console.error('Logout error', e)
    }
  }, [])

  const rootClass = isDarkMode ? 'dark' : ''

  if (authLoading || bootLoading) {
    return (
      <div className={`${rootClass} flex h-screen items-center justify-center`}>
        <Loader2 size={40} className="animate-spin" style={{ color: 'var(--color-brand)' }} />
      </div>
    )
  }

  if (!(session as any)?.user) {
    return (
      <div className={rootClass}>
        <LoginView
          branding={slugBranding?.branding ?? null}
          workshopDisplayName={slugBranding?.displayName ?? null}
          externalNotice={loginNotice}
          onDismissNotice={() => setLoginNotice(null)}
        />
      </div>
    )
  }

  if (!selectedWorkshop) {
    return (
      <div className={rootClass}>
        <WorkshopSelectorView
          user={(session as any).user}
          onSelect={setSelectedWorkshop}
          isDarkMode={isDarkMode}
          preferredWorkshopIdTaller={preferredWorkshopIdTaller}
          onLogout={handleLogout}
          licenseBranding={slugBranding?.branding ?? null}
          hubWebIconUrl={(hubIcon || crmHubWebBranding?.icon_image_url || '').trim() || null}
          licenseDisplayName={slugBranding?.displayName ?? null}
        />
      </div>
    )
  }

  const mergedSidebarLogo =
    (licenseLogoUrl || (slugBranding?.branding?.logo_url as string | undefined) || '').trim() || null

  return (
    <div className={rootClass}>
      <DashboardShell
        key={selectedWorkshop.id}
        workshop={selectedWorkshop}
        sessionUser={(session as { user?: unknown })?.user}
        licenseLogoUrl={mergedSidebarLogo}
        onLogout={() => void handleLogout()}
        onClearWorkshop={() => setSelectedWorkshop(null)}
      />
    </div>
  )
}

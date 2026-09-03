/**
 * Branding de licencia (contenedor) vía `crm_config` + helpers de entorno.
 */

import { fetchRouteBySlug, fetchConnectRouteByContainerId } from './operationsConnect'
import { fetchTallerBranding, type TallerBranding } from './tallerBranding'

export interface SlugBrandingContext {
  slug: string
  idtaller: string
  displayName: string | null
  branding: TallerBranding | null
  resolvedFromPath: boolean
}

function deployLicenseSlugFromEnv(): string | null {
  const s = (import.meta.env.VITE_DEPLOY_LICENSE_SLUG || '').trim()
  return s || null
}

function deployContainerIdFromEnv(): string | null {
  const s = (import.meta.env.VITE_DEPLOY_CONTAINER_IDTALLER || '').trim()
  return s || null
}

export async function buildSlugBrandingContext(
  slug: string,
  options?: { resolvedFromPath?: boolean },
): Promise<SlugBrandingContext | null> {
  const resolvedFromPath = options?.resolvedFromPath ?? true
  const route = await fetchRouteBySlug(slug)
  if (!route) return null
  const branding = await fetchTallerBranding(route.idtaller)
  return {
    slug: route.slug,
    idtaller: route.idtaller,
    displayName: route.nombrePersonalizado,
    branding,
    resolvedFromPath,
  }
}

async function buildFromContainerId(idtaller: string): Promise<SlugBrandingContext | null> {
  const route = await fetchConnectRouteByContainerId(idtaller)
  if (!route) return null
  const branding = await fetchTallerBranding(route.idtaller)
  return {
    slug: route.slug,
    idtaller: route.idtaller,
    displayName: route.nombrePersonalizado,
    branding,
    resolvedFromPath: false,
  }
}

export async function resolveLicenseBrandingFromEnvOnly(): Promise<SlugBrandingContext | null> {
  const envSlug = deployLicenseSlugFromEnv()
  if (envSlug) {
    return buildSlugBrandingContext(envSlug, { resolvedFromPath: false })
  }
  const envId = deployContainerIdFromEnv()
  if (envId) {
    return buildFromContainerId(envId)
  }
  return null
}

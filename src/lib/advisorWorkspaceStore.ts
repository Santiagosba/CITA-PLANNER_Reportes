/**
 * Fuente compartida del workspace de equipos/tareas.
 * Evita N fetches (cada vista monta el hook) y replica cambios en vivo.
 */

import { isCrmUuid } from './crmUuid'
import {
  ADVISOR_WORKSPACE_CHANGED,
  hydrateAdvisorWorkspace,
  loadAdvisorWorkspace,
  parseAdvisorWorkspace,
  saveAdvisorWorkspace,
  type AdvisorWorkspace,
} from './advisorWorkspace'
import { supabase, supabaseOperations } from './supabase'

type StoreEntry = {
  workspace: AdvisorWorkspace
  hydrated: boolean
}

export type AdvisorWorkspacePersistState = {
  persistError: string | null
  remote: boolean
}

const memory = new Map<string, StoreEntry>()
const hydrating = new Map<string, Promise<AdvisorWorkspace>>()
const persistErrors = new Map<string, string | null>()
const writeGeneration = new Map<string, number>()
const channelRefCount = new Map<string, number>()
const channels = new Map<string, ReturnType<typeof supabase.channel>>()

function bumpWrite(workshopId: string): number {
  const next = (writeGeneration.get(workshopId) ?? 0) + 1
  writeGeneration.set(workshopId, next)
  return next
}

function sameWorkspace(a: AdvisorWorkspace, b: AdvisorWorkspace): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function notify(workshopId: string): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent(ADVISOR_WORKSPACE_CHANGED, {
      detail: { workshopId, persistError: persistErrors.get(workshopId) ?? null },
    }),
  )
}

function writeMemory(workshopId: string, workspace: AdvisorWorkspace, hydrated: boolean): void {
  memory.set(workshopId, { workspace, hydrated })
}

export function peekAdvisorWorkspace(workshopId: string): AdvisorWorkspace {
  const hit = memory.get(workshopId)
  if (hit) return hit.workspace
  const loaded = loadAdvisorWorkspace(workshopId)
  writeMemory(workshopId, loaded, !isCrmUuid(workshopId))
  return loaded
}

export function advisorWorkspacePersistState(workshopId: string): AdvisorWorkspacePersistState {
  return {
    persistError: persistErrors.get(workshopId) ?? null,
    remote: isCrmUuid(workshopId),
  }
}

async function fetchRemote(workshopId: string): Promise<
  { kind: 'row'; workspace: AdvisorWorkspace } | { kind: 'empty' } | { kind: 'error'; message: string }
> {
  try {
    const { data, error } = await supabaseOperations
      .from('crm_advisor_workspace')
      .select('workspace')
      .eq('idtaller', workshopId)
      .maybeSingle()
    if (error) return { kind: 'error', message: error.message }
    if (!data) return { kind: 'empty' }
    const parsed = parseAdvisorWorkspace((data as { workspace?: unknown }).workspace)
    if (!parsed) return { kind: 'empty' }
    return { kind: 'row', workspace: parsed }
  } catch (error) {
    return { kind: 'error', message: error instanceof Error ? error.message : 'No se pudo leer el taller.' }
  }
}

async function upsertRemote(workshopId: string, workspace: AdvisorWorkspace): Promise<string | null> {
  try {
    const { error } = await supabaseOperations.from('crm_advisor_workspace').upsert(
      {
        idtaller: workshopId,
        workspace,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'idtaller' },
    )
    return error?.message ?? null
  } catch (error) {
    return error instanceof Error ? error.message : 'No se pudo guardar en el taller.'
  }
}

function applyRemoteSnapshot(workshopId: string, raw: unknown): void {
  const parsed = parseAdvisorWorkspace(raw)
  if (!parsed) return
  const current = memory.get(workshopId)?.workspace
  if (current && sameWorkspace(current, parsed)) return
  writeMemory(workshopId, parsed, true)
  saveAdvisorWorkspace(workshopId, parsed)
}

export async function hydrateAdvisorWorkspaceStore(workshopId: string): Promise<AdvisorWorkspace> {
  const pending = hydrating.get(workshopId)
  if (pending) return pending

  const run = (async () => {
    const local = peekAdvisorWorkspace(workshopId)
    const gen = writeGeneration.get(workshopId) ?? 0
    if (!isCrmUuid(workshopId)) {
      persistErrors.set(workshopId, null)
      writeMemory(workshopId, local, true)
      return local
    }

    const remote = await fetchRemote(workshopId)
    if ((writeGeneration.get(workshopId) ?? 0) !== gen) return peekAdvisorWorkspace(workshopId)
    if (remote.kind === 'row') {
      persistErrors.set(workshopId, null)
      writeMemory(workshopId, remote.workspace, true)
      saveAdvisorWorkspace(workshopId, remote.workspace)
      return remote.workspace
    }
    if (remote.kind === 'empty') {
      const uploadError = await upsertRemote(workshopId, local)
      persistErrors.set(workshopId, uploadError)
      writeMemory(workshopId, local, true)
      saveAdvisorWorkspace(workshopId, local)
      return local
    }
    persistErrors.set(workshopId, remote.message)
    writeMemory(workshopId, local, true)
    return local
  })()

  hydrating.set(workshopId, run)
  try {
    return await run
  } finally {
    hydrating.delete(workshopId)
  }
}

export function commitAdvisorWorkspace(
  workshopId: string,
  update: (latest: AdvisorWorkspace) => AdvisorWorkspace,
): AdvisorWorkspace {
  const latest = peekAdvisorWorkspace(workshopId)
  const next = hydrateAdvisorWorkspace(update(latest))
  bumpWrite(workshopId)
  writeMemory(workshopId, next, true)
  saveAdvisorWorkspace(workshopId, next)
  persistErrors.set(workshopId, null)

  if (isCrmUuid(workshopId)) {
    void upsertRemote(workshopId, next).then((message) => {
      persistErrors.set(workshopId, message)
      if (message) notify(workshopId)
    })
  }
  return next
}

export function retainAdvisorWorkspaceLive(workshopId: string): void {
  if (!isCrmUuid(workshopId) || typeof window === 'undefined') return
  const refs = (channelRefCount.get(workshopId) ?? 0) + 1
  channelRefCount.set(workshopId, refs)
  if (refs > 1 && channels.has(workshopId)) return

  const channel = supabase
    .channel(`crm-advisor-workspace:${workshopId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'operations',
        table: 'crm_advisor_workspace',
        filter: `idtaller=eq.${workshopId}`,
      },
      (payload) => {
        const row = payload.new as { workspace?: unknown } | null
        if (row?.workspace) applyRemoteSnapshot(workshopId, row.workspace)
      },
    )
    .subscribe()
  channels.set(workshopId, channel)
}

export function releaseAdvisorWorkspaceLive(workshopId: string): void {
  const refs = (channelRefCount.get(workshopId) ?? 1) - 1
  if (refs > 0) {
    channelRefCount.set(workshopId, refs)
    return
  }
  channelRefCount.delete(workshopId)
  const channel = channels.get(workshopId)
  channels.delete(workshopId)
  if (channel) void supabase.removeChannel(channel)
}

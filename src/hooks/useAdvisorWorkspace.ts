import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ADVISOR_WORKSPACE_CHANGED,
  advisorWorkspaceStorageKey,
  addAssignedTask,
  addCatalogItem,
  addPerson,
  createTeam,
  createdTeamId,
  ensurePersonInWorkspace,
  patchTeam,
  removeTeam,
  setAssignedTaskAssignee,
  setAssignedTaskStatus,
  type AdvisorTeam,
  type AdvisorWorkspace,
  type AssignedTask,
  type AssignedTaskStatus,
} from '../lib/advisorWorkspace'
import {
  advisorWorkspacePersistState,
  commitAdvisorWorkspace,
  hydrateAdvisorWorkspaceStore,
  peekAdvisorWorkspace,
  releaseAdvisorWorkspaceLive,
  retainAdvisorWorkspaceLive,
} from '../lib/advisorWorkspaceStore'

type CurrentUser = {
  name: string
  email: string
}

export function useAdvisorWorkspace(
  workshopId: string,
  currentUser?: CurrentUser | null,
  enrollCurrentUser = false,
) {
  const [workspace, setWorkspace] = useState<AdvisorWorkspace>(() => peekAdvisorWorkspace(workshopId))
  const [loading, setLoading] = useState(() => advisorWorkspacePersistState(workshopId).remote)
  const [persistError, setPersistError] = useState<string | null>(
    () => advisorWorkspacePersistState(workshopId).persistError,
  )

  useEffect(() => {
    let cancelled = false
    setWorkspace(peekAdvisorWorkspace(workshopId))
    setLoading(advisorWorkspacePersistState(workshopId).remote)
    setPersistError(advisorWorkspacePersistState(workshopId).persistError)

    void hydrateAdvisorWorkspaceStore(workshopId).then((remote) => {
      if (cancelled) return
      let next = remote
      if (enrollCurrentUser && currentUser?.email) {
        const enrolled = ensurePersonInWorkspace(next, currentUser)
        if (enrolled !== next) {
          next = commitAdvisorWorkspace(workshopId, () => enrolled)
        }
      }
      setWorkspace(next)
      setPersistError(advisorWorkspacePersistState(workshopId).persistError)
      setLoading(false)
    })

    retainAdvisorWorkspaceLive(workshopId)
    return () => {
      cancelled = true
      releaseAdvisorWorkspaceLive(workshopId)
    }
  }, [workshopId, enrollCurrentUser, currentUser?.email, currentUser?.name])

  const commit = useCallback(
    (update: (latest: AdvisorWorkspace) => AdvisorWorkspace) => {
      const next = commitAdvisorWorkspace(workshopId, update)
      setWorkspace(next)
      setPersistError(advisorWorkspacePersistState(workshopId).persistError)
      return next
    },
    [workshopId],
  )

  useEffect(() => {
    const sync = () => {
      setWorkspace(peekAdvisorWorkspace(workshopId))
      setPersistError(advisorWorkspacePersistState(workshopId).persistError)
    }
    const onChanged = (event: Event) => {
      if ((event as CustomEvent<{ workshopId: string }>).detail?.workshopId === workshopId) sync()
    }
    const onStorage = (event: StorageEvent) => {
      if (event.storageArea === localStorage && (event.key === null || event.key === advisorWorkspaceStorageKey(workshopId))) {
        sync()
      }
    }
    window.addEventListener(ADVISOR_WORKSPACE_CHANGED, onChanged)
    window.addEventListener('storage', onStorage)
    window.addEventListener('focus', sync)
    return () => {
      window.removeEventListener(ADVISOR_WORKSPACE_CHANGED, onChanged)
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('focus', sync)
    }
  }, [workshopId])

  const actions = useMemo(
    () => ({
      addTeam: (name: string) => {
        let createdId = ''
        commit((latest) => {
          const next = createTeam(latest, name)
          createdId = createdTeamId(latest, next)
          return next
        })
        return createdId
      },
      updateTeam: (teamId: string, patch: Partial<Pick<AdvisorTeam, 'name' | 'memberIds' | 'taskTypeIds' | 'boardIds'>>) =>
        commit((latest) => patchTeam(latest, teamId, patch)),
      deleteTeam: (teamId: string) => commit((latest) => removeTeam(latest, teamId)),
      addAdvisor: (name: string, email: string, teamId?: string | null) =>
        commit((latest) => addPerson(latest, name, email, teamId)),
      addTaskType: (name: string) => commit((latest) => addCatalogItem(latest, 'taskTypes', name)),
      addBoard: (name: string) => commit((latest) => addCatalogItem(latest, 'boards', name)),
      assignTask: (input: Omit<AssignedTask, 'id' | 'createdAt' | 'status'> & { status?: AssignedTaskStatus }) =>
        commit((latest) => addAssignedTask(latest, input)),
      setTaskStatus: (taskId: string, status: AssignedTaskStatus) =>
        commit((latest) => setAssignedTaskStatus(latest, taskId, status)),
      setTaskAssignee: (taskId: string, assigneeId: string) =>
        commit((latest) => setAssignedTaskAssignee(latest, taskId, assigneeId)),
    }),
    [commit],
  )

  return { workspace, loading, persistError, ...actions }
}

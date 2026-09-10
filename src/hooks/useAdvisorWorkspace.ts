import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  addAssignedTask,
  ADVISOR_WORKSPACE_CHANGED,
  advisorWorkspaceStorageKey,
  addCatalogItem,
  addPerson,
  createTeam,
  ensurePersonInWorkspace,
  loadAdvisorWorkspace,
  patchTeam,
  removeTeam,
  saveAdvisorWorkspace,
  setAssignedTaskAssignee,
  setAssignedTaskStatus,
  type AdvisorTeam,
  type AdvisorWorkspace,
  type AssignedTask,
  type AssignedTaskStatus,
} from '../lib/advisorWorkspace'

type CurrentUser = {
  name: string
  email: string
}

export function useAdvisorWorkspace(
  workshopId: string,
  currentUser?: CurrentUser | null,
  enrollCurrentUser = false,
) {
  const [workspace, setWorkspace] = useState<AdvisorWorkspace>(() => loadAdvisorWorkspace(workshopId))

  useEffect(() => {
    let next = loadAdvisorWorkspace(workshopId)
    if (enrollCurrentUser && currentUser?.email) {
      next = ensurePersonInWorkspace(next, currentUser)
    }
    setWorkspace(next)
    saveAdvisorWorkspace(workshopId, next)
  }, [workshopId, enrollCurrentUser, currentUser?.email, currentUser?.name])

  const commit = useCallback(
    (update: (latest: AdvisorWorkspace) => AdvisorWorkspace) => {
      const next = update(loadAdvisorWorkspace(workshopId))
      setWorkspace(next)
      saveAdvisorWorkspace(workshopId, next)
    },
    [workshopId],
  )

  useEffect(() => {
    const sync = () => setWorkspace(loadAdvisorWorkspace(workshopId))
    const onChanged = (event: Event) => {
      if ((event as CustomEvent<{ workshopId: string }>).detail?.workshopId === workshopId) sync()
    }
    const onStorage = (event: StorageEvent) => {
      if (event.storageArea === localStorage && (event.key === null || event.key === advisorWorkspaceStorageKey(workshopId))) sync()
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
      addTeam: (name: string) => commit((latest) => createTeam(latest, name)),
      updateTeam: (teamId: string, patch: Partial<Pick<AdvisorTeam, 'name' | 'memberIds' | 'taskTypeIds' | 'boardIds'>>) =>
        commit((latest) => patchTeam(latest, teamId, patch)),
      deleteTeam: (teamId: string) => commit((latest) => removeTeam(latest, teamId)),
      addAdvisor: (name: string, email: string) => commit((latest) => addPerson(latest, name, email)),
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

  return { workspace, ...actions }
}

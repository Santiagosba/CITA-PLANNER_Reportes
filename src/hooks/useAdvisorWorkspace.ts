import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  addAssignedTask,
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
    (next: AdvisorWorkspace) => {
      setWorkspace(next)
      saveAdvisorWorkspace(workshopId, next)
    },
    [workshopId],
  )

  const actions = useMemo(
    () => ({
      addTeam: (name: string) => commit(createTeam(workspace, name)),
      updateTeam: (teamId: string, patch: Partial<Pick<AdvisorTeam, 'name' | 'memberIds' | 'taskTypeIds' | 'boardIds'>>) =>
        commit(patchTeam(workspace, teamId, patch)),
      deleteTeam: (teamId: string) => commit(removeTeam(workspace, teamId)),
      addAdvisor: (name: string, email: string) => commit(addPerson(workspace, name, email)),
      addTaskType: (name: string) => commit(addCatalogItem(workspace, 'taskTypes', name)),
      addBoard: (name: string) => commit(addCatalogItem(workspace, 'boards', name)),
      assignTask: (input: Omit<AssignedTask, 'id' | 'createdAt' | 'status'> & { status?: AssignedTaskStatus }) =>
        commit(addAssignedTask(workspace, input)),
      setTaskStatus: (taskId: string, status: AssignedTaskStatus) =>
        commit(setAssignedTaskStatus(workspace, taskId, status)),
      setTaskAssignee: (taskId: string, assigneeId: string) =>
        commit(setAssignedTaskAssignee(workspace, taskId, assigneeId)),
    }),
    [commit, workspace],
  )

  return { workspace, ...actions }
}

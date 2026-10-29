import api from './axios'
import type {
  LabActionAccepted,
  LabAddStudentRequest,
  LabStudent,
} from '@/types'

// ----------------------------------------------------------------
// LAB API — Kubernetes-App student pods (backend ``app/routers/lab.py``)
//
// Every route is per team: each team of a Kubernetes-App deployment is
// its own single-VM k3s cluster. Reads (student list, kubeconfig) answer
// directly; every mutating call answers 202 with a task id and runs in
// the worker, so progress arrives over the deployment's SSE stream like
// pause/resume/redeploy.
//
// Common errors: 412 ``lab_not_deployed`` (no successful deploy yet),
// 502 ``lab_cluster_unavailable``, 409 while the deployment has any
// active task, 403 ``lab_view_forbidden`` / ``lab_operate_forbidden``.
// ----------------------------------------------------------------
const base = (deploymentId: string, teamId: string) =>
  `/deployments/${deploymentId}/lab/teams/${teamId}`

const studentPath = (deploymentId: string, teamId: string, username: string) =>
  `${base(deploymentId, teamId)}/students/${encodeURIComponent(username)}`

export const labApi = {
  /** All students of one team with pod status (``labctl list``). */
  listStudents: (deploymentId: string, teamId: string) => {
    return api.get<LabStudent[]>(`${base(deploymentId, teamId)}/students`)
  },

  /**
   * The team's cluster-admin kubeconfig, server patched onto IPv4.
   * Fetched as a blob so the caller can hand it straight to a download
   * without the token ever landing in a store or a log.
   */
  downloadKubeconfig: (deploymentId: string, teamId: string) => {
    return api.get<Blob>(`${base(deploymentId, teamId)}/kubeconfig`, {
      responseType: 'blob',
    })
  },

  /** Create a student pod (``labctl add-student``). */
  addStudent: (deploymentId: string, teamId: string, data: LabAddStudentRequest) => {
    return api.post<LabActionAccepted>(`${base(deploymentId, teamId)}/students`, data)
  },

  /** New pod for a student, home directory kept (``labctl reassign``). */
  reassignStudent: (deploymentId: string, teamId: string, username: string) => {
    return api.post<LabActionAccepted>(`${studentPath(deploymentId, teamId, username)}/reassign`)
  },

  /** New pod and an empty home directory (``labctl reset``). */
  resetStudent: (deploymentId: string, teamId: string, username: string, newPassword: boolean) => {
    return api.post<LabActionAccepted>(
      `${studentPath(deploymentId, teamId, username)}/reset`,
      { new_password: newPassword },
    )
  },

  /**
   * Rotate a student's password, then reassign (``labctl passwd``).
   * Without ``password`` the worker generates one.
   */
  changeStudentPassword: (deploymentId: string, teamId: string, username: string, password?: string) => {
    return api.post<LabActionAccepted>(
      `${studentPath(deploymentId, teamId, username)}/passwd`,
      { password: password || null },
    )
  },

  /** Delete pod, service, secret and home directory (``labctl remove-student``). */
  removeStudent: (deploymentId: string, teamId: string, username: string) => {
    return api.delete<LabActionAccepted>(studentPath(deploymentId, teamId, username))
  },
}

import { defineStore } from 'pinia'
import { labApi } from '@/api/lab.api'
import { extractErrorMessage } from '@/utils/http-error'
import { labErrorKey } from '@/utils/lab-errors'
import { filenameFromContentDisposition } from '@/utils/download'
import { runRequest } from './_request'
import type { LabActionAccepted, LabAddStudentRequest, LabStudent } from '@/types'

/**
 * Kubernetes-App student pods, per team (issue frontend#36).
 *
 * The student list is kept per ``teamId``: each team is its own k3s
 * cluster, and one unreachable cluster must not blank the others. Its
 * error is stored as ``{ key, message }`` so the panel can show a
 * translated text for the cases a teacher can act on (not deployed yet,
 * cluster unreachable) and the raw message for everything else.
 *
 * Mutating actions only enqueue a worker task (202) and re-throw on
 * failure — the panel decides on toast vs. dialog. Generated passwords
 * never pass through here: they arrive once on the SSE stream.
 */
export interface LabListError {
  key: string | null
  message: string
}

export const useLabStore = defineStore('lab', {
  state: () => ({
    studentsByTeam: {} as Record<string, LabStudent[]>,
    loadingByTeam: {} as Record<string, boolean>,
    errorByTeam: {} as Record<string, LabListError>,
    isLoading: false,
    error: null as string | null,
  }),

  actions: {
    async fetchStudents(deploymentId: string, teamId: string) {
      const ctx = {
        setLoading: (v: boolean) => { this.loadingByTeam[teamId] = v },
        setError: (e: string | null) => { if (e === null) delete this.errorByTeam[teamId] },
      }
      try {
        await runRequest(ctx, async () => {
          const { data } = await labApi.listStudents(deploymentId, teamId)
          this.studentsByTeam[teamId] = data
        }, 'Failed to load students')
      } catch (err) {
        // Drop a stale list so the table doesn't show pods of a cluster
        // we can no longer read.
        delete this.studentsByTeam[teamId]
        this.errorByTeam[teamId] = { key: labErrorKey(err), message: extractErrorMessage(err) }
      }
    },

    async addStudent(deploymentId: string, teamId: string, data: LabAddStudentRequest) {
      return this._runAction(() => labApi.addStudent(deploymentId, teamId, data), 'Failed to add student')
    },

    async reassignStudent(deploymentId: string, teamId: string, username: string) {
      return this._runAction(() => labApi.reassignStudent(deploymentId, teamId, username), 'Failed to reassign student')
    },

    async resetStudent(deploymentId: string, teamId: string, username: string, newPassword: boolean) {
      return this._runAction(() => labApi.resetStudent(deploymentId, teamId, username, newPassword), 'Failed to reset student')
    },

    async changeStudentPassword(deploymentId: string, teamId: string, username: string, password?: string) {
      return this._runAction(() => labApi.changeStudentPassword(deploymentId, teamId, username, password), 'Failed to change password')
    },

    async removeStudent(deploymentId: string, teamId: string, username: string) {
      return this._runAction(() => labApi.removeStudent(deploymentId, teamId, username), 'Failed to remove student')
    },

    /**
     * Fetch the team's kubeconfig. Returned to the caller for an immediate
     * download and deliberately not kept in state: it carries a
     * cluster-admin token.
     */
    async downloadKubeconfig(deploymentId: string, teamId: string, fallbackFilename: string) {
      const ctx = {
        setLoading: (v: boolean) => { this.isLoading = v },
        setError: (e: string | null) => { this.error = e },
      }
      return runRequest(ctx, async () => {
        const response = await labApi.downloadKubeconfig(deploymentId, teamId)
        const header = response.headers?.['content-disposition'] as string | undefined
        return {
          blob: response.data,
          filename: filenameFromContentDisposition(header, fallbackFilename),
        }
      }, 'Failed to download kubeconfig')
    },

    async _runAction(call: () => Promise<{ data: LabActionAccepted }>, fallbackMsg: string) {
      const ctx = {
        setLoading: (v: boolean) => { this.isLoading = v },
        setError: (e: string | null) => { this.error = e },
      }
      return runRequest(ctx, async () => {
        const { data } = await call()
        return data
      }, fallbackMsg)
    },
  },
})

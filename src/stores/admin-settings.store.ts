import { defineStore } from 'pinia'
import { settingsApi } from '@/api/settings.api'
import { runRequest } from './_request'
import type { DefaultNetworkSetting, DefaultNetworkUpsert } from '@/types'

interface State {
  defaultNetwork: DefaultNetworkSetting | null
  isLoading: boolean
  error: string | null
}

export const useAdminSettingsStore = defineStore('admin-settings', {
  state: (): State => ({
    defaultNetwork: null,
    isLoading: false,
    error: null,
  }),

  actions: {
    async fetchDefaultNetwork() {
      const ctx = {
        setLoading: (v: boolean) => { this.isLoading = v },
        setError: (e: string | null) => { this.error = e },
      }
      await runRequest(ctx, async () => {
        const { data } = await settingsApi.admin.getDefaultNetwork()
        this.defaultNetwork = data
      }, 'Failed to fetch default network', { rethrow: false })
    },

    async saveDefaultNetwork(payload: DefaultNetworkUpsert) {
      const ctx = {
        setLoading: (v: boolean) => { this.isLoading = v },
        setError: (e: string | null) => { this.error = e },
      }
      await runRequest(ctx, async () => {
        const { data } = await settingsApi.admin.putDefaultNetwork(payload)
        this.defaultNetwork = data
      }, 'Failed to save default network')
    },
  },
})

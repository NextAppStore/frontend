/**
 * Admin-only global platform settings.
 *
 * Currently exposes a single setting — the default OpenStack network used
 * for ``@openstack:network``-marked deploy variables that the deploying
 * user leaves unset (see ``backend/app/routers/admin_settings.py``).
 */
import api from './axios'
import type { DefaultNetworkSetting, DefaultNetworkUpsert } from '@/types'

export const settingsApi = {
  admin: {
    getDefaultNetwork: () =>
      api.get<DefaultNetworkSetting>('/admin/settings/default-network'),
    putDefaultNetwork: (payload: DefaultNetworkUpsert) =>
      api.put<DefaultNetworkSetting>('/admin/settings/default-network', payload),
  },
}

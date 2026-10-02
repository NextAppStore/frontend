import { ref } from 'vue'

/**
 * Shared IPv4/IPv6 display preference for the deployment detail page.
 *
 * Module-level singleton (not a factory-local ref) so the Teams &
 * Mitglieder RDP toggle and the Infrastructure card read/write the same
 * value — picking "IPv6" for RDP commands should also emphasise IPv6 in
 * the infrastructure addresses without a second, disconnected toggle.
 *
 * Persisted in localStorage, mirroring the ``locale`` pattern in
 * ``src/i18n/index.ts``.
 */
const STORAGE_KEY = 'cnd.ipVersionPreference'

export type IpVersion = 'v4' | 'v6'

const ipVersion = ref<IpVersion>(
  localStorage.getItem(STORAGE_KEY) === 'v6' ? 'v6' : 'v4',
)

export function useIpVersionPreference() {
  const setIpVersion = (value: IpVersion) => {
    ipVersion.value = value
    localStorage.setItem(STORAGE_KEY, value)
  }

  return { ipVersion, setIpVersion }
}

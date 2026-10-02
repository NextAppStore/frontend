import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useIpVersionPreference } from '@/composables/useIpVersionPreference'

const STORAGE_KEY = 'cnd.ipVersionPreference'

describe('useIpVersionPreference', () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY)
    // The preference is a module-level singleton (by design — see the
    // composable's doc comment), so tests reset it explicitly rather
    // than relying on a fresh module per test.
    useIpVersionPreference().setIpVersion('v4')
  })

  it('defaults to v4', () => {
    const { ipVersion } = useIpVersionPreference()
    expect(ipVersion.value).toBe('v4')
  })

  it('setIpVersion updates the shared singleton and persists it', () => {
    const a = useIpVersionPreference()
    const b = useIpVersionPreference()

    a.setIpVersion('v6')

    // Singleton: a second call site sees the same change immediately.
    expect(b.ipVersion.value).toBe('v6')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('v6')

    a.setIpVersion('v4')
    expect(b.ipVersion.value).toBe('v4')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('v4')
  })

  it('restores a previously stored preference on module load', async () => {
    localStorage.setItem(STORAGE_KEY, 'v6')
    // The stored value is only read at module-eval time, so the module
    // registry is reset to force a fresh singleton that re-reads it.
    vi.resetModules()
    const fresh = await import('@/composables/useIpVersionPreference')
    expect(fresh.useIpVersionPreference().ipVersion.value).toBe('v6')
  })
})

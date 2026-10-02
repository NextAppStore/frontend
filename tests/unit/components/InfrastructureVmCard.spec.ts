import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import InfrastructureVmCard from '@/components/InfrastructureVmCard.vue'
import { useIpVersionPreference } from '@/composables/useIpVersionPreference'
import type { DeploymentResource } from '@/types'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

const resource: DeploymentResource = {
  address: 'openstack_compute_instance_v2.team_vm["Team #1"]',
  type: 'openstack_compute_instance_v2',
  category: 'compute',
  team: 'Team #1',
  provider_id: 'uuid-1',
  display_name: 'windows-rdp-Team #1',
  drift: 'in_sync',
  lifecycle: { status: 'ACTIVE', task_state: null, vm_state: 'active', power_state: 'RUNNING', fault_message: null },
  hardware: {
    flavor_name: 'win11.medium',
    ram_mb: 8192,
    vcpus: 2,
    disk_gb: 80,
    image_id: '53d77bab-xxxx',
    image_name: null,
    availability_zone: 'nova',
    launched_at: new Date().toISOString(),
  },
  addresses: [
    {
      network: 'DHBWV6',
      fixed_ip: '10.200.3.147',
      fixed_ip_v6: '2001:7c0:1b20:c913:1::134',
      floating_ip: null,
      mac: 'fa:16:3e:3a:29:0a',
    },
  ],
} as unknown as DeploymentResource

const mountCard = () => mount(InfrastructureVmCard, { props: { resource } })

describe('InfrastructureVmCard — IPv4/IPv6 address display', () => {
  beforeEach(() => {
    localStorage.removeItem('cnd.ipVersionPreference')
    useIpVersionPreference().setIpVersion('v4')
  })

  it('shows both addresses on separate, labelled lines, v6 no longer de-emphasised with text-xs', () => {
    const wrapper = mountCard()
    const text = wrapper.text()
    expect(text).toContain('10.200.3.147')
    expect(text).toContain('2001:7c0:1b20:c913:1::134')
    expect(text).toContain('vm.ipv4Label')
    expect(text).toContain('vm.ipv6Label')

    // One <p> per IP — not sharing a flex-wrap line with v4 — so a long
    // v6 address never overflows the card on narrow widths.
    const v6Line = wrapper.findAll('p').find((p) => p.text().includes('2001:7c0:1b20:c913:1::134'))
    expect(v6Line?.element.tagName).toBe('P')
    expect(v6Line?.classes()).not.toContain('text-xs')
  })

  it('emphasises v4 by default and v6 once the preference switches', async () => {
    const wrapper = mountCard()

    const v4Line = () => wrapper.findAll('p').find((p) => p.text().includes('10.200.3.147'))
    const v6Line = () => wrapper.findAll('p').find((p) => p.text().includes('2001:7c0:1b20:c913:1::134'))

    expect(v4Line()?.classes()).toContain('text-gray-900')
    expect(v6Line()?.classes()).toContain('text-gray-500')

    useIpVersionPreference().setIpVersion('v6')
    await wrapper.vm.$nextTick()

    expect(v4Line()?.classes()).toContain('text-gray-500')
    expect(v6Line()?.classes()).toContain('text-gray-900')
  })
})

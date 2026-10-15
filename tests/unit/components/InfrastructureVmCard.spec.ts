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

  it('renders v4 and v6 identically regardless of the shared preference', async () => {
    const wrapper = mountCard()

    const v4Line = () => wrapper.findAll('p').find((p) => p.text().includes('10.200.3.147'))
    const v6Line = () => wrapper.findAll('p').find((p) => p.text().includes('2001:7c0:1b20:c913:1::134'))

    expect(v4Line()?.classes()).toContain('text-content-primary')
    expect(v6Line()?.classes()).toContain('text-content-primary')

    useIpVersionPreference().setIpVersion('v6')
    await wrapper.vm.$nextTick()

    expect(v4Line()?.classes()).toContain('text-content-primary')
    expect(v6Line()?.classes()).toContain('text-content-primary')
  })
})

describe('InfrastructureVmCard — address families on edge cases', () => {
  const withAddress = (fixed_ip: string | null, fixed_ip_v6: string | null) =>
    mount(InfrastructureVmCard, {
      props: {
        resource: {
          ...resource,
          addresses: [{ network: 'DHBWV6', fixed_ip, fixed_ip_v6, floating_ip: null, mac: null }],
        } as unknown as DeploymentResource,
      },
    })

  it('renders only the IPv6 line on IPv6-only networks (fixed_ip is null)', () => {
    const v6 = '2001:7c0:1b20:c913:1::134'
    const wrapper = withAddress(null, v6)
    const text = wrapper.text()
    expect(text).not.toContain('vm.ipv4Label')
    expect(text).toContain('vm.ipv6Label')
    expect(text.split(v6)).toHaveLength(2) // rendered exactly once
  })

  it('renders only the IPv4 line when the network has no IPv6', () => {
    const wrapper = withAddress('10.200.3.147', null)
    expect(wrapper.text()).toContain('vm.ipv4Label')
    expect(wrapper.text()).not.toContain('vm.ipv6Label')
  })
})

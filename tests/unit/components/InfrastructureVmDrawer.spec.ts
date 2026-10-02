import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import InfrastructureVmDrawer from '@/components/InfrastructureVmDrawer.vue'
import type { DeploymentResource } from '@/types'

const { detail, mockGetResourceDetail } = vi.hoisted(() => {
  const detail = {
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
      image_name: 'Windows 11 25H2 (UEFI)',
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
    ports: [
      {
        port_id: '0ede5705-xxxx',
        network_id: 'net-1',
        status: 'ACTIVE',
        mac: 'fa:16:3e:3a:29:0a',
        fixed_ip: '10.200.3.147',
        fixed_ip_v6: '2001:7c0:1b20:c913:1::134',
        security_group_ids: [],
      },
    ],
  }
  return { detail, mockGetResourceDetail: vi.fn().mockResolvedValue({ data: detail }) }
})

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

vi.mock('@/api/deployment.api', () => ({
  deploymentApi: {
    getResourceDetail: mockGetResourceDetail,
  },
}))

const mountDrawer = () =>
  mount(InfrastructureVmDrawer, {
    props: { deploymentId: 'dep-1', address: detail.address },
  })

describe('InfrastructureVmDrawer — MAC address layout', () => {
  it('gives the MAC field full row width (col-span-2) in Netzwerk-Adressen', async () => {
    const wrapper = mountDrawer()
    await flushPromises()

    const macLabel = wrapper.findAll('span').find((s) => s.text() === 'vm.drawer.network.mac')
    const macRow = macLabel?.element.parentElement
    expect(macRow?.className).toContain('col-span-2')
  })

  it('shows IPv6 with equal visual weight to IPv4 (no de-emphasis class)', async () => {
    const wrapper = mountDrawer()
    await flushPromises()

    const expectedV6 = (detail as unknown as DeploymentResource).addresses[0]?.fixed_ip_v6
    const v6Code = wrapper.findAll('code').find((c) => c.text() === expectedV6)
    expect(v6Code?.classes()).not.toContain('text-gray-500')
    expect(v6Code?.classes()).not.toContain('text-xs')
  })
})

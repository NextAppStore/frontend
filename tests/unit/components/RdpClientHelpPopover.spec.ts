import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import RdpClientHelpPopover from '@/components/RdpClientHelpPopover.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key} ${JSON.stringify(vars)}` : key),
  }),
}))

const modalStub = {
  props: ['show'],
  template: '<div v-if="show" class="modal"><slot name="title" /><slot name="body" /></div>',
}

const mountPopover = (port = 3389) =>
  mount(RdpClientHelpPopover, {
    props: { ip: '10.200.3.147', port },
    global: {
      stubs: { Modal: modalStub },
    },
  })

describe('RdpClientHelpPopover', () => {
  it('is closed by default and opens on trigger click', async () => {
    const wrapper = mountPopover()
    expect(wrapper.find('.modal').exists()).toBe(false)

    await wrapper.find('button').trigger('click')
    expect(wrapper.find('.modal').exists()).toBe(true)
  })

  it('renders all three OS sections with the target IP interpolated', async () => {
    const wrapper = mountPopover()
    await wrapper.find('button').trigger('click')

    const text = wrapper.text()
    expect(text).toContain('DeploymentDetailView.rdpHelp.windows.heading')
    expect(text).toContain('DeploymentDetailView.rdpHelp.macos.heading')
    expect(text).toContain('DeploymentDetailView.rdpHelp.linux.heading')
    expect(text).toContain('"ip":"10.200.3.147"')
    // Default port (3389) is omitted from the Linux command, mirroring
    // rdpCommandFor's port-3389 omission.
    expect(text).toContain('xfreerdp /v:10.200.3.147')
    expect(text).not.toContain('xfreerdp /v:10.200.3.147:3389')
  })

  it('includes the port in the Linux command when it is non-default', async () => {
    const wrapper = mountPopover(3390)
    await wrapper.find('button').trigger('click')
    expect(wrapper.text()).toContain('xfreerdp /v:10.200.3.147:3390')
  })
})

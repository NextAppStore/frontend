import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

import AdminSettingsView from '@/views/AdminSettingsView.vue'

// i18n — assertions check keys, not rendered text, per project convention.
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, vars?: any) => (vars ? `${key} ${JSON.stringify(vars)}` : key),
  }),
}))

// Toast
const mockToastError = vi.fn()
const mockToastSuccess = vi.fn()
vi.mock('@/composables/useToast', () => ({
  useToast: () => ({ error: mockToastError, success: mockToastSuccess }),
}))

// Display-name cache — plain function import, not a composable hook.
const mockGetDisplayName = vi.fn()
vi.mock('@/composables/useOpenStackResourceCache', () => ({
  getDisplayName: (...args: any[]) => mockGetDisplayName(...args),
}))

// Admin settings store (Pinia)
const mockFetchDefaultNetwork = vi.fn()
const mockSaveDefaultNetwork = vi.fn()
let mockDefaultNetwork: any = null
let mockIsLoading = false

vi.mock('@/stores/admin-settings.store', () => ({
  useAdminSettingsStore: () => ({
    get defaultNetwork() { return mockDefaultNetwork },
    get isLoading() { return mockIsLoading },
    fetchDefaultNetwork: mockFetchDefaultNetwork,
    saveDefaultNetwork: mockSaveDefaultNetwork,
  }),
}))

describe('AdminSettingsView.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDefaultNetwork = null
    mockIsLoading = false
    mockFetchDefaultNetwork.mockResolvedValue(undefined)
    mockSaveDefaultNetwork.mockResolvedValue(undefined)
    mockGetDisplayName.mockReturnValue(null)
  })

  const mountComponent = () => {
    return mount(AdminSettingsView, {
      global: {
        mocks: {
          $t: (key: string, vars?: any) => (vars ? `${key} ${JSON.stringify(vars)}` : key),
        },
        stubs: {
          Card: { template: '<div class="stub-card"><slot /></div>' },
          BaseButton: {
            template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
            props: ['disabled'],
          },
          OpenStackResourcePicker: {
            props: ['modelValue'],
            template: '<input class="stub-picker" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
          },
        },
      },
    })
  }

  it('shows the loading state before the setting resolves', () => {
    mockIsLoading = true
    const wrapper = mountComponent()
    expect(wrapper.text()).toContain('AdminSettingsView.status.loading')
  })

  it('shows the "not configured" empty state', async () => {
    const wrapper = mountComponent()
    await flushPromises()
    expect(wrapper.text()).toContain('AdminSettingsView.status.noneTitle')
    expect(mockFetchDefaultNetwork).toHaveBeenCalled()
  })

  it('shows the configured network and prefills the form', async () => {
    mockDefaultNetwork = {
      configured: true,
      id: 'net-1',
      name: 'campus-net',
      mode: 'id',
      updated_at: '2026-01-01T00:00:00Z',
    }
    const wrapper = mountComponent()
    await flushPromises()

    expect(wrapper.text()).toContain('AdminSettingsView.status.configured')
    expect(wrapper.find('.stub-picker').attributes('value')).toBe('net-1')
  })

  const findSaveButton = (wrapper: ReturnType<typeof mountComponent>) => {
    const buttons = wrapper.findAll('button')
    const last = buttons[buttons.length - 1]
    if (!last) throw new Error('save button not found')
    return last
  }

  it('saves the selected network and shows a success toast', async () => {
    mockGetDisplayName.mockReturnValue({ name: 'campus-net', known: true })
    const wrapper = mountComponent()
    await flushPromises()

    await wrapper.find('.stub-picker').setValue('net-2')
    await findSaveButton(wrapper).trigger('click')
    await flushPromises()

    expect(mockSaveDefaultNetwork).toHaveBeenCalledWith({
      id: 'net-2',
      name: 'campus-net',
      mode: 'id',
    })
    expect(mockToastSuccess).toHaveBeenCalledWith('AdminSettingsView.toasts.saveSuccess')
  })

  it('shows an error toast when the save request fails', async () => {
    mockGetDisplayName.mockReturnValue({ name: 'campus-net', known: true })
    mockSaveDefaultNetwork.mockRejectedValue({ response: { data: { detail: 'network_not_found' } } })

    const wrapper = mountComponent()
    await flushPromises()

    await wrapper.find('.stub-picker').setValue('net-2')
    await findSaveButton(wrapper).trigger('click')
    await flushPromises()

    expect(mockToastError).toHaveBeenCalledWith('network_not_found')
  })

  it('blocks save and shows a toast when nothing is selected', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    expect(findSaveButton(wrapper).attributes('disabled')).toBeDefined()
  })
})

/**
 * Covers the "recommended" marking in the picker's option list.
 *
 * Why this deserves its own spec: the badge on the variable card in
 * ``NewDeploymentVariableView`` disappears the moment the user picks a
 * different value — this marking is what keeps the app author's suggestion
 * findable afterwards. The view's own spec cannot cover it because it stubs
 * the picker away.
 *
 * The dropdown is rendered through ``<Teleport to="body">``, so the option
 * list is asserted against ``document.body``, not against the wrapper.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

import OpenStackResourcePicker from '@/components/OpenStackResourcePicker.vue'

const listFlavors = vi.fn()

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

vi.mock('@/composables/useToast', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    clear: vi.fn(),
  }),
}))

vi.mock('@/api/openstack-resources.api', () => ({
  openstackResourcesApi: {
    listFlavors: (...args: unknown[]) => listFlavors(...args),
    refresh: vi.fn().mockResolvedValue({ data: {} }),
  },
}))

vi.mock('@/composables/useOpenStackResourceCache', () => ({
  prime: vi.fn(),
  invalidate: vi.fn(),
  getDisplayName: vi.fn(() => null),
  ensureLoaded: vi.fn().mockResolvedValue(undefined),
}))

const FLAVORS = [
  { id: 'f-1', name: 'm1.tiny', vcpus: 1, ram: 512, disk: 1, is_public: true },
  { id: 'f-2', name: 'm1.small', vcpus: 1, ram: 2048, disk: 20, is_public: true },
  { id: 'f-3', name: 'm1.large', vcpus: 4, ram: 8192, disk: 80, is_public: true },
]

describe('OpenStackResourcePicker.vue — recommended option', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listFlavors.mockResolvedValue({ data: FLAVORS })
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  /** Mounts the picker and opens its dropdown. */
  async function openPicker(props: Record<string, unknown> = {}) {
    const wrapper = mount(OpenStackResourcePicker, {
      attachTo: document.body,
      props: { osType: 'flavor', osMode: 'name', ...props },
    })
    await flushPromises()
    await wrapper.find('button').trigger('click')
    await flushPromises()
    return wrapper
  }

  /** Option rows of the teleported dropdown, in rendered order. */
  const optionRows = () => Array.from(document.body.querySelectorAll('li'))

  it('marks the option matching the recommended value', async () => {
    await openPicker({ recommendedValue: 'm1.small' })

    const badges = document.body.querySelectorAll('[data-testid="picker-recommended"]')
    expect(badges).toHaveLength(1)
    expect(badges[0]?.textContent).toContain('openstackPicker.recommended')

    const marked = optionRows().find((li) =>
      li.querySelector('[data-testid="picker-recommended"]'),
    )
    expect(marked?.textContent).toContain('m1.small')
  })

  it('marks nothing when no recommended value is given', async () => {
    await openPicker()

    expect(document.body.querySelectorAll('[data-testid="picker-recommended"]')).toHaveLength(0)
  })

  it('keeps the marking when a different value is selected', async () => {
    // The whole point: the card badge is gone at this stage, so the list is
    // the only place left that still shows what the author suggested.
    await openPicker({ modelValue: 'm1.large', recommendedValue: 'm1.small' })

    const marked = optionRows().find((li) =>
      li.querySelector('[data-testid="picker-recommended"]'),
    )
    expect(marked?.textContent).toContain('m1.small')
  })

  it('sorts the recommended option above the unselected rest', async () => {
    await openPicker({ modelValue: 'm1.large', recommendedValue: 'm1.small' })

    const names = optionRows().map((li) => li.textContent || '')
    // Selected first, then the recommendation, then everything else.
    expect(names[0]).toContain('m1.large')
    expect(names[1]).toContain('m1.small')
  })

  it('matches on the UUID when the picker runs in id mode', async () => {
    await openPicker({ osMode: 'id', recommendedValue: 'f-3' })

    const marked = optionRows().find((li) =>
      li.querySelector('[data-testid="picker-recommended"]'),
    )
    expect(marked?.textContent).toContain('m1.large')
  })

  it('marks every entry of a multi-select recommendation', async () => {
    await openPicker({ multi: true, recommendedValue: ['m1.tiny', 'm1.large'] })

    expect(document.body.querySelectorAll('[data-testid="picker-recommended"]')).toHaveLength(2)
  })
})

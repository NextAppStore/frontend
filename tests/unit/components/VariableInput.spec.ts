/**
 * Covers the hand-off of the app author's HCL default to the resource picker.
 *
 * The picker has no access to the variable definition — it only ever sees the
 * props it is given. If this wiring breaks, the "recommended" marking in the
 * option list silently disappears without any test failing in the picker's own
 * spec, which passes the value in directly.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'

import VariableInput from '@/components/VariableInput.vue'
import type { AppVariable } from '@/types'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

const PickerStub = {
  name: 'OpenStackResourcePicker',
  props: ['osType', 'osMode', 'multi', 'modelValue', 'recommendedValue', 'filterNetworkId', 'allowFreeText'],
  template: '<div data-testid="picker-stub" />',
}

function mountInput(variable: Partial<AppVariable>, modelValue: unknown = '') {
  return mount(VariableInput, {
    props: { variable: { name: 'v', type: 'string', ...variable } as AppVariable, modelValue },
    global: { stubs: { OpenStackResourcePicker: PickerStub } },
  })
}

/** The ``recommendedValue`` the picker actually received. */
const recommended = (wrapper: ReturnType<typeof mountInput>) =>
  wrapper.findComponent(PickerStub).props('recommendedValue')

describe('VariableInput.vue — recommended value hand-off', () => {
  it('passes a scalar default through to the picker', () => {
    const wrapper = mountInput({ osType: 'flavor', default: 'm1.small' })

    expect(recommended(wrapper)).toBe('m1.small')
  })

  it('passes a list default through unchanged', () => {
    const wrapper = mountInput({ osType: 'network', osMulti: true, default: ['net-a', 'net-b'] })

    expect(recommended(wrapper)).toEqual(['net-a', 'net-b'])
  })

  it('passes a non-string scalar default through', () => {
    // ``default = 2`` in HCL arrives as a number and would be invisible
    // in the option list without coercion further down.
    const wrapper = mountInput({ osType: 'flavor', default: 2 })

    expect(recommended(wrapper)).toBe(2)
  })

  it('drops a map default — no single option could carry the badge', () => {
    const wrapper = mountInput({ osType: 'flavor', type: 'map(string)', default: { a: 'b' } })

    expect(recommended(wrapper)).toBeNull()
  })

  it('reports null when the variable has no default', () => {
    const wrapper = mountInput({ osType: 'flavor', required: true })

    expect(recommended(wrapper)).toBeNull()
  })

  it('renders no picker for a plain text variable', () => {
    const wrapper = mountInput({ default: 'hello' })

    expect(wrapper.findComponent(PickerStub).exists()).toBe(false)
    expect(wrapper.find('input[type="text"]').exists()).toBe(true)
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'

import AccentColorSettings from '@/components/AccentColorSettings.vue'
import { DEFAULT_ACCENT, accentFromHue } from '@/composables/useAccentColor'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key} ${JSON.stringify(vars)}` : key),
  }),
}))

const mockToastError = vi.fn()
const mockToastSuccess = vi.fn()
vi.mock('@/composables/useToast', () => ({
  useToast: () => ({ error: mockToastError, success: mockToastSuccess }),
}))

// The configured accent is read from the env when the component is set up.
const mockEnv = vi.hoisted(() => ({ ACCENT_COLOR: '' }))
vi.mock('@/env', () => ({ env: mockEnv }))

const brand = () => document.documentElement.style.getPropertyValue('--color-brand')

const mountSettings = () =>
  mount(AccentColorSettings, {
    global: {
      stubs: {
        Card: { template: '<div><slot /></div>' },
        BaseButton: {
          props: ['disabled'],
          template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
        },
      },
    },
  })

const moveSlider = async (wrapper: ReturnType<typeof mountSettings>, hue: number) => {
  await wrapper.get('[data-testid="accent-hue"]').setValue(String(hue))
}

const envLine = (wrapper: ReturnType<typeof mountSettings>) =>
  wrapper.get('[data-testid="accent-env-line"]').text()

describe('AccentColorSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnv.ACCENT_COLOR = ''
    document.documentElement.style.removeProperty('--color-brand')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('shows the env line and label for the configured default', () => {
    const wrapper = mountSettings()

    expect(envLine(wrapper)).toBe(`VITE_ACCENT_COLOR="${DEFAULT_ACCENT}"`)
    expect(wrapper.text()).toContain(`AccentColorSettings.configuredLabel {"color":"${DEFAULT_ACCENT}"}`)
    expect(wrapper.find('[data-testid="accent-preview-note"]').exists()).toBe(false)
  })

  it('shows a custom accent from the env as configured', () => {
    mockEnv.ACCENT_COLOR = '"#0052CC"'
    const wrapper = mountSettings()

    expect(envLine(wrapper)).toBe('VITE_ACCENT_COLOR="#0052CC"')
    expect(wrapper.get('[data-testid="accent-selected"]').text()).toBe('#0052CC')
  })

  it('previews the slider color live and updates the env line', async () => {
    const wrapper = mountSettings()
    await moveSlider(wrapper, 210)

    const picked = accentFromHue(210)
    expect(brand()).toBe(picked)
    expect(envLine(wrapper)).toBe(`VITE_ACCENT_COLOR="${picked}"`)
    expect(wrapper.find('[data-testid="accent-preview-note"]').exists()).toBe(true)
  })

  it('resets to the configured color and drops the override', async () => {
    const wrapper = mountSettings()
    const reset = wrapper.get('[data-testid="btn-accent-reset"]')
    expect(reset.attributes('disabled')).toBeDefined()

    await moveSlider(wrapper, 120)
    expect(reset.attributes('disabled')).toBeUndefined()
    await reset.trigger('click')

    expect(brand()).toBe('')
    expect(envLine(wrapper)).toBe(`VITE_ACCENT_COLOR="${DEFAULT_ACCENT}"`)
    expect(wrapper.find('[data-testid="accent-preview-note"]').exists()).toBe(false)
  })

  it('switches to the ScholarStack default from a custom accent', async () => {
    mockEnv.ACCENT_COLOR = '#0052CC'
    const wrapper = mountSettings()

    await wrapper.get('[data-testid="btn-accent-default"]').trigger('click')

    expect(brand()).toBe('')
    expect(envLine(wrapper)).toBe(`VITE_ACCENT_COLOR="${DEFAULT_ACCENT}"`)
    expect(wrapper.get('[data-testid="btn-accent-default"]').attributes('disabled')).toBeDefined()
  })

  it('colors reset in the configured and default in the ScholarStack accent, also while previewing', async () => {
    mockEnv.ACCENT_COLOR = '#0052CC'
    const wrapper = mountSettings()
    await moveSlider(wrapper, 120)

    expect(wrapper.get('[data-testid="btn-accent-reset"]').attributes('style')).toContain('--color-btn-primary: #0052CC')
    expect(wrapper.get('[data-testid="btn-accent-default"]').attributes('style')).toContain(`--color-btn-primary: ${DEFAULT_ACCENT}`)
  })

  it('copies the env line via the clipboard API in a secure context', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    vi.stubGlobal('isSecureContext', true)
    const wrapper = mountSettings()

    await wrapper.get('[data-testid="btn-accent-copy"]').trigger('click')
    await vi.waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('AccentColorSettings.copySuccess'))
    expect(writeText).toHaveBeenCalledWith(`VITE_ACCENT_COLOR="${DEFAULT_ACCENT}"`)
  })

  it('falls back to execCommand behind plain http', async () => {
    vi.stubGlobal('isSecureContext', false)
    // happy-dom has no execCommand of its own — define it so it can be spied on.
    document.execCommand ??= () => false
    const execCommand = vi.spyOn(document, 'execCommand').mockReturnValue(true)
    const wrapper = mountSettings()

    await wrapper.get('[data-testid="btn-accent-copy"]').trigger('click')
    await vi.waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('AccentColorSettings.copySuccess'))
    expect(execCommand).toHaveBeenCalledWith('copy')
    expect(document.querySelector('textarea')).toBeNull()
  })

  it('shows an error toast when copying fails', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    vi.stubGlobal('isSecureContext', true)
    const wrapper = mountSettings()

    await wrapper.get('[data-testid="btn-accent-copy"]').trigger('click')
    await vi.waitFor(() => expect(mockToastError).toHaveBeenCalledWith('AccentColorSettings.copyError'))
    expect(mockToastSuccess).not.toHaveBeenCalled()
  })
})

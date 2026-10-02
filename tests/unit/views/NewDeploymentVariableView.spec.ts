import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import { useRouter } from 'vue-router'

// Anpassen an deinen tatsächlichen Dateinamen / Pfad
import DeploymentVariables from '@/views/NewDeploymentVariableView.vue'
// NEU: Die Komponente direkt importieren, um sie sicher im Test zu finden
import VariableInput from '@/components/VariableInput.vue' 

import { useDeploymentStore } from '@/stores/deployment.store'
import { useAppStore } from '@/stores/app.store'
import { useToast } from '@/composables/useToast'

// --- MOCKS ---
vi.mock('vue-router', () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    replace: vi.fn()
  }))
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key
  })
}))

vi.mock('@/composables/useToast', () => ({
  useToast: vi.fn(() => ({
    warning: vi.fn(),
    error: vi.fn(),
    clear: vi.fn(),
    success: vi.fn(),
    info: vi.fn()
  }))
}))

// Mock für den dynamischen Import des OpenStack Caches
vi.mock('@/composables/useOpenStackResourceCache', () => ({
  ensureLoaded: vi.fn().mockResolvedValue(undefined)
}))

describe('NewDeploymentVariableView.vue', () => {
  let routerPushMock: any
  let routerReplaceMock: any
  let toastErrorMock: any

  beforeEach(() => {
    vi.clearAllMocks()
    routerPushMock = vi.fn()
    routerReplaceMock = vi.fn()
    vi.mocked(useRouter).mockReturnValue({ 
      push: routerPushMock,
      replace: routerReplaceMock
    } as any)
    
    toastErrorMock = vi.fn()
    vi.mocked(useToast).mockReturnValue({
      error: toastErrorMock,
      info: vi.fn(),
      warning: vi.fn(),
      success: vi.fn(),
      clear: vi.fn()
    } as any)
  })

  function createWrapper(draftOverrides: any = {}, mockVariables: any[] = []) {
    const pinia = createTestingPinia({
      createSpy: vi.fn,
      initialState: {
        deployment: {
          studentCache: new Map(),
          draft: {
            appId: 'app-1',
            name: 'Test Deployment',
            releaseTag: '1.0.0',
            variables: {},
            userInputVar: '',
            variableDefinitions: [],
            fileUploads: {},
            groupNames: ['Team 1'],
            assignments: { 0: ['u1'] },
            ...draftOverrides
          }
        }
      }
    })

    const appStore = useAppStore(pinia)
    appStore.fetchAppVariables = vi.fn().mockResolvedValue(mockVariables)

    return mount(DeploymentVariables, {
      global: {
        plugins: [pinia],
        stubs: {
          DeploymentProgressBar: true,
          VariableInput: true, // FIX: Nutzt jetzt den automatischen Stub von Vue Test Utils
          FileDropZone: true,
          ScopeBadge: true,
          Box: true,
          Layers: true,
          Info: true,
          AlertTriangle: true,
          ArrowRight: true,
          ArrowLeft: true,
          ChevronDown: true,
          Sparkles: true
        }
      }
    })
  }

  /** Opens both "Advanced settings" disclosures so every variable is rendered. */
  async function expandAdvanced(wrapper: any) {
    for (const id of ['packer-advanced-toggle', 'terraform-advanced-toggle']) {
      const toggle = wrapper.find(`[data-testid="${id}"]`)
      if (toggle.exists()) await toggle.trigger('click')
    }
  }

  it('redirects to /apps if no appId is present in draft', async () => {
    createWrapper({ appId: null })
    await flushPromises()

    expect(routerReplaceMock).toHaveBeenCalledWith('/apps')
  })

  it('fetches variables and groups them into packer and terraform sections', async () => {
    const mockVars = [
      { name: 'packer_var', source: 'packer', type: 'string', required: false, default: 'val1' },
      { name: 'tf_var', source: 'terraform', type: 'string', required: false, default: 'val2' }
    ]
    
    const wrapper = createWrapper({}, mockVars)
    await flushPromises() // Warten auf Loading und API-Call

    const appStore = useAppStore()
    expect(appStore.fetchAppVariables).toHaveBeenCalledWith('app-1', '1.0.0')

    // Beide Variablen haben einen Default und liegen daher hinter "Erweiterte
    // Einstellungen". Aufklappen, dann müssen beide Sektionen ihre Variable zeigen.
    await expandAdvanced(wrapper)

    expect(wrapper.text()).toContain('packer_var')
    expect(wrapper.text()).toContain('tf_var')
  })

  it('blocks navigation if a required variable is missing (Required-Gating)', async () => {
    const mockVars = [
      // Required Variable ohne Default-Wert
      { name: 'db_password', source: 'terraform', type: 'string', required: true }
    ]
    
    const wrapper = createWrapper({}, mockVars)
    await flushPromises()

    // Next-Button sollte im disabled-State sein (Klasse oder Attribut)
    const nextBtn = wrapper.findAll('button').find(b => b.text().includes('deployment.actions.next'))
    expect(nextBtn?.attributes('disabled')).toBeDefined()
    expect(nextBtn?.classes()).toContain('cursor-not-allowed')
    
    // Warnhinweis für fehlende Felder sollte sichtbar sein
    expect(wrapper.text()).toContain('deployment.variables.missingRequiredTitle')
    expect(wrapper.text()).toContain('db_password')
  })

  it('allows navigation and saves variables when required fields are filled', async () => {
    const mockVars = [
      { name: 'db_password', source: 'terraform', type: 'string', required: true }
    ]
    
    const wrapper = createWrapper({}, mockVars)
    await flushPromises()

    const deploymentStore = useDeploymentStore()

    // FIX: VariableInput sicher über den direkten Import finden
    const varInput = wrapper.findComponent(VariableInput)
    await varInput.vm.$emit('update:modelValue', 'secret123')
    
    // Warten, bis Vue die formValues aktualisiert hat und computed properties (canSubmit) neu berechnet
    await wrapper.vm.$nextTick()

    // Next-Button klicken
    const nextBtn = wrapper.findAll('button').find(b => b.text().includes('deployment.actions.next'))
    expect(nextBtn?.attributes('disabled')).toBeUndefined()
    await nextBtn?.trigger('click')

    // Prüfen, ob Store korrekt befüllt wurde (userInputVar als JSON String)
    const expectedChanges = { db_password: 'secret123' }
    expect(deploymentStore.draft.userInputVar).toBe(JSON.stringify(expectedChanges))
    
    // Prüfen, ob weitergeleitet wurde
    expect(routerPushMock).toHaveBeenCalledWith({ name: 'deployment.summary' })
  })

  it('navigates back to the teams step when the back button is clicked', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    const backBtn = wrapper.findAll('button').find(b => b.text().includes('deployment.actions.back'))
    await backBtn?.trigger('click')

    expect(routerPushMock).toHaveBeenCalledWith({ name: 'deployment.teams' })
  })

  it('shows error toast when fetchAppVariables fails', async () => {
    const pinia = createTestingPinia({
      createSpy: vi.fn,
      initialState: {
        deployment: {
          draft: { appId: 'app-1', variableDefinitions: [] }
        }
      }
    })
    
    const appStore = useAppStore(pinia)
    appStore.fetchAppVariables = vi.fn().mockRejectedValue(new Error('Network Error'))

    mount(DeploymentVariables, {
      global: {
        plugins: [pinia],
        stubs: { DeploymentProgressBar: true, Box: true, Layers: true, ArrowLeft: true, ArrowRight: true }
      }
    })

    await flushPromises()
    
    expect(toastErrorMock).toHaveBeenCalledWith('deployment.summary.fetchVarsError')
  })

  // ----------------------------------------------------------------
  // STANDARD / ADVANCED SPLIT
  // ----------------------------------------------------------------
  // The wizard hides variables the app author already answered (i.e. those
  // carrying an HCL default) behind an "Advanced settings" disclosure, so the
  // standard view only asks for what genuinely has to be filled in.
  describe('Standard/Advanced split', () => {
    it('keeps required variables visible and hides defaulted ones', async () => {
      const mockVars = [
        { name: 'db_password', source: 'terraform', type: 'string', required: true },
        { name: 'vm_flavor', source: 'terraform', type: 'string', required: false, default: 'm1.small' }
      ]

      const wrapper = createWrapper({}, mockVars)
      await flushPromises()

      expect(wrapper.text()).toContain('db_password')
      expect(wrapper.text()).not.toContain('vm_flavor')
    })

    it('counts the hidden variables on the disclosure toggle', async () => {
      const mockVars = [
        { name: 'db_password', source: 'terraform', type: 'string', required: true },
        { name: 'vm_flavor', source: 'terraform', type: 'string', required: false, default: 'm1.small' },
        { name: 'vm_image', source: 'terraform', type: 'string', required: false, default: 'ubuntu' }
      ]

      const wrapper = createWrapper({}, mockVars)
      await flushPromises()

      const toggle = wrapper.find('[data-testid="terraform-advanced-toggle"]')
      expect(toggle.exists()).toBe(true)
      expect(toggle.text()).toContain('deployment.variables.advancedSettings')
      expect(toggle.text()).toContain('2')
      expect(toggle.attributes('aria-expanded')).toBe('false')
    })

    it('reveals the hidden variables when the disclosure is expanded', async () => {
      const mockVars = [
        { name: 'db_password', source: 'terraform', type: 'string', required: true },
        { name: 'vm_flavor', source: 'terraform', type: 'string', required: false, default: 'm1.small' }
      ]

      const wrapper = createWrapper({}, mockVars)
      await flushPromises()

      const toggle = wrapper.find('[data-testid="terraform-advanced-toggle"]')
      await toggle.trigger('click')

      expect(wrapper.text()).toContain('vm_flavor')
      expect(toggle.attributes('aria-expanded')).toBe('true')
    })

    it('renders no toggle when every variable is required', async () => {
      const mockVars = [
        { name: 'db_password', source: 'terraform', type: 'string', required: true }
      ]

      const wrapper = createWrapper({}, mockVars)
      await flushPromises()

      expect(wrapper.find('[data-testid="terraform-advanced-toggle"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="terraform-all-preconfigured"]').exists()).toBe(false)
    })

    it('shows the "all preconfigured" hint when nothing is left to fill in', async () => {
      const mockVars = [
        { name: 'vm_flavor', source: 'terraform', type: 'string', required: false, default: 'm1.small' }
      ]

      const wrapper = createWrapper({}, mockVars)
      await flushPromises()

      expect(wrapper.find('[data-testid="terraform-all-preconfigured"]').exists()).toBe(true)
      expect(wrapper.text()).toContain('deployment.variables.allPreconfigured')
    })

    it('keeps the "all preconfigured" hint visible while the disclosure is open', async () => {
      const mockVars = [
        { name: 'vm_flavor', source: 'terraform', type: 'string', required: false, default: 'm1.small' }
      ]

      const wrapper = createWrapper({}, mockVars)
      await flushPromises()
      await wrapper.find('[data-testid="terraform-advanced-toggle"]').trigger('click')

      expect(wrapper.find('[data-testid="terraform-all-preconfigured"]').exists()).toBe(true)
      expect(wrapper.text()).toContain('vm_flavor')
    })

    it('keeps a variable visible whose value was overridden in an earlier visit', async () => {
      // Coming back via "Back": the draft already holds a value that differs
      // from the author's default, so the variable must NOT be hidden away.
      const definitions = [
        { name: 'vm_flavor', source: 'terraform', type: 'string', required: false, default: 'm1.small' }
      ]

      const wrapper = createWrapper({
        variableDefinitions: definitions,
        variables: { vm_flavor: 'm1.large' }
      })
      await flushPromises()

      expect(wrapper.text()).toContain('vm_flavor')
      expect(wrapper.find('[data-testid="terraform-advanced-toggle"]').exists()).toBe(false)
    })
  })

  // ----------------------------------------------------------------
  // RECOMMENDED BADGE
  // ----------------------------------------------------------------
  describe('Recommended badge', () => {
    it('marks a prefilled default as recommended', async () => {
      const mockVars = [
        { name: 'vm_flavor', source: 'terraform', type: 'string', required: false, default: 'm1.small' }
      ]

      const wrapper = createWrapper({}, mockVars)
      await flushPromises()
      await expandAdvanced(wrapper)

      const badges = wrapper.findAll('[data-testid="recommended-badge"]')
      expect(badges).toHaveLength(1)
      expect(badges[0]?.text()).toContain('deployment.variables.recommended')
    })

    it('does not mark a required field without a default', async () => {
      const mockVars = [
        { name: 'db_password', source: 'terraform', type: 'string', required: true }
      ]

      const wrapper = createWrapper({}, mockVars)
      await flushPromises()

      expect(wrapper.findAll('[data-testid="recommended-badge"]')).toHaveLength(0)
    })

    it('drops the badge once the value is changed away from the default', async () => {
      const mockVars = [
        { name: 'vm_flavor', source: 'terraform', type: 'string', required: false, default: 'm1.small' }
      ]

      const wrapper = createWrapper({}, mockVars)
      await flushPromises()
      await expandAdvanced(wrapper)

      expect(wrapper.findAll('[data-testid="recommended-badge"]')).toHaveLength(1)

      const varInput = wrapper.findComponent(VariableInput)
      await varInput.vm.$emit('update:modelValue', 'm1.large')
      await wrapper.vm.$nextTick()

      expect(wrapper.findAll('[data-testid="recommended-badge"]')).toHaveLength(0)
    })
  })
})
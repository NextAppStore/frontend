import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import { useRouter } from 'vue-router'

// Anpassen an deinen tatsächlichen Dateinamen / Pfad
import DeploymentConfig from '@/views/NewDeploymentConfigView.vue' 

import { useDeploymentStore } from '@/stores/deployment.store'
import { useOpenStackCredentialsStore } from '@/stores/openstack-credentials.store'
import { courseApi } from '@/api/course.api'
import { userApi } from '@/api/user.api'
import { useToast } from '@/composables/useToast'

// --- MOCKS ---
vi.mock('vue-router', () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn()
  }))
}))

// Partieller Mock: Nur ``useI18n`` wird gestubbt, ``createI18n`` bleibt echt.
// Sonst bricht jeder Import, der transitiv die i18n-Instanz zieht — etwa
// Stores, die Fallback-Fehlertexte über ``i18n.global.t`` übersetzen.
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    t: (key: string) => key
  })
}))

vi.mock('@/composables/useToast', () => ({
  useToast: vi.fn(() => ({
    warning: vi.fn(),
    error: vi.fn(),
    clear: vi.fn(),
    success: vi.fn()
  }))
}))

vi.mock('@/api/course.api', () => ({
  courseApi: {
    list: vi.fn(),
    getById: vi.fn()
  }
}))

vi.mock('@/api/user.api', () => ({
  userApi: {
    list: vi.fn(),
    search: vi.fn()
  }
}))

describe('DeploymentConfig.vue', () => {
  let routerPushMock: any
  let toastWarningMock: any

  beforeEach(() => {
    vi.clearAllMocks()
    routerPushMock = vi.fn()
    vi.mocked(useRouter).mockReturnValue({ push: routerPushMock } as any)
    
    toastWarningMock = vi.fn()
    vi.mocked(useToast).mockReturnValue({
      warning: toastWarningMock,
      error: vi.fn(),
      clear: vi.fn(),
      success: vi.fn()
    } as any)

    // Standard API-Antworten mocken
    vi.mocked(courseApi.list).mockResolvedValue({ data: [{ courseId: 'c1', name: 'Web Dev' }] } as any)
    vi.mocked(userApi.list).mockResolvedValue({ data: [{ keycloak_id: 'u1', firstName: 'John', lastName: 'Doe' }] } as any)
    
    // --- HIER IST DER FIX GEGEN DIE ENDLOSSCHLEIFE ---
    vi.mocked(courseApi.getById).mockResolvedValue({ data: { users: [] } } as any)
  })

  function createWrapper(initialCredState = { isResolved: true, hasCredential: true }) {
    // 1. Pinia Instanz erstellen
    const pinia = createTestingPinia({
      createSpy: vi.fn,
      initialState: {
        deployment: {
          draft: {
            name: '',
            appId: 'app-1',
            studentIds: [],
            courseIds: []
          },
          studentCache: new Map()
        }
      }
    })

   // 2. Credential-Store explizit VOR dem Mounten konfigurieren
    const credStore = useOpenStackCredentialsStore(pinia)

    // Getters für den Test überschreiben
    Object.defineProperty(credStore, 'isResolved', { get: () => initialCredState.isResolved })
    Object.defineProperty(credStore, 'hasCredential', { get: () => initialCredState.hasCredential })

    // 'status' erwartet ein Objekt (CredentialStatus). 
    // Wir übergeben ein Mock-Objekt und nutzen 'as any', um fehlende Properties zu ignorieren.
    credStore.status = { 
      has_credential: initialCredState.hasCredential 
    } as any

    credStore.fetch = vi.fn().mockResolvedValue(undefined)
    // 3. Wrapper mounten
    return mount(DeploymentConfig, {
      global: {
        plugins: [pinia],
        stubs: {
          DeploymentProgressBar: true,
          CredentialMissingBanner: true,
          BarChart3: true,
          Search: true,
          Check: true,
          Users: true,
          BookOpen: true,
          UserPlus: true
        }
      }
    })
  }

  it('renders correctly and loads courses & students on mount', async () => {
    const wrapper = createWrapper()
    await flushPromises() // Warten auf onMounted API-Calls

    expect(courseApi.list).toHaveBeenCalledWith(0, 200)
    expect(userApi.list).toHaveBeenCalledWith({ role: 'student', limit: 1000 })
    
    // Der Kurs sollte nun angezeigt werden, da das v-if korrekt evaluiert wird
    expect(wrapper.text()).toContain('Web Dev')
  })

  it('shows missing credential banner and hides form if credentials are missing', async () => {
    const wrapper = createWrapper({ isResolved: true, hasCredential: false })
    await flushPromises()

    // Die Eingabefelder sollten durch das v-if nicht da sein
    expect(wrapper.find('[data-testid="deployment-name"]').exists()).toBe(false)
    
    // Der Next-Button sollte disabled sein
    const nextBtn = wrapper.find('[data-testid="btn-next"]')
    expect(nextBtn.attributes('disabled')).toBeDefined()
  })

  it('validates missing name when clicking next', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    const store = useDeploymentStore()
    store.draft.name = '' 
    store.draft.studentIds = ['u1'] 

    await wrapper.find('[data-testid="btn-next"]').trigger('click')
    
    expect(toastWarningMock).toHaveBeenCalledWith('deployment.errors.missingName')
    expect(routerPushMock).not.toHaveBeenCalled()
  })

  it('validates missing students when clicking next', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    const store = useDeploymentStore()
    store.draft.name = 'My Deployment' 
    store.draft.studentIds = [] 

    await wrapper.find('[data-testid="btn-next"]').trigger('click')
    
    expect(toastWarningMock).toHaveBeenCalledWith('deployment.errors.missingStudents')
    expect(routerPushMock).not.toHaveBeenCalled()
  })

  it('proceeds to next step when valid', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    const store = useDeploymentStore()
    store.draft.name = 'My Deployment'
    store.draft.studentIds = ['u1'] 

    await wrapper.find('[data-testid="btn-next"]').trigger('click')
    
    expect(toastWarningMock).not.toHaveBeenCalled()
    expect(routerPushMock).toHaveBeenCalledWith({ name: 'deployment.teams' })
  })

  it('switches tabs and selects an individual student', async () => {
    // 1. Fake-Timer aktivieren, um das 300ms Debouncing zu überspringen
    vi.useFakeTimers()

    const wrapper = createWrapper()
    await flushPromises()

    const store = useDeploymentStore()

    // 2. Tab wechseln
    const tabButtons = wrapper.findAll('button')
    const studentsTabBtn = tabButtons.find(btn => btn.text().includes('deployment.config.studentsLabel'))
    
    await studentsTabBtn?.trigger('click')
    await wrapper.vm.$nextTick()

    // 3. Mock für die Suche konfigurieren
    vi.mocked(userApi.search).mockResolvedValue({ 
      data: [{ keycloak_id: 'u1', firstName: 'John', lastName: 'Doe' }] 
    } as any)

    // 4. Suche auslösen (damit die Liste nicht leer ist)
    const searchInput = wrapper.find('[data-testid="student-search"]')
    await searchInput.setValue('John')

    // 5. Zeit um 300ms vorstellen (Debounce-Timer auslösen) und Promises abwarten
    vi.advanceTimersByTime(300)
    await flushPromises()
    await wrapper.vm.$nextTick()

    // 6. Jetzt ist der Student im DOM und wir können klicken
    const studentDiv = wrapper.find('[data-testid="student-u1"]')
    expect(studentDiv.exists()).toBe(true)
    await studentDiv.trigger('click')

    expect(store.draft.studentIds).toContain('u1')

    // 7. Timer wieder auf Normalbetrieb stellen (wichtig für andere Tests!)
    vi.useRealTimers()
  })

  it('handles back button correctly', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    const store = useDeploymentStore()
    store.draft.appId = 'app-123'

    await wrapper.find('[data-testid="btn-back"]').trigger('click')
    
    expect(routerPushMock).toHaveBeenCalledWith({ name: 'apps.detail', params: { id: 'app-123' } })
  })
})
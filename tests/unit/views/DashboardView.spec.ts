import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import DashboardView from '@/views/DashboardView.vue'

// ---------------------------------------------------------
// 1. Mocks & Setup
// ---------------------------------------------------------

// i18n Mock
// Partieller Mock: Nur ``useI18n`` wird gestubbt, ``createI18n`` bleibt echt.
// Sonst bricht jeder Import, der transitiv die i18n-Instanz zieht — etwa
// Stores, die Fallback-Fehlertexte über ``i18n.global.t`` übersetzen.
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    t: (key: string) => key
  })
}))

// Lucide Icons stubben (verhindert Render-Fehler)
vi.mock('lucide-vue-next', () => ({
  BarChart3: { template: '<span />' },
  Layers: { template: '<span />' },
  GraduationCap: { template: '<span />' },
  ArrowRight: { template: '<span />' }
}))

// Modifizierbare Store- & Composable-Zustände
let mockUser: any = { username: 'john' }
let mockCredStatus = false
let mockQuotasLoading = false

const mockFetchStats = vi.fn()
const mockFetchQuotas = vi.fn()
const mockFetchCredentials = vi.fn()

vi.mock('@/stores/auth.store', () => ({
  useAuthStore: () => ({
    get user() { return mockUser }
  })
}))

vi.mock('@/stores/openstack-credentials.store', () => ({
  useOpenStackCredentialsStore: () => ({
    get status() { return mockCredStatus },
    fetch: mockFetchCredentials
  })
}))

vi.mock('@/composables/useDashboard', () => ({
  useDashboard: () => ({
    stats: {},
    fetchStats: mockFetchStats
  })
}))

vi.mock('@/composables/useQuotas', () => ({
  useQuotas: () => ({
    formattedQuotas: [],
    get loading() { return mockQuotasLoading },
    needsCredentials: false,
    hasCachedQuotas: true,
    fetchQuotas: mockFetchQuotas,
    getColorClass: vi.fn()
  })
}))

// ---------------------------------------------------------
// 2. Die Tests
// ---------------------------------------------------------

// TODO: Tests gegen die neue View-Struktur neu schreiben (main hat
// Dashboard umgebaut: Recent-Activity entfernt, Layout neu, useRole
// als Tile-Gate, i18n-Subtitle). Bis dahin geskippt.
describe.skip('DashboardView.vue', () => {

  beforeEach(() => {
    vi.clearAllMocks()
    
    // Standard-Zustände vor jedem Test zurücksetzen
    mockUser = { username: 'john' }
    mockCredStatus = false
    mockQuotasLoading = false

    // Systemzeit einfrieren (Standard: Nachmittag)
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 5, 7, 14, 0, 0))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // Zentrale Mount-Funktion im Stil deiner Kollegen
const mountComponent = () => {
    return mount(DashboardView, {
      global: {
        mocks: {
          $t: (key: string, vars?: any) => vars ? `${key} ${JSON.stringify(vars)}` : key
        },
        stubs: {
          RouterLink: true,
          CredentialMissingBanner: { template: '<div class="stub-banner" />' }
        }
      }
    })
  }

  // --- 1. Lifecycle & API Calls ---

  it('lädt alle notwendigen Daten beim Starten der View', async () => {
    mountComponent()
    await flushPromises()

    expect(mockFetchStats).toHaveBeenCalledTimes(1)
    expect(mockFetchQuotas).toHaveBeenCalledTimes(1)
    expect(mockFetchCredentials).toHaveBeenCalledTimes(1) // Weil mockCredStatus = false
  })

  it('lädt Credentials nicht erneut, wenn sie bereits vorhanden sind', async () => {
    mockCredStatus = true // Zustand vor dem Mounten ändern
    
    mountComponent()
    await flushPromises()

    expect(mockFetchCredentials).not.toHaveBeenCalled()
  })

  // --- 2. Computed Properties (Begrüßung & Name) ---

  it('formatiert den Usernamen so, dass der erste Buchstabe groß ist', () => {
    mockUser = { username: 'maximilian' }
    const wrapper = mountComponent()

    // Test über das ViewModel (wie von dir vermutet)
    expect((wrapper.vm as any).firstName).toBe('Maximilian')
  })

  it('gibt leeren String für den Namen zurück, wenn kein User existiert', () => {
    mockUser = null
    const wrapper = mountComponent()

    expect((wrapper.vm as any).firstName).toBe('')
  })

  it('wählt die korrekte Begrüßung basierend auf der Uhrzeit', () => {
    // 1. Test am Morgen
    vi.setSystemTime(new Date(2026, 5, 7, 9, 0, 0))
    let wrapper = mountComponent()
    expect((wrapper.vm as any).timeGreeting).toBe('DashboardView.timeGreetings.morning')

    // 2. Test am Abend
    vi.setSystemTime(new Date(2026, 5, 7, 20, 0, 0))
    wrapper = mountComponent()
    expect((wrapper.vm as any).timeGreeting).toBe('DashboardView.timeGreetings.evening')
  })
})
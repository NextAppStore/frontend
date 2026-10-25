import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import { useRouter } from 'vue-router'

// Dateinamen anpassen, falls nötig
import DeploymentSummary from '@/views/NewDeploymentSummaryView.vue' 

import { useDeploymentStore } from '@/stores/deployment.store'
import { useAppStore } from '@/stores/app.store'
import { useToastStore } from '@/stores/toast.store'
import { userApi } from '@/api/user.api'

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
    t: (key: string, params?: any) => {
      // Simples Mocking, das bei Platzhaltern etwas anhängt, um es testbar zu machen
      if (params && params.count !== undefined) return `${key} (${params.count})`
      return key
    }
  })
}))

vi.mock('@/api/user.api', () => ({
  userApi: {
    list: vi.fn()
  }
}))

// Mock für den OpenStack Cache
vi.mock('@/composables/useOpenStackResourceCache', () => ({
  ensureLoaded: vi.fn().mockResolvedValue(undefined),
  getDisplayName: vi.fn((_type, _mode, val) => ({ name: `OS-Name-${val}` }))
}))

describe('NewDeploymentSummaryView.vue', () => {
  let routerPushMock: any

  beforeEach(() => {
    vi.clearAllMocks()
    routerPushMock = vi.fn()
    vi.mocked(useRouter).mockReturnValue({ push: routerPushMock } as any)
    
    // Standard API Antworten
    vi.mocked(userApi.list).mockResolvedValue({ 
      data: [{ keycloak_id: 'kc1', userId: 'u1' }] 
    } as any)
  })

  function createWrapper() {
    const pinia = createTestingPinia({
      createSpy: vi.fn,
      initialState: {
        app: {
          apps: [
            { appId: 'app-1', name: 'Test App', image: 'test.png' }
          ]
        },
        deployment: {
          studentCache: new Map([
            ['kc1', { userId: 'u1', firstName: 'John', lastName: 'Doe', keycloak_id: 'kc1' }]
          ]),
          draft: {
            name: 'My Deployment',
            appId: 'app-1',
            releaseTag: '1.0.0',
            groupCount: 1,
            groupMode: 'one',
            studentIds: ['kc1'],
            assignments: {
              0: ['kc1']
            },
            groupNames: ['Team Alpha'],
            variables: {
              'region': 'eu-central-1',
              'instance_type': 't2.micro'
            },
            fileUploads: {
              'ssh_key': {
                'kc1': { name: 'id_rsa.pub', size: 1024 } // 1 KB
              }
            },
            variableDefinitions: []
          }
        }
      }
    })

    const appStore = useAppStore()
    appStore.fetchAppVariables = vi.fn().mockResolvedValue([
      { name: 'region', source: 'packer', default: 'us-east' },
      { name: 'instance_type', source: 'terraform', default: 't2.small' },
      { name: 'ssh_key', source: 'terraform', osType: 'file', osScope: 'user' }
    ])

    const deploymentStore = useDeploymentStore()
    deploymentStore.submitDraft = vi.fn().mockResolvedValue({ deploymentId: 'dep-123' })
    deploymentStore.resetDraft = vi.fn()

    return mount(DeploymentSummary, {
      global: {
        plugins: [pinia],
        stubs: {
          DeploymentProgressBar: true,
          BarChart3: true,
          ArrowRight: true,
          ArrowLeft: true,
          Box: true,
          Layers: true
        }
      }
    })
  }

  it('loads variables on mount and displays summary config', async () => {
    const wrapper = createWrapper()
    
    // Wir warten sofort auf alle API-Antworten. 
    // (Der Mock antwortet so schnell, dass der Loading-State übersprungen wird)
    await flushPromises() 
    
    const appStore = useAppStore()
    
    // Sollte Variablen geladen haben
    expect(appStore.fetchAppVariables).toHaveBeenCalledWith('app-1', '1.0.0')

    // Sollte die Zusammenfassung anzeigen
    expect(wrapper.text()).toContain('My Deployment')
    expect(wrapper.text()).toContain('Test App')
    expect(wrapper.text()).toContain('1.0.0')
    expect(wrapper.text()).toContain('John Doe') // Student Cache Name
    expect(wrapper.text()).toContain('Team Alpha')
  })

  it('separates variables correctly into packer, terraform and files', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    // Die Werte, die aus den gemockten Variablen-Definitionen resultieren
    expect(wrapper.text()).toContain('eu-central-1') // Packer-Wert (aus Draft gemerged)
    expect(wrapper.text()).toContain('t2.micro') // Terraform-Wert
    expect(wrapper.text()).toContain('id_rsa.pub') // Datei-Upload
    expect(wrapper.text()).toContain('1 KB') // Formatierte Dateigröße
  })

  it('navigates back to variables step when Back or Edit button is clicked', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    // Zurück Button testen
    const backBtn = wrapper.findAll('button').find(b => b.text().includes('deployment.actions.back'))
    await backBtn?.trigger('click')
    expect(routerPushMock).toHaveBeenCalledWith({ name: 'deployment.variables' })

    // "Bearbeiten" Button bei den Variablen testen
    const editBtn = wrapper.find('[data-testid="summary-edit-variables"]')
    await editBtn.trigger('click')
    expect(routerPushMock).toHaveBeenCalledWith({ name: 'deployment.variables' }) // Ruft die gleiche Route auf
  })

  // Jeder Abschnitt verweist auf den Wizard-Schritt, der ihn erzeugt hat. Ohne
  // die ersten beiden saß fest, wer über den Schnell-Deploy hier ankam: Dieser
  // Weg füllt den Draft mit einem Team aus dem Dozenten, und zu einem Kurs kam
  // man nur, indem man den Wizard von der Kachel aus neu begann.
  it('springt vom Abschnitt Basis-Konfiguration zurück in Schritt 1', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    await wrapper.find('[data-testid="summary-edit-base-config"]').trigger('click')

    expect(routerPushMock).toHaveBeenCalledWith({ name: 'deployment.config' })
  })

  it('springt vom Abschnitt Team-Zuweisung zurück in Schritt 2', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    await wrapper.find('[data-testid="summary-edit-teams"]').trigger('click')

    expect(routerPushMock).toHaveBeenCalledWith({ name: 'deployment.teams' })
  })

  it('bietet in jedem der drei Abschnitte einen Bearbeiten-Knopf', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    expect(wrapper.find('[data-testid="summary-edit-base-config"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="summary-edit-teams"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="summary-edit-variables"]').exists()).toBe(true)
  })

  it('submits the deployment, maps IDs correctly and redirects on success', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    const deploymentStore = useDeploymentStore()
    const toastStore = useToastStore()

    // Deploy Button klicken
    const deployBtn = wrapper.findAll('button').find(b => b.text().includes('deployment.actions.deploy'))
    await deployBtn?.trigger('click')

    // Warten auf API Calls
    await flushPromises()

    // Prüft, ob Keycloak ID -> User ID Mapping korrekt war (kc1 -> u1)
    expect(deploymentStore.draft.studentIds).toContain('u1')
    expect((deploymentStore.draft.assignments as any)[0]).toContain('u1')
    
    // Wurde submit aufgerufen?
    expect(deploymentStore.submitDraft).toHaveBeenCalled()
    expect(deploymentStore.resetDraft).toHaveBeenCalled()
    
    // Erfolgs-Toast gesendet?
    expect(toastStore.addToast).toHaveBeenCalledWith({
      message: 'deployment.summary.submitSuccess',
      type: 'success'
    })

    // Routing zur Liste
    expect(routerPushMock).toHaveBeenCalledWith({ name: 'deployments.list' })
  })

  it('handles submission errors and parses them correctly for the toast', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    const deploymentStore = useDeploymentStore()
    const toastStore = useToastStore()

    // Simuliere einen Fehler vom Backend ("file_too_large" Payload)
    deploymentStore.submitDraft = vi.fn().mockRejectedValue({
      response: {
        data: {
          detail: {
            reason: 'file_too_large',
            filename: 'test.zip',
            actual_bytes: 3145728, // 3 MB
            limit_bytes: 2097152 // 2 MB
          }
        }
      }
    })

    const deployBtn = wrapper.findAll('button').find(b => b.text().includes('deployment.actions.deploy'))
    await deployBtn?.trigger('click')
    await flushPromises()

    // Prüft ob der Error-Formatter korrekt gearbeitet hat
    expect(toastStore.addToast).toHaveBeenCalledWith({
      message: 'deployment.summary.errors.fileTooLarge', // Der i18n Key, den die Methode zurückgibt
      type: 'error'
    })
    
    // Da es fehlgeschlagen ist, sollte nicht weitergeleitet werden
    expect(routerPushMock).not.toHaveBeenCalledWith({ name: 'deployments.list' })
  })
})
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'

import AppsDetailView from '@/views/AppsDetailView.vue'

// ---------------------------------------------------------
// 1. Mocks & Setup
// ---------------------------------------------------------

// Router & Route
const mockPush = vi.fn()
const mockBack = vi.fn()
vi.mock('vue-router', () => ({
    useRouter: () => ({ push: mockPush, back: mockBack }),
    useRoute: () => ({ params: { id: 'app-123' } })
}))

// i18n
vi.mock('vue-i18n', () => ({
    useI18n: () => ({ t: (key: string) => key })
}))

// Toast
const mockToastError = vi.fn()
const mockToastSuccess = vi.fn()
const mockToastWarning = vi.fn()
const mockToastInfo = vi.fn()
vi.mock('@/composables/useToast', () => ({
    useToast: () => ({
        error: mockToastError,
        success: mockToastSuccess,
        warning: mockToastWarning,
        info: mockToastInfo
    })
}))

// API
vi.mock('@/api/app.api', () => ({
    appApi: {
        getById: vi.fn(),
        delete: vi.fn(),
        update: vi.fn()
    }
}))
import { appApi } from '@/api/app.api'

// Stores (Pinia) simulieren
const mockDeploymentReset = vi.fn()
const mockDeploymentDraft = { appId: '', releaseTag: '' }
const mockPrepareQuickDeploy = vi.fn()

vi.mock('@/stores/deployment.store', () => ({
    useDeploymentStore: () => ({
        resetDraft: mockDeploymentReset,
        draft: mockDeploymentDraft,
        prepareQuickDeploy: mockPrepareQuickDeploy
    })
}))

vi.mock('@/stores/openstack-credentials.store', () => ({
    useOpenStackCredentialsStore: () => ({
        isResolved: true,
        hasCredential: true
    })
}))

vi.mock('@/stores/auth.store', () => ({
    useAuthStore: () => ({
        isTeacherOrAdmin: false,
        userId: 'user-1'
    })
}))

// ---------------------------------------------------------
// 2. Die Tests
// ---------------------------------------------------------

describe('AppsDetailView.vue', () => {

    beforeEach(() => {
        vi.clearAllMocks()
        // Standard-Antwort der API
        ;(appApi.getById as any).mockResolvedValue({
            data: {
                id: 'app-123',
                name: 'Test App',
                description: 'Detail Beschreibung',
                userId: 'user-1',
                versions: ['v1.0', 'v2.0']
            }
        })
    })

    const mountComponent = () => {
        return mount(AppsDetailView, {
            global: {
                mocks: { $t: (msg: string) => msg },
                stubs: {
                    BaseButton: { template: '<button><slot /></button>' },
                    Modal: {
                        props: ['show'],
                        template: '<div v-if="$props.show" class="modal"><slot name="title" /><slot /><slot name="body" /><slot name="footer" /></div>'
                    },
                    RouterLink: true,
                    // Der Teilnehmer-Dialog lädt Kurse und Studierende selbst.
                    // Hier wird die View getestet, nicht der Dialog — gestubbt
                    // und über ``confirm`` ausgelöst.
                    QuickDeployModal: {
                        name: 'QuickDeployModal',
                        props: ['show', 'appName'],
                        template: '<div />'
                    },
                    MarkdownRenderer: {
                        props: ['source'],
                        template: '<div>{{ source }}</div>'
                    }
                }
            }
        })
    }

    // --- 1. Laden und Anzeigen ---

    it('lädt die App-Details anhand der ID aus der URL', async () => {
        const wrapper = mountComponent()
        await flushPromises()

        expect(appApi.getById).toHaveBeenCalledWith('app-123', false)
        expect(wrapper.text()).toContain('Test App')
        expect(wrapper.text()).toContain('Detail Beschreibung')
    })

    it('leitet zur Liste um und zeigt einen Fehler, wenn die App nicht gefunden wird', async () => {
        ;(appApi.getById as any).mockRejectedValue(new Error('Not found'))

        mountComponent()
        await flushPromises()

        expect(mockToastError).toHaveBeenCalledWith('AppsDetailView.toasts.loadError')
        expect(mockPush).toHaveBeenCalledWith({ name: 'apps.index' })
    })

    it('wählt automatisch die erste Version aus, wenn Versionen vorhanden sind', async () => {
        const wrapper = mountComponent()
        await flushPromises()

        const select = wrapper.find('select')
        expect(select.element.value).toBe('v1.0')
    })

    // --- 2. Deployment (Bereitstellung) ---

    it('speichert die Auswahl im Deployment-Store und navigiert zur Config', async () => {
        const wrapper = mountComponent()
        await flushPromises()

        const deployButton = wrapper.findAll('button').find(b => b.text().includes('AppsDetailView.deployButton'))!
        await deployButton.trigger('click')

        expect(mockDeploymentReset).toHaveBeenCalled()
        expect(mockDeploymentDraft.appId).toBe('app-123')
        expect(mockDeploymentDraft.releaseTag).toBe('v1.0')
        expect(mockPush).toHaveBeenCalledWith({ name: 'deployment.config' })
    })

    it('deaktiviert den Deploy-Button und warnt (Fallback), wenn keine Version ausgewählt ist', async () => {
        // API liefert App OHNE Versionen
        ;(appApi.getById as any).mockResolvedValue({
            data: { id: 'app-123', name: 'Leere App', versions: [] }
        })

        const wrapper = mountComponent()
        await flushPromises()

        const deployButton = wrapper.findAll('button').find(b => b.text().includes('AppsDetailView.deployButton'))!

        // 1. UI-Prüfung: Der Button muss für den Nutzer gesperrt (disabled) sein
        expect(deployButton.attributes('disabled')).toBeDefined()

        // 2. Logik-Prüfung: Wir rufen die interne Funktion direkt auf, um das Sicherheitsnetz zu testen
        ;(wrapper.vm as any).handleDeploy()

        expect(mockToastWarning).toHaveBeenCalledWith('AppsDetailView.toasts.selectVersionFirst')
        expect(mockPush).not.toHaveBeenCalled()
    })

    // --- 3. Löschen (Modal & API) ---

    it('zeigt den Lösch-Button an, wenn der Nutzer der Besitzer ist, und öffnet das Modal', async () => {
        const wrapper = mountComponent()
        await flushPromises()

        const deleteButton = wrapper.findAll('button').find(b => b.text().includes('AppsDetailView.deleteApp'))!
        expect(deleteButton.exists()).toBe(true)

        await deleteButton.trigger('click')
        await nextTick()

        const modal = wrapper.find('.modal')
        expect(modal.exists()).toBe(true)
        expect(modal.text()).toContain('AppsDetailView.confirmDeleteTitle')
    })

    it('löscht die App erfolgreich nach Bestätigung im Modal', async () => {
        ;(appApi.delete as any).mockResolvedValue({})

        const wrapper = mountComponent()
        await flushPromises()

        const deleteButton = wrapper.findAll('button').find(b => b.text().includes('AppsDetailView.deleteApp'))!
        await deleteButton.trigger('click')
        await nextTick()

        const confirmBtn = wrapper.findAll('.modal button').find(b => b.text().includes('AppsDetailView.confirmButton'))!
        await confirmBtn.trigger('click')
        await flushPromises()

        expect(appApi.delete).toHaveBeenCalledWith('app-123')
        expect(mockToastSuccess).toHaveBeenCalledWith('AppsDetailView.deleteSuccessToast')
        expect(mockPush).toHaveBeenCalledWith({ name: 'apps' })
    })

    // --- 4. Navigation ---

    it('navigiert zurück, wenn der Zurück-Button geklickt wird', async () => {
        const wrapper = mountComponent()
        await flushPromises()

        const backButton = wrapper.findAll('button').find(b => b.text().includes('AppsDetailView.backToOverview'))!
        await backButton.trigger('click')

        expect(mockBack).toHaveBeenCalledTimes(1)
    })

    // --- Quick deploy (Issue #11) ---

    describe('Quick deploy', () => {
        /**
         * Knopf klicken und den Teilnehmer-Dialog bestätigen. Der
         * Schnell-Deploy startet erst danach — der Knopf allein öffnet nur den
         * Dialog.
         */
        const clickQuickDeploy = async (memberIds: string[] = []) => {
            const wrapper = mountComponent()
            await flushPromises()
            await wrapper.find('[data-testid="app-detail-quick-deploy"]').trigger('click')
            await wrapper.findComponent({ name: 'QuickDeployModal' }).vm.$emit('confirm', memberIds)
            await flushPromises()
            return wrapper
        }

        it('reicht die hier gewählte Version an den Store durch', async () => {
            mockPrepareQuickDeploy.mockResolvedValue({ ready: true })
            await clickQuickDeploy()

            expect(mockPrepareQuickDeploy).toHaveBeenCalledWith('app-123', 'Test App', 'v1.0', [])
            expect(mockPush).toHaveBeenCalledWith({ name: 'deployment.summary' })
            expect(mockToastSuccess).toHaveBeenCalledWith('deployment.quickDeploy.ready')
        })

        it('leitet in den Wizard um, wenn Eingaben fehlen', async () => {
            mockPrepareQuickDeploy.mockResolvedValue({ ready: false, reason: 'needsInput' })
            await clickQuickDeploy()

            expect(mockToastInfo).toHaveBeenCalledWith('deployment.quickDeploy.needsInput')
            expect(mockPush).toHaveBeenCalledWith({ name: 'deployment.config' })
        })

        it('zeigt einen Fehler-Toast, wenn die Vorbereitung fehlschlägt', async () => {
            mockPrepareQuickDeploy.mockRejectedValue(new Error('boom'))
            await clickQuickDeploy()

            expect(mockToastError).toHaveBeenCalledWith('deployment.quickDeploy.error')
            expect(mockPush).not.toHaveBeenCalledWith({ name: 'deployment.summary' })
        })

        it('reicht die im Dialog gewählten Teilnehmer an den Store durch', async () => {
            mockPrepareQuickDeploy.mockResolvedValue({ ready: true })
            await clickQuickDeploy(['kc-1', 'kc-2'])

            expect(mockPrepareQuickDeploy).toHaveBeenCalledWith(
                'app-123', 'Test App', 'v1.0', ['kc-1', 'kc-2'],
            )
        })

        it('startet den Schnell-Deploy erst nach Bestätigung des Dialogs', async () => {
            mockPrepareQuickDeploy.mockResolvedValue({ ready: true })
            const wrapper = mountComponent()
            await flushPromises()

            await wrapper.find('[data-testid="app-detail-quick-deploy"]').trigger('click')
            await flushPromises()

            expect(mockPrepareQuickDeploy).not.toHaveBeenCalled()
        })
    })
    // --- 5. App-Metadaten (Issue #12) ---

    describe('App-Metadaten', () => {
        const appWithMetadata = {
            appId: 'app-123',
            name: 'Test App',
            description: 'Detail Beschreibung',
            userId: 'user-1',
            versions: ['v1.0'],
            vm_topology: 'shared',
            requirements: '4 GB RAM',
            recommended_for: 'Python-Kurse',
        }

        const openEditModal = async (wrapper: ReturnType<typeof mountComponent>) => {
            await wrapper.findAll('button').find(b => b.text().includes('AppsDetailView.editApp'))!.trigger('click')
        }

        const saveEdit = async (wrapper: ReturnType<typeof mountComponent>) => {
            await wrapper.findAll('.modal button').find(b => b.text().includes('AppsDetailView.editModal.saveButton'))!.trigger('click')
            await flushPromises()
        }

        it('zeigt Topologie, Empfehlung und Anforderungen an', async () => {
            ;(appApi.getById as any).mockResolvedValue({ data: appWithMetadata })
            const wrapper = mountComponent()
            await flushPromises()

            const box = wrapper.find('[data-testid="app-detail-metadata"]')
            expect(box.exists()).toBe(true)
            expect(box.find('[data-testid="app-detail-topology"]').text()).toBe('AppsCreateView.topology.shared')
            expect(box.text()).toContain('4 GB RAM')
            expect(box.text()).toContain('Python-Kurse')
        })

        it('blendet den Abschnitt aus, wenn keine Metadaten gesetzt sind', async () => {
            const wrapper = mountComponent()
            await flushPromises()

            expect(wrapper.find('[data-testid="app-detail-metadata"]').exists()).toBe(false)
        })

        it('sendet beim Bearbeiten nur geänderte Felder, geleerte als null', async () => {
            ;(appApi.getById as any).mockResolvedValue({ data: appWithMetadata })
            ;(appApi.update as any).mockResolvedValue({ data: {} })
            const wrapper = mountComponent()
            await flushPromises()

            await openEditModal(wrapper)
            await wrapper.find('[data-testid="edit-topology"]').setValue('per_team')
            await wrapper.find('[data-testid="edit-requirements"]').setValue('')
            await saveEdit(wrapper)

            expect(appApi.update).toHaveBeenCalledWith('app-123', {
                vm_topology: 'per_team',
                requirements: null,
            })
            expect(mockToastSuccess).toHaveBeenCalledWith('AppsDetailView.toasts.editSuccess')
        })

        it('zeigt einen Fehler-Toast, wenn das Speichern fehlschlägt', async () => {
            ;(appApi.getById as any).mockResolvedValue({ data: appWithMetadata })
            ;(appApi.update as any).mockRejectedValue(new Error('boom'))
            const wrapper = mountComponent()
            await flushPromises()

            await openEditModal(wrapper)
            await wrapper.find('[data-testid="edit-recommended-for"]').setValue('Statistik')
            await saveEdit(wrapper)

            expect(mockToastError).toHaveBeenCalledWith('AppsDetailView.toasts.editError')
        })
    })
})

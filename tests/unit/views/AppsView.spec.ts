import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'

import AppsView from '@/views/AppsView.vue'
import { Server, Globe, Box, Layers } from 'lucide-vue-next'

// ---------------------------------------------------------
// 1. Abhängigkeiten (Dependencies) "mocken"
// ---------------------------------------------------------

const mockPush = vi.fn()
vi.mock('vue-router', () => ({
    useRouter: () => ({ push: mockPush })
}))

vi.mock('vue-i18n', () => ({
    useI18n: () => ({
        t: (key: string) => key,
        locale: 'de'
    })
}))

const mockToastError = vi.fn()
const mockToastSuccess = vi.fn()
const mockToastInfo = vi.fn()
const mockToastWarning = vi.fn()
vi.mock('@/composables/useToast', () => ({
    useToast: () => ({
        error: mockToastError,
        success: mockToastSuccess,
        info: mockToastInfo,
        warning: mockToastWarning,
    })
}))

vi.mock('@/stores/auth.store', () => ({
    useAuthStore: () => ({ userId: 'other-user-id', isTeacherOrAdmin: false })
}))

const mockPrepareQuickDeploy = vi.fn()
vi.mock('@/stores/deployment.store', () => ({
    useDeploymentStore: () => ({ prepareQuickDeploy: mockPrepareQuickDeploy })
}))

// Credential state per test case — the quick deploy button gates on it.
let mockHasCredential = true
vi.mock('@/stores/openstack-credentials.store', () => ({
    useOpenStackCredentialsStore: () => ({
        isResolved: true,
        get hasCredential() { return mockHasCredential }
    })
}))

vi.mock('@/api/app.api', () => ({
    appApi: {
        list: vi.fn(),
        listVersionApprovals: vi.fn().mockResolvedValue({ data: [] }),
    }
}))
import { appApi } from '@/api/app.api'

// ---------------------------------------------------------
// 2. Die Tests
// ---------------------------------------------------------

describe('AppsView.vue', () => {

    beforeEach(() => {
        vi.clearAllMocks()
        mockHasCredential = true
        // Unterdrücke die Konsolenausgabe für Fehler in unseren Tests
        vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    const mountComponent = () => {
        return mount(AppsView, {
            global: {
                mocks: {
                    $t: (msg: string) => msg
                },
                stubs: {
                    RouterLink: {
                        props: ['to'],
                        template: '<a :href="to.name" class="router-link-stub"><slot /></a>'
                    },
                    BackCard: { template: '<div><slot /></div>' },
                    BaseButton: { template: '<button><slot /></button>' },
                    AppVersionStatusBadge: { template: '<span></span>' },
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

    // --- Critical Path (Haupt-Funktionen) ---

    it('zeigt den "Empty State" (Keine Apps) an, wenn die API ein leeres Array zurückgibt', async () => {
        ;(appApi.list as any).mockResolvedValue({ data: [] })
        const wrapper = mountComponent()
        await flushPromises()

        // The unified ``EntityListState`` component renders only the
        // description text (no separate heading) when the page is
        // empty — kept consistent across Apps, Deployments, Kurse,
        // Approvals. The ``noAppsTitle`` i18n key is unused since
        // the refactor; keeping the assertion would just test a
        // legacy code path.
        expect(wrapper.text()).toContain('AppsView.noAppsDesc')
    })

    it('zeigt eine Liste von Apps an, wenn die API Daten liefert', async () => {
        const mockApps = [
                { id: '1', name: 'Meine erste Vue App', description: 'Frontend' },
                { id: '2', name: 'NodeJS Backend', description: 'API' }
            ]
        ;(appApi.list as any).mockResolvedValue({ data: mockApps })

        const wrapper = mountComponent()
        await flushPromises()

        expect(wrapper.text()).toContain('Meine erste Vue App')
        expect(wrapper.text()).toContain('NodeJS Backend')
    })

    it('zeigt eine Fehlermeldung (Toast) an, wenn der API-Aufruf fehlschlägt', async () => {
        ;(appApi.list as any).mockRejectedValue(new Error('Netzwerkfehler'))
        mountComponent()
        await flushPromises()

        expect(mockToastError).toHaveBeenCalledTimes(1)
        expect(mockToastError).toHaveBeenCalledWith('AppsView.loadError')
    })

    it('navigiert zur Detailseite, wenn auf "Details" geklickt wird', async () => {
        const mockApps = [{ id: 'app-999', name: 'Test App' }]
        ;(appApi.list as any).mockResolvedValue({ data: mockApps })

        const wrapper = mountComponent()
        await flushPromises()

        const buttons = wrapper.findAll('button')
        const detailButton = buttons.find(b => b.text().includes('AppsView.detailsDeploy'))

        await detailButton!.trigger('click')

        expect(mockPush).toHaveBeenCalledWith({
            name: 'apps.detail',
            params: { id: 'app-999' }
        })
    })

    // --- Erweiterte Tests (Edge Cases & UI Logik) ---

    it('i18n: verwendet die richtigen Übersetzungs-Keys für statische Texte', async () => {
        ;(appApi.list as any).mockResolvedValue({ data: [] })
        const wrapper = mountComponent()
        await flushPromises()

        expect(wrapper.text()).toContain('AppsView.title')
        expect(wrapper.text()).toContain('AppsView.subtitle')
        expect(wrapper.text()).toContain('AppsView.addApp')
    })

    it('Router: der "Hinzufügen" Button verweist auf die richtige Route (apps.create)', async () => {
        ;(appApi.list as any).mockResolvedValue({ data: [] })
        const wrapper = mountComponent()
        await flushPromises()

        const addLink = wrapper.find('a.router-link-stub')
        expect(addLink.attributes('href')).toBe('apps.create')
    })

    it('Icons: rendert das richtige Icon basierend auf dem App-Namen', async () => {
        const mockApps = [
                { id: '1', name: 'Meine Node App' },     // Sollte 'Server' Icon auslösen
                { id: '2', name: 'React Dashboard' },    // Sollte 'Globe' Icon auslösen
                { id: '3', name: 'Python Skript' },      // Sollte 'Box' Icon auslösen
                { id: '4', name: 'Unbekannte App' }      // Sollte 'Layers' Icon (Default) auslösen
            ]
        ;(appApi.list as any).mockResolvedValue({ data: mockApps })

        const wrapper = mountComponent()
        await flushPromises()

        expect(wrapper.findComponent(Server).exists()).toBe(true)
        expect(wrapper.findComponent(Globe).exists()).toBe(true)
        expect(wrapper.findComponent(Box).exists()).toBe(true)
        expect(wrapper.findComponent(Layers).exists()).toBe(true)
    })

    it('zeigt einen Lade-Text/Spinner an, während die Daten geladen werden', async () => {
        let resolveApi: any
        ;(appApi.list as any).mockReturnValue(new Promise(resolve => {
            resolveApi = resolve
        }))

        const wrapper = mountComponent()
        await nextTick()

        expect(wrapper.text()).toContain('AppsView.loading')
        resolveApi({ data: [] })
    })

    it('zeigt ein Bild anstelle eines Icons, wenn die App ein eigenes Bild hat', async () => {
        const mockApps = [{
                id: 'custom-img',
                name: 'App mit Logo',
                image: 'https://mein-server.de/logo.png'
            }]
        ;(appApi.list as any).mockResolvedValue({ data: mockApps })

        const wrapper = mountComponent()
        await flushPromises()

        const img = wrapper.find('img')
        expect(img.exists()).toBe(true)
        expect(img.attributes('src')).toBe('https://mein-server.de/logo.png')
    })

    // --- Quick deploy (Issue #11) ---

    describe('Quick deploy', () => {
        const mountWithApp = async () => {
            ;(appApi.list as any).mockResolvedValue({
                data: [{ appId: 'app-1', name: 'Jupyter-Notebook' }]
            })
            const wrapper = mountComponent()
            await flushPromises()
            return wrapper
        }

        /**
         * Kachel-Knopf klicken und den Teilnehmer-Dialog bestätigen. Der
         * Schnell-Deploy startet erst danach — der Knopf allein öffnet nur den
         * Dialog.
         */
        const quickDeploy = async (wrapper: any, memberIds: string[] = []) => {
            await wrapper.find('[data-testid="app-quick-deploy"]').trigger('click')
            await wrapper.findComponent({ name: 'QuickDeployModal' }).vm.$emit('confirm', memberIds)
            await flushPromises()
        }

        it('springt direkt zur Zusammenfassung, wenn der Draft vollständig ist', async () => {
            mockPrepareQuickDeploy.mockResolvedValue({ ready: true })
            const wrapper = await mountWithApp()

            await quickDeploy(wrapper)

            expect(mockPrepareQuickDeploy).toHaveBeenCalledWith('app-1', 'Jupyter-Notebook', undefined, [])
            expect(mockPush).toHaveBeenCalledWith({ name: 'deployment.summary' })
            expect(mockToastSuccess).toHaveBeenCalledWith('deployment.quickDeploy.ready')
        })

        it('reicht die im Dialog gewählten Teilnehmer an den Store durch', async () => {
            mockPrepareQuickDeploy.mockResolvedValue({ ready: true })
            const wrapper = await mountWithApp()

            await quickDeploy(wrapper, ['kc-1', 'kc-2'])

            expect(mockPrepareQuickDeploy).toHaveBeenCalledWith(
                'app-1', 'Jupyter-Notebook', undefined, ['kc-1', 'kc-2'],
            )
        })

        it('startet den Schnell-Deploy erst nach Bestätigung des Dialogs', async () => {
            // Der Knopf öffnet nur den Dialog. Ohne diese Trennung wäre die
            // Teilnehmerauswahl wirkungslos.
            mockPrepareQuickDeploy.mockResolvedValue({ ready: true })
            const wrapper = await mountWithApp()

            await wrapper.find('[data-testid="app-quick-deploy"]').trigger('click')
            await flushPromises()

            expect(mockPrepareQuickDeploy).not.toHaveBeenCalled()
        })

        it('leitet in den Wizard um, wenn Variablen Eingaben brauchen', async () => {
            mockPrepareQuickDeploy.mockResolvedValue({ ready: false, reason: 'needsInput' })
            const wrapper = await mountWithApp()

            await quickDeploy(wrapper)

            expect(mockPush).toHaveBeenCalledWith({ name: 'deployment.config' })
            expect(mockToastInfo).toHaveBeenCalledWith('deployment.quickDeploy.needsInput')
        })

        it('führt ohne deploybare Version zurück auf die Detailseite', async () => {
            mockPrepareQuickDeploy.mockResolvedValue({ ready: false, reason: 'noVersion' })
            const wrapper = await mountWithApp()

            await quickDeploy(wrapper)

            expect(mockToastWarning).toHaveBeenCalledWith('deployment.quickDeploy.noVersion')
            expect(mockPush).toHaveBeenCalledWith({
                name: 'apps.detail',
                params: { id: 'app-1' }
            })
        })

        it('zeigt einen Fehler-Toast, wenn die Vorbereitung fehlschlägt', async () => {
            mockPrepareQuickDeploy.mockRejectedValue(new Error('boom'))
            const wrapper = await mountWithApp()

            await quickDeploy(wrapper)

            expect(mockToastError).toHaveBeenCalledWith('deployment.quickDeploy.error')
            expect(mockPush).not.toHaveBeenCalledWith({ name: 'deployment.summary' })
        })

        it('ist gesperrt, solange keine OpenStack-Credentials hinterlegt sind', async () => {
            mockHasCredential = false
            mockPrepareQuickDeploy.mockResolvedValue({ ready: true })
            const wrapper = await mountWithApp()

            const button = wrapper.find('[data-testid="app-quick-deploy"]')
            expect(button.attributes('disabled')).toBeDefined()
            expect(button.attributes('title')).toBe('deployment.quickDeploy.missingCreds')

            await button.trigger('click')
            await flushPromises()
            expect(mockPrepareQuickDeploy).not.toHaveBeenCalled()
        })

        it('öffnet nicht die Detailseite, wenn der Quick-Deploy-Button geklickt wird', async () => {
            mockPrepareQuickDeploy.mockResolvedValue({ ready: true })
            const wrapper = await mountWithApp()

            await wrapper.find('[data-testid="app-quick-deploy"]').trigger('click')
            await flushPromises()

            // ``@click.stop`` — sonst würde der Karten-Klick zusätzlich navigieren.
            expect(mockPush).not.toHaveBeenCalledWith({
                name: 'apps.detail',
                params: { id: 'app-1' }
            })
        })
    })
})

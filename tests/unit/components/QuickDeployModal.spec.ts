/**
 * Teilnehmerauswahl für den Schnell-Deploy.
 *
 * Die View-Tests stubben diesen Dialog weg und prüfen nur die Verdrahtung —
 * ob der Dialog selbst die richtigen Teilnehmer liefert, fällt dort durch.
 * Genau das ist aber der Kern: Gibt er die falschen Kürzel heraus, bekommt der
 * falsche Personenkreis eine Umgebung, und auffallen würde es erst nach dem
 * Deploy.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({ t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key} ${JSON.stringify(vars)}` : key) }),
}))

const listCourses = vi.fn()
const getCourse = vi.fn()

vi.mock('@/api/course.api', () => ({
  courseApi: {
    list: (...args: unknown[]) => listCourses(...args),
    getById: (...args: unknown[]) => getCourse(...args),
  },
}))

vi.mock('@/stores/auth.store', () => ({
  useAuthStore: () => ({
    user: { firstName: 'Michael', lastName: 'Eichberg', username: 'm.eichberg' },
  }),
}))

const studentCache = new Map<string, unknown>()
vi.mock('@/stores/deployment.store', () => ({
  useDeploymentStore: () => ({ studentCache }),
}))

import QuickDeployModal from '@/components/QuickDeployModal.vue'

const student = (id: string, first: string) => ({
  userId: `db-${id}`,
  keycloak_id: id,
  firstName: first,
  lastName: 'Muster',
  username: first.toLowerCase(),
  email: `${first.toLowerCase()}@dhbw.de`,
  role: 'student',
  courseId: 'course-1',
  created_at: '2026-01-01',
})

const mountModal = async () => {
  const wrapper = mount(QuickDeployModal, {
    props: { show: true, appName: 'Jupyter-Notebook' },
    global: {
      stubs: {
        Modal: { props: ['show'], template: '<div><slot name="title" /><slot name="body" /><slot name="footer" /></div>' },
        BaseButton: { props: ['disabled'], template: '<button :disabled="disabled"><slot /></button>' },
      },
    },
  })
  await flushPromises()
  return wrapper
}

/** Kurs im Dropdown wählen und das Nachladen abwarten. */
const selectCourse = async (wrapper: Awaited<ReturnType<typeof mountModal>>, id: string) => {
  await wrapper.find('[data-testid="quick-deploy-course"]').setValue(id)
  await flushPromises()
}

describe('QuickDeployModal.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    studentCache.clear()
    listCourses.mockResolvedValue({ data: [{ courseId: 'course-1', name: 'Softwaretechnik' }] })
    getCourse.mockResolvedValue({ data: { users: [student('kc-a', 'Anna'), student('kc-b', 'Ben')] } })
  })

  it('lädt die Kurse beim Öffnen', async () => {
    await mountModal()

    expect(listCourses).toHaveBeenCalled()
  })

  it('startet auf „nur ich" und sendet dafür eine leere Liste', async () => {
    // Leer heißt für den Store „nimm den Dozenten" — so bleibt das Ausprobieren
    // einer App ohne Kurs möglich.
    const wrapper = await mountModal()

    await wrapper.find('[data-testid="quick-deploy-confirm"]').trigger('click')

    expect(wrapper.emitted('confirm')?.[0]).toEqual([[]])
  })

  it('lädt die Teilnehmer des gewählten Kurses und wählt alle vor', async () => {
    const wrapper = await mountModal()

    await selectCourse(wrapper, 'course-1')

    expect(getCourse).toHaveBeenCalledWith('course-1')
    await wrapper.find('[data-testid="quick-deploy-confirm"]').trigger('click')
    expect(wrapper.emitted('confirm')?.[0]).toEqual([['kc-a', 'kc-b']])
  })

  it('übernimmt nur die noch angehakten Teilnehmer', async () => {
    const wrapper = await mountModal()
    await selectCourse(wrapper, 'course-1')

    const boxes = wrapper.findAll('input[type="checkbox"]')
    await boxes[0]!.setValue(false)
    await wrapper.find('[data-testid="quick-deploy-confirm"]').trigger('click')

    expect(wrapper.emitted('confirm')?.[0]).toEqual([['kc-b']])
  })

  it('sperrt die Bestätigung, wenn kein Teilnehmer übrig ist', async () => {
    // Ohne Mitglied gäbe es keine VM — das Deployment wäre leer.
    const wrapper = await mountModal()
    await selectCourse(wrapper, 'course-1')

    for (const box of wrapper.findAll('input[type="checkbox"]')) {
      await box.setValue(false)
    }

    expect(wrapper.find('[data-testid="quick-deploy-confirm"]').attributes('disabled')).toBeDefined()
  })

  it('filtert Teilnehmer ohne Keycloak-Subject heraus', async () => {
    // Über dieses Subject läuft die Mitgliedschaft; ohne es ließe sich der
    // Eintrag nicht anlegen. Betrifft LTI-Konten ohne Keycloak-Verknüpfung.
    getCourse.mockResolvedValue({
      data: { users: [student('kc-a', 'Anna'), { ...student('', 'Ohne'), keycloak_id: null }] },
    })
    const wrapper = await mountModal()

    await selectCourse(wrapper, 'course-1')

    expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(1)
    await wrapper.find('[data-testid="quick-deploy-confirm"]').trigger('click')
    expect(wrapper.emitted('confirm')?.[0]).toEqual([['kc-a']])
  })

  it('legt die Teilnehmer im studentCache ab', async () => {
    // Die Zusammenfassung löst Namen darüber auf und zeigt sonst rohe UUIDs.
    const wrapper = await mountModal()

    await selectCourse(wrapper, 'course-1')

    expect(studentCache.has('kc-a')).toBe(true)
    expect(studentCache.has('kc-b')).toBe(true)
  })

  it('bleibt bedienbar, wenn die Kursliste nicht lädt', async () => {
    // Fällt der Abruf aus, muss wenigstens „nur ich" noch gehen.
    listCourses.mockRejectedValue(new Error('boom'))
    const wrapper = await mountModal()

    expect(wrapper.find('[data-testid="quick-deploy-confirm"]').attributes('disabled')).toBeUndefined()
  })
})

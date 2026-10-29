/**
 * KubernetesStudentsPanel — Studierenden-Pods einer Kubernetes-App (Issue #36).
 *
 * Lokal lässt sich die Kubernetes-App nicht deployen, die Oberfläche ist also
 * nur auf Staging sichtbar. Diese Spec deckt deshalb das Verhalten ab, das
 * man dort nicht gefahrlos ausprobiert: Bestätigung vor destruktiven Aktionen,
 * gesperrte Buttons während eines Tasks und das Einmal-Passwort.
 *
 * Echtes Pinia, gemockt wird nur die API — so läuft der Store mit.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

import KubernetesStudentsPanel from '@/components/deployment/KubernetesStudentsPanel.vue'
import { labApi } from '@/api/lab.api'
import type { DeploymentTeam, LabResult, LabStudent, Task } from '@/types'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string, v?: unknown) => (v ? `${k} ${JSON.stringify(v)}` : k) }),
}))

const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
}))
vi.mock('@/composables/useToast', () => ({ useToast: () => toast }))

const saveBlob = vi.hoisted(() => vi.fn())
vi.mock('@/utils/download', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/download')>()),
  saveBlob,
}))

vi.mock('@/api/lab.api', () => ({
  labApi: {
    listStudents: vi.fn(),
    downloadKubeconfig: vi.fn(),
    addStudent: vi.fn(),
    reassignStudent: vi.fn(),
    resetStudent: vi.fn(),
    changeStudentPassword: vi.fn(),
    removeStudent: vi.fn(),
  },
}))

const team: DeploymentTeam = { teamId: 'team-1', name: 'Team A', members: [] }

const student = (overrides: Partial<LabStudent> = {}): LabStudent => ({
  username: 'alice',
  port: 30001,
  generation: 2,
  pod_name: 'alice-7d9f',
  pod_phase: 'Running',
  pod_age: '2026-10-28T10:00:00Z',
  ready: true,
  ...overrides,
})

const task = (overrides: Partial<Task> = {}): Task => ({
  taskId: 'task-9',
  deploymentId: 'dep-1',
  celeryTaskId: '',
  type: 'lab_reset',
  status: 'success',
  started_at: null,
  finished_at: null,
  logs: null,
  tf_state: null,
  outputs: null,
  current_phase: null,
  progress_pct: null,
  created_at: '2026-10-28T10:00:00Z',
  ...overrides,
})

const accepted = { data: { task_id: 'task-9', status: 'pending' } }

interface PanelProps {
  busy?: boolean
  tasks?: Task[]
  labResult?: LabResult | null
}

const mountPanel = (props: PanelProps = {}) =>
  mount(KubernetesStudentsPanel, {
    props: {
      deploymentId: 'dep-1',
      teams: [team],
      busy: props.busy ?? false,
      tasks: props.tasks ?? [],
      labResult: props.labResult ?? null,
    },
    global: {
      mocks: { $t: (k: string, v?: unknown) => (v ? `${k} ${JSON.stringify(v)}` : k) },
      stubs: {
        // Modal ohne Teleport/Animation, aber mit allen Slots.
        Modal: {
          props: ['show'],
          emits: ['close'],
          template: '<div v-if="show" class="modal"><slot name="title" /><slot name="body" /><slot name="footer" /></div>',
        },
      },
    },
  })

const byTestId = (wrapper: ReturnType<typeof mountPanel>, id: string) => wrapper.find(`[data-testid="${id}"]`)

describe('KubernetesStudentsPanel.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.mocked(labApi.listStudents).mockResolvedValue({ data: [student()] } as never)
  })

  it('lädt beim Mount die Studierenden jedes Teams und zeigt die Zeilen', async () => {
    const wrapper = mountPanel()
    await flushPromises()

    expect(labApi.listStudents).toHaveBeenCalledWith('dep-1', 'team-1')
    const row = byTestId(wrapper, 'k8s-student-alice')
    expect(row.exists()).toBe(true)
    expect(row.text()).toContain('30001')
    expect(row.text()).toContain('alice-7d9f')
  })

  it('zeigt den Status als Text, nicht nur als Farbe', async () => {
    vi.mocked(labApi.listStudents).mockResolvedValue({
      data: [student(), student({ username: 'bob', ready: false, pod_phase: 'Pending' }), student({ username: 'carl', pod_name: null, pod_phase: null, ready: false })],
    } as never)
    const wrapper = mountPanel()
    await flushPromises()

    const statuses = wrapper.findAll('[data-testid="k8s-status"]').map((s) => s.text())
    expect(statuses).toEqual([
      'KubernetesStudentsPanel.status.ready',
      'Pending',
      'KubernetesStudentsPanel.status.noPod',
    ])
    // Pending heißt meist: VM voll — der Hinweis erklärt das.
    expect(byTestId(wrapper, 'k8s-pending-hint').exists()).toBe(true)
  })

  it('zeigt einen übersetzten Fehler, wenn der Cluster noch nicht deployt ist', async () => {
    vi.mocked(labApi.listStudents).mockRejectedValue({
      response: { status: 412, data: { detail: { reason: 'lab_not_deployed' } } },
    })
    const wrapper = mountPanel()
    await flushPromises()

    expect(byTestId(wrapper, 'k8s-team-error').text()).toContain('KubernetesStudentsPanel.errors.notDeployed')
    expect(byTestId(wrapper, 'k8s-add').attributes('disabled')).toBeDefined()
  })

  it('zeigt den Leerzustand ohne Studierende', async () => {
    vi.mocked(labApi.listStudents).mockResolvedValue({ data: [] } as never)
    const wrapper = mountPanel()
    await flushPromises()

    expect(wrapper.text()).toContain('KubernetesStudentsPanel.empty')
  })

  it('sperrt alle Aktionen, solange ein Task läuft', async () => {
    const wrapper = mountPanel({ busy: true })
    await flushPromises()

    for (const id of ['k8s-add', 'k8s-reassign', 'k8s-passwd', 'k8s-reset', 'k8s-remove']) {
      expect(byTestId(wrapper, id).attributes('disabled'), id).toBeDefined()
    }
  })

  it('setzt erst nach Bestätigung zurück und meldet den Task', async () => {
    vi.mocked(labApi.resetStudent).mockResolvedValue(accepted as never)
    const wrapper = mountPanel()
    await flushPromises()

    await byTestId(wrapper, 'k8s-reset').trigger('click')
    expect(labApi.resetStudent).not.toHaveBeenCalled()
    expect(wrapper.find('.modal').text()).toContain('KubernetesStudentsPanel.reset.body')

    await byTestId(wrapper, 'k8s-reset-new-password').setValue(true)
    await byTestId(wrapper, 'k8s-reset-confirm').trigger('click')
    await flushPromises()

    expect(labApi.resetStudent).toHaveBeenCalledWith('dep-1', 'team-1', 'alice', true)
    expect(wrapper.emitted('action-started')).toEqual([['task-9']])
    expect(wrapper.find('.modal').exists()).toBe(false)
  })

  it('entfernt erst nach Bestätigung', async () => {
    vi.mocked(labApi.removeStudent).mockResolvedValue(accepted as never)
    const wrapper = mountPanel()
    await flushPromises()

    await byTestId(wrapper, 'k8s-remove').trigger('click')
    expect(labApi.removeStudent).not.toHaveBeenCalled()

    await byTestId(wrapper, 'k8s-remove-confirm').trigger('click')
    await flushPromises()

    expect(labApi.removeStudent).toHaveBeenCalledWith('dep-1', 'team-1', 'alice')
  })

  it('weist ohne Rückfrage neu zu (Home bleibt erhalten)', async () => {
    vi.mocked(labApi.reassignStudent).mockResolvedValue(accepted as never)
    const wrapper = mountPanel()
    await flushPromises()

    await byTestId(wrapper, 'k8s-reassign').trigger('click')
    await flushPromises()

    expect(labApi.reassignStudent).toHaveBeenCalledWith('dep-1', 'team-1', 'alice')
    expect(toast.info).toHaveBeenCalled()
  })

  it('prüft Benutzername und Port, bevor es hinzufügt', async () => {
    vi.mocked(labApi.addStudent).mockResolvedValue(accepted as never)
    const wrapper = mountPanel()
    await flushPromises()

    await byTestId(wrapper, 'k8s-add').trigger('click')
    await byTestId(wrapper, 'k8s-add-username').setValue('Bad_Name')
    await byTestId(wrapper, 'k8s-add-submit').trigger('click')
    expect(labApi.addStudent).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('KubernetesStudentsPanel.add.invalidUsername')

    await byTestId(wrapper, 'k8s-add-username').setValue('dave')
    await byTestId(wrapper, 'k8s-add-port').setValue('80')
    await byTestId(wrapper, 'k8s-add-submit').trigger('click')
    expect(labApi.addStudent).not.toHaveBeenCalled()

    await byTestId(wrapper, 'k8s-add-port').setValue('30010')
    await byTestId(wrapper, 'k8s-add-submit').trigger('click')
    await flushPromises()

    // Ohne Passwort → das Feld fehlt, der Worker erzeugt eines.
    expect(labApi.addStudent).toHaveBeenCalledWith('dep-1', 'team-1', { username: 'dave', port: 30010 })
  })

  it('meldet einen 409 als „es läuft schon ein Task“', async () => {
    vi.mocked(labApi.reassignStudent).mockRejectedValue({
      response: { status: 409, data: { detail: 'Deployment already has an active task' } },
    })
    const wrapper = mountPanel()
    await flushPromises()

    await byTestId(wrapper, 'k8s-reassign').trigger('click')
    await flushPromises()

    expect(toast.error).toHaveBeenCalledWith('KubernetesStudentsPanel.errors.taskActive')
    expect(wrapper.emitted('action-started')).toBeUndefined()
  })

  it('meldet das Ende des eigenen Tasks und lädt die Liste neu', async () => {
    vi.mocked(labApi.reassignStudent).mockResolvedValue(accepted as never)
    const wrapper = mountPanel()
    await flushPromises()
    await byTestId(wrapper, 'k8s-reassign').trigger('click')
    await flushPromises()
    vi.mocked(labApi.listStudents).mockClear()

    await wrapper.setProps({ tasks: [task({ status: 'failed' })] })
    await flushPromises()

    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('KubernetesStudentsPanel.toasts.failed'))
    expect(labApi.listStudents).toHaveBeenCalledWith('dep-1', 'team-1')
    // Aktionen sind wieder frei.
    expect(byTestId(wrapper, 'k8s-reassign').attributes('disabled')).toBeUndefined()
  })

  it('zeigt das Einmal-Passwort und verwirft es beim Schließen', async () => {
    const wrapper = mountPanel()
    await flushPromises()

    await wrapper.setProps({ labResult: { username: 'alice', generated_password: 's3cret', port: 30001 } })
    expect(byTestId(wrapper, 'k8s-password-value').text()).toBe('s3cret')

    const closeButton = wrapper.find('.modal').findAll('button').find((b) => b.text() === 'action.close')
    await closeButton!.trigger('click')

    expect(byTestId(wrapper, 'k8s-password-reveal').exists()).toBe(false)
    expect(wrapper.html()).not.toContain('s3cret')
  })

  it('lädt die Kubeconfig erst nach dem Warnhinweis herunter', async () => {
    const blob = new Blob(['apiVersion: v1'])
    vi.mocked(labApi.downloadKubeconfig).mockResolvedValue({ data: blob, headers: {} } as never)
    const wrapper = mountPanel()
    await flushPromises()

    await byTestId(wrapper, 'k8s-kubeconfig').trigger('click')
    expect(labApi.downloadKubeconfig).not.toHaveBeenCalled()
    expect(wrapper.find('.modal').text()).toContain('KubernetesStudentsPanel.kubeconfig.adminWarning')

    await byTestId(wrapper, 'k8s-kubeconfig-confirm').trigger('click')
    await flushPromises()

    expect(saveBlob).toHaveBeenCalledWith(blob, 'Team A.kubeconfig')
  })
})

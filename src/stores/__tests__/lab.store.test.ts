import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useLabStore } from '../lab.store'
import { labApi } from '@/api/lab.api'
import type { LabStudent } from '@/types'

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

const student = (overrides: Partial<LabStudent> = {}): LabStudent => ({
  username: 'alice',
  port: 30001,
  generation: 1,
  pod_name: 'alice-abc',
  pod_phase: 'Running',
  pod_age: '2026-10-28T10:00:00Z',
  ready: true,
  ...overrides,
})

describe('lab store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('keeps the student list per team', async () => {
    vi.mocked(labApi.listStudents).mockResolvedValueOnce({ data: [student()] } as never)
    const store = useLabStore()

    await store.fetchStudents('dep-1', 'team-1')

    expect(labApi.listStudents).toHaveBeenCalledWith('dep-1', 'team-1')
    expect(store.studentsByTeam['team-1']).toEqual([student()])
    expect(store.loadingByTeam['team-1']).toBe(false)
    expect(store.errorByTeam['team-1']).toBeUndefined()
  })

  it('maps a 412 lab_not_deployed to a translatable key and drops the stale list', async () => {
    const store = useLabStore()
    store.studentsByTeam['team-1'] = [student()]
    vi.mocked(labApi.listStudents).mockRejectedValueOnce({
      response: { status: 412, data: { detail: { reason: 'lab_not_deployed' } } },
    })

    await store.fetchStudents('dep-1', 'team-1')

    expect(store.errorByTeam['team-1']).toEqual({
      key: 'KubernetesStudentsPanel.errors.notDeployed',
      message: 'lab_not_deployed',
    })
    expect(store.studentsByTeam['team-1']).toBeUndefined()
  })

  it('isolates errors per team', async () => {
    vi.mocked(labApi.listStudents)
      .mockRejectedValueOnce({ response: { status: 502, data: { detail: { reason: 'lab_cluster_unavailable' } } } })
      .mockResolvedValueOnce({ data: [student({ username: 'bob' })] } as never)
    const store = useLabStore()

    await store.fetchStudents('dep-1', 'team-1')
    await store.fetchStudents('dep-1', 'team-2')

    expect(store.errorByTeam['team-1']?.key).toBe('KubernetesStudentsPanel.errors.clusterUnavailable')
    expect(store.errorByTeam['team-2']).toBeUndefined()
    expect(store.studentsByTeam['team-2']?.[0]?.username).toBe('bob')
  })

  it('clears a previous team error on a successful reload', async () => {
    const store = useLabStore()
    store.errorByTeam['team-1'] = { key: null, message: 'old' }
    vi.mocked(labApi.listStudents).mockResolvedValueOnce({ data: [] } as never)

    await store.fetchStudents('dep-1', 'team-1')

    expect(store.errorByTeam['team-1']).toBeUndefined()
  })

  it('returns the accepted task of a mutating action', async () => {
    vi.mocked(labApi.resetStudent).mockResolvedValueOnce({ data: { task_id: 't-1', status: 'pending' } } as never)
    const store = useLabStore()

    const accepted = await store.resetStudent('dep-1', 'team-1', 'alice', true)

    expect(labApi.resetStudent).toHaveBeenCalledWith('dep-1', 'team-1', 'alice', true)
    expect(accepted).toEqual({ task_id: 't-1', status: 'pending' })
    expect(store.isLoading).toBe(false)
  })

  it('re-throws a failed action so the caller can react', async () => {
    const err = { response: { status: 409, data: { detail: 'Deployment already has an active task' } } }
    vi.mocked(labApi.removeStudent).mockRejectedValueOnce(err)
    const store = useLabStore()

    await expect(store.removeStudent('dep-1', 'team-1', 'alice')).rejects.toBe(err)
    expect(store.error).toBe('Deployment already has an active task')
    expect(store.isLoading).toBe(false)
  })

  it('hands the kubeconfig to the caller without keeping it in state', async () => {
    const blob = new Blob(['apiVersion: v1'])
    vi.mocked(labApi.downloadKubeconfig).mockResolvedValueOnce({
      data: blob,
      headers: { 'content-disposition': 'attachment; filename="Team-A.kubeconfig"' },
    } as never)
    const store = useLabStore()

    const result = await store.downloadKubeconfig('dep-1', 'team-1', 'fallback.kubeconfig')

    expect(result).toEqual({ blob, filename: 'Team-A.kubeconfig' })
    expect(JSON.stringify(store.$state)).not.toContain('apiVersion')
  })

  it('falls back to the given file name when the header is not readable', async () => {
    vi.mocked(labApi.downloadKubeconfig).mockResolvedValueOnce({ data: new Blob(['x']), headers: {} } as never)
    const store = useLabStore()

    const result = await store.downloadKubeconfig('dep-1', 'team-1', 'Team A.kubeconfig')

    expect(result.filename).toBe('Team A.kubeconfig')
  })
})

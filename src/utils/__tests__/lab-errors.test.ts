import { describe, it, expect } from 'vitest'
import { labErrorKey } from '@/utils/lab-errors'

describe('labErrorKey', () => {
  it('maps a structured reason', () => {
    const err = { response: { status: 502, data: { detail: { reason: 'lab_cluster_unavailable' } } } }
    expect(labErrorKey(err)).toBe('KubernetesStudentsPanel.errors.clusterUnavailable')
  })

  it('maps both forbidden reasons to the same key', () => {
    for (const reason of ['lab_view_forbidden', 'lab_operate_forbidden']) {
      const err = { response: { status: 403, data: { detail: { reason } } } }
      expect(labErrorKey(err)).toBe('KubernetesStudentsPanel.errors.forbidden')
    }
  })

  it('falls back to the status for a blob error body', () => {
    // The kubeconfig download uses responseType "blob": no readable detail.
    const err = { response: { status: 412, data: new Blob(['{}']) } }
    expect(labErrorKey(err)).toBe('KubernetesStudentsPanel.errors.notDeployed')
  })

  it('maps 409 (another task is running)', () => {
    const err = { response: { status: 409, data: { detail: 'Deployment already has an active task' } } }
    expect(labErrorKey(err)).toBe('KubernetesStudentsPanel.errors.taskActive')
  })

  it('returns null for anything unmapped', () => {
    expect(labErrorKey({ response: { status: 500, data: { detail: 'boom' } } })).toBeNull()
    expect(labErrorKey(new Error('network'))).toBeNull()
    expect(labErrorKey(null)).toBeNull()
  })
})

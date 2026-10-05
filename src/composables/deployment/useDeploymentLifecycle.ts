import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useDeploymentStore } from '@/stores/deployment.store'
import { useToastStore } from '@/stores/toast.store'
import { extractErrorMessage } from '@/utils/http-error'
import type { ComputedRef } from 'vue'
import type { Deployment } from '@/types'

// Lifecycle action gating — the action bar exposes Delete plus a
// dynamic Pause/Resume button. The backend picks the right Delete
// behaviour (terraform destroy + soft-delete vs. straight soft-delete)
// based on status, so the frontend just surfaces availability.
// Mirrors backend/app/services/lifecycle.py.
export function useDeploymentLifecycle(
  deploymentId: string,
  deployment: ComputedRef<Deployment | null | undefined>,
  isOwnerView: ComputedRef<boolean>,
  loadTasks: () => Promise<void>,
) {
  const router = useRouter()
  const { t } = useI18n()
  const deploymentStore = useDeploymentStore()
  const toastStore = useToastStore()

  const showDeleteModal = ref(false)
  const showPauseResumeModal = ref(false)
  const pauseResumeBusy = ref(false)

  const DELETE_STATUSES = [
    'success', 'failed', 'cancelled', 'paused', 'pause_failed', 'resume_failed',
  ]

  const canDelete = computed(() => {
    if (!isOwnerView.value) return false
    return DELETE_STATUSES.includes(deployment.value?.status ?? '')
  })

  const deleteDisabledReason = computed(() => {
    if (canDelete.value) return ''
    return t('DeploymentDetailView.deleteDisabledReason', {
      statuses: DELETE_STATUSES.join(', '),
    })
  })

  const canPause = computed(() => {
    if (!isOwnerView.value) return false
    const s = deployment.value?.status
    return s === 'success' || s === 'pause_failed' || s === 'resume_failed'
  })

  const canResume = computed(() => {
    if (!isOwnerView.value) return false
    const s = deployment.value?.status
    return s === 'paused' || s === 'pause_failed' || s === 'resume_failed'
  })

  const canPauseOrResume = computed(() => canPause.value || canResume.value)

  const pauseResumeAction = computed<'pause' | 'resume' | null>(() => {
    // Prefer the action that matches the steady-state semantic of
    // the current status: from ``success`` we pause, from ``paused``
    // we resume. From the failure states we pick the retry that
    // matches what just broke.
    const s = deployment.value?.status
    if (s === 'success' || s === 'pause_failed') return 'pause'
    if (s === 'paused' || s === 'resume_failed') return 'resume'
    return null
  })

  // Unified delete handler. The backend's DELETE endpoint returns 202
  // when it dispatched a destroy task (live progress to follow) or 204
  // when it soft-deleted directly (no resources to clean up).
  const confirmDelete = async () => {
    if (!deploymentId) return
    try {
      const response = await deploymentStore.deleteDeployment(deploymentId)
      if (response?.status === 202) {
        toastStore.addToast({
          type: 'info',
          message: t('DeploymentDetailView.deleteStartedToast'),
        })
        await deploymentStore.fetchDeploymentById(deploymentId)
        await loadTasks()
      } else {
        toastStore.addToast({
          type: 'success',
          message: t('DeploymentDetailView.deleteSuccessToast'),
        })
        router.push({ name: 'deployments.list' })
      }
    } catch (err: any) {
      toastStore.addToast({
        type: 'error',
        message: `${t('DeploymentDetailView.deleteErrorToast')}: ` + extractErrorMessage(err),
      })
    } finally {
      showDeleteModal.value = false
    }
  }

  // Pause / resume handler — same wiring as ``confirmDelete``.
  const confirmPauseResume = async () => {
    if (!deploymentId || pauseResumeBusy.value) return
    const action = pauseResumeAction.value
    if (!action) return
    pauseResumeBusy.value = true
    try {
      const call = action === 'pause'
        ? deploymentStore.pauseDeployment(deploymentId)
        : deploymentStore.resumeDeployment(deploymentId)
      await call
      toastStore.addToast({
        type: 'info',
        message: action === 'pause'
          ? t('DeploymentDetailView.pauseStartedToast')
          : t('DeploymentDetailView.resumeStartedToast'),
      })
      await deploymentStore.fetchDeploymentById(deploymentId)
      await loadTasks()
    } catch (err: any) {
      toastStore.addToast({
        type: 'error',
        message: (action === 'pause'
          ? t('DeploymentDetailView.pauseErrorToast')
          : t('DeploymentDetailView.resumeErrorToast'))
          + ': '
          + extractErrorMessage(err),
      })
    } finally {
      pauseResumeBusy.value = false
      showPauseResumeModal.value = false
    }
  }

  return {
    showDeleteModal,
    showPauseResumeModal,
    pauseResumeBusy,
    canDelete,
    deleteDisabledReason,
    canPause,
    canResume,
    canPauseOrResume,
    pauseResumeAction,
    confirmDelete,
    confirmPauseResume,
  }
}

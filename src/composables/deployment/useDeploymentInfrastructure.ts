import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToastStore } from '@/stores/toast.store'
import { deploymentApi } from '@/api/deployment.api'
import type { ComputedRef } from 'vue'
import type { DeploymentResource } from '@/types'

export function useDeploymentInfrastructure(
  deploymentId: string,
  isOwnerView: ComputedRef<boolean>,
  showRedeployModal: { value: boolean },
  redeployTargetAddress: { value: string | null },
  loadTasks: () => Promise<void>,
) {
  const { t } = useI18n()
  const toastStore = useToastStore()

  // Kept outside the store because it's strictly per-deployment and we want it to
  // reset on navigation. The list view polls gently when the latest
  // task is idle and refreshes once when a task transitions to
  // success/failed; the drawer fetches lazy.
  const resources = ref<DeploymentResource[]>([])
  const resourcesLoading = ref(false)
  const resourcesError = ref<string | null>(null)
  // Addresses currently waiting on a redeploy task. Used both to
  // disable the button on the card and to know we should refetch the
  // list as soon as the task finishes.
  const redeployInFlight = ref<Set<string>>(new Set())
  // Address of the VM whose detail drawer is currently open. ``null``
  // means the drawer is closed; the drawer component lazy-loads on
  // mount, so toggling this prop is enough.
  const openDrawerAddress = ref<string | null>(null)

  const loadResources = async (refresh = true) => {
    if (!isOwnerView.value) return
    resourcesLoading.value = true
    resourcesError.value = null
    try {
      const response = await deploymentApi.listResources(deploymentId, { refresh })
      resources.value = response.data.resources
    } catch (err: any) {
      const status = err?.response?.status
      if (status === 412) {
        resourcesError.value = t('vm.resourcesErrors.missingCredentials')
      } else if (status === 502) {
        resourcesError.value = t('vm.resourcesErrors.unreachable')
      } else if (status === 404) {
        // Deployment was soft-deleted upstream (e.g. right after a
        // successful destroy). The resources are gone; the stream watcher
        // handles the ``gone`` path, so just clear silently here.
        resources.value = []
      } else {
        resourcesError.value = err?.message || t('vm.resourcesErrors.generic')
      }
    } finally {
      resourcesLoading.value = false
    }
  }

  // Separate compute groups for the three sub-sections.
  const vmResources = computed(() => resources.value.filter(r => r.category === 'instance'))
  const networkResources = computed(() => resources.value.filter(
    r => r.category === 'network' || r.category === 'subnet' || r.category === 'floating_ip'
  ))
  const securityResources = computed(() => resources.value.filter(r => r.category === 'security_group'))

  // Click on the card's "Details" button toggles the inline panel:
  // open if a different card is currently shown (or none), close if the
  // same card is already expanded. Matches accordion semantics — only
  // one VM detail is visible at a time.
  const openVmDrawer = (address: string) => {
    if (openDrawerAddress.value === address) {
      openDrawerAddress.value = null
    } else {
      openDrawerAddress.value = address
    }
  }
  const closeVmDrawer = () => {
    openDrawerAddress.value = null
  }

  // Redeploy is a two-step UX: the VmCard's "Redeploy" button emits
  // ``@redeploy`` with an address, which opens a confirmation Modal
  // (same pattern as Delete). The actual API call lives in
  // ``executeRedeploy`` so the Modal's confirm button can call it
  // without re-doing the address-extraction.
  const redeployVm = (address: string) => {
    if (redeployInFlight.value.has(address)) return
    redeployTargetAddress.value = address
    showRedeployModal.value = true
  }

  const executeRedeploy = async (address: string) => {
    redeployInFlight.value.add(address)
    try {
      await deploymentApi.redeployResource(deploymentId, address)
      toastStore.success(t('vm.toasts.redeployStarted', { address }))
      // Refresh the task list right away so the freshly-dispatched
      // REDEPLOY row shows up as the new ``activeTask``. That in
      // turn flips ``isStreamRelevant`` to true → the SSE stream
      // attaches → live progress + logs render under the page's
      // existing active-task card, identical to deploy/destroy.
      // Without this poll, the new task only becomes visible on
      // the next manual page reload.
      await loadTasks()
    } catch (err: any) {
      redeployInFlight.value.delete(address)
      const detail = err?.response?.data?.detail
      const reason = detail?.reason
      if (reason === 'non_redeployable_resource_type') {
        toastStore.error(t('vm.toasts.onlyComputeInstances'))
      } else if (reason === 'resource_not_in_state') {
        toastStore.error(t('vm.toasts.resourceNotInState'))
      } else if (err?.response?.status === 409) {
        toastStore.error(t('vm.toasts.lifecycleBusy'))
      } else {
        toastStore.error(err?.message || t('vm.toasts.redeployFailed'))
      }
    }
  }

  // Redeploy confirmation handler — close the modal first (so the user
  // gets immediate visual feedback that their click registered) and
  // then dispatch the actual API call. ``executeRedeploy`` owns its
  // own toast handling and adds/removes the in-flight marker.
  const confirmRedeploy = async () => {
    const address = redeployTargetAddress.value
    showRedeployModal.value = false
    if (!address) return
    try {
      await executeRedeploy(address)
    } finally {
      redeployTargetAddress.value = null
    }
  }

  return {
    resources,
    resourcesLoading,
    resourcesError,
    loadResources,
    vmResources,
    networkResources,
    securityResources,
    openVmDrawer,
    closeVmDrawer,
    openDrawerAddress,
    redeployVm,
    executeRedeploy,
    redeployInFlight,
    confirmRedeploy,
  }
}

<script lang="ts" setup>
import { CircleArrowLeft, Loader2, Users, Settings, Trash2, Clock, AlertCircle, CheckCircle, XCircle, StopCircle, Flame, PauseCircle, PlayCircle } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import Modal from '@/components/ui/Modal.vue'
import { useRoute, useRouter } from 'vue-router'
import { useDeploymentStore } from '@/stores/deployment.store'
import { useAuthStore } from '@/stores/auth.store'
import { useRole } from '@/composables/useRole'
import { useToastStore } from '@/stores/toast.store'
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { deploymentApi } from '@/api/deployment.api'
import { taskApi } from '@/api/task.api'
import type { Task } from '@/types'
import { useDeploymentStream } from '@/composables/useDeploymentStream'
import InfrastructureVmDrawer from '@/components/InfrastructureVmDrawer.vue'
import { formatDateTime } from '@/utils/format'
import { useDeploymentLifecycle } from '@/composables/deployment/useDeploymentLifecycle'
import { useDeploymentCredentials } from '@/composables/deployment/useDeploymentCredentials'
import { useDeploymentInfrastructure } from '@/composables/deployment/useDeploymentInfrastructure'
import { useDeploymentTasks } from '@/composables/deployment/useDeploymentTasks'
import DeploymentInfoGrid from '@/components/deployment/detail/DeploymentInfoGrid.vue'
import DeploymentActiveTaskCard from '@/components/deployment/detail/DeploymentActiveTaskCard.vue'
import DeploymentTeamsCard from '@/components/deployment/detail/DeploymentTeamsCard.vue'
import DeploymentInfrastructureCard from '@/components/deployment/detail/DeploymentInfrastructureCard.vue'
import DeploymentTasksCard from '@/components/deployment/detail/DeploymentTasksCard.vue'


const route = useRoute()
const router = useRouter()
const deploymentStore = useDeploymentStore()
const authStore = useAuthStore()
const { isStaff } = useRole()
const toastStore = useToastStore()
const { t } = useI18n()

const deploymentId = route.params.id as string

const deployment = computed(() => deploymentStore.currentDeployment)

// Owner-view vs member-view — mirrors backend/app/utils/permissions.py
// ``is_deployment_owner_view``. Drives every gated UI element on
// this page: tasks/logs sections, terraform-state/outputs blocks,
// the Delete button, the SSE live-stream connection, and the
// resend-credentials buttons of *other* members in the same team.
//
// We trust the backend on the source-of-truth side (it returns 403
// or filters data when the caller isn't owner-view); this computed
// just hides the affordances so the user doesn't see buttons that
// would 403 on click.
const isOwnerView = computed(() => {
    if (isStaff.value) return true
    const ownerId = deployment.value?.userId
    return !!ownerId && String(ownerId) === String(authStore.userId)
})

// ----------------------------------------------------------------
// TASKS
// ----------------------------------------------------------------
const {
    tasks,
    loadingTasks,
    loadTasks,
    selectedTask,
    latestTaskOutputs,
    activeDataTask,
    loadingTaskDetail,
    tfResourcesCount,
    logEntryCount,
    prettyJson,
    highlightJson,
    taskLogsSplit,
    showTaskLogsTrace,
    selectTask,
    deselectTask,
} = useDeploymentTasks(deploymentId, isOwnerView)

const toggleTaskLogsTrace = () => { showTaskLogsTrace.value = !showTaskLogsTrace.value }

// ----------------------------------------------------------------
// INFRASTRUCTURE TAB — Stage-1 list + Stage-2 drawer + redeploy
// ----------------------------------------------------------------
const showRedeployModal = ref(false)
const redeployTargetAddress = ref<string | null>(null)

const {
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
    redeployInFlight,
    confirmRedeploy,
} = useDeploymentInfrastructure(deploymentId, isOwnerView, showRedeployModal, redeployTargetAddress, loadTasks)

// ----------------------------------------------------------------
// LIFECYCLE
// ----------------------------------------------------------------
const {
    showDeleteModal,
    showPauseResumeModal,
    pauseResumeBusy,
    canDelete,
    deleteDisabledReason,
    canPauseOrResume,
    pauseResumeAction,
    confirmDelete,
    confirmPauseResume,
} = useDeploymentLifecycle(deploymentId, deployment, isOwnerView, loadTasks)

// ----------------------------------------------------------------
// CREDENTIALS
// ----------------------------------------------------------------
const {
    myAccounts,
    myTeamVms,
    visiblePasswords,
    togglePasswordVisibility,
    sshCommandFor,
    userUrlFor,
    enrichedTeams,
    copiedKey,
    copyToClipboard,
    resendState,
    resendAccess,
} = useDeploymentCredentials(deploymentId, deployment, selectedTask, latestTaskOutputs)

onMounted(async () => {
    await deploymentStore.fetchDeploymentById(deploymentId)
    await loadTasks() // Loads the history into tasks.value

    if (isOwnerView.value) {
        // Owner view: seed the top outputs from the latest task so the
        // page can render the summary before the first SSE event arrives.
        if (tasks.value && tasks.value.length > 0) {
            const sortedTasks = [...tasks.value].sort((a, b) =>
                b.created_at.localeCompare(a.created_at)
            )

            const latestTask = sortedTasks[0]

            if (latestTask) {
                // Fetch the details straight from the API into latestTaskOutputs.
                try {
                    const { data } = await taskApi.getById(latestTask.taskId)
                    latestTaskOutputs.value = data
                } catch (err) {
                    console.error('Error seeding top outputs:', err)
                }
            }
        }
    } else {
        // Member view: the owner-only task outputs are off-limits, so
        // fetch just this member's own credentials from ``/my-access``.
        // ``typedUserAccounts`` / ``extractTeamVms`` fall back to these,
        // and the Teams-card credential block renders as for the owner.
        try {
            const { data } = await deploymentApi.getMyAccess(deploymentId)
            // The API type marks fields optional; the local UserAccount
            // interface is stricter but structurally compatible at the
            // point of use, so cast the map through unknown.
            myAccounts.value = (data.user_accounts ?? null) as Record<string, import('@/composables/deployment/useDeploymentCredentials').UserAccount> | null
            myTeamVms.value = data.team_vms ?? null
        } catch (err) {
            console.error('Error loading own access credentials:', err)
        }
    }

    // Fire the resource load in parallel — it's a separate roundtrip
    // (OpenStack live-fetch can take ~1s) and the page should render
    // its other panels while it's in flight.
    loadResources()
})


// ----------------------------------------------------------------
// LIVE STREAM (progress bar + log tail)
// ----------------------------------------------------------------
//
// We attach the SSE stream once we know the deployment ID and keep it
// open until the task reaches a terminal state. The composable
// auto-reconnects on transient errors and exposes ``connectionState``
// for a small status badge.
//
// Refs are destructured out of the composable so Vue's template
// auto-unwrap recognises them as top-level setup bindings — without
// destructuring, ``stream.currentPhase`` in the template would be the
// ref *object*, not the string, and downstream calls like
// ``phase.split(...)`` would crash.
const deploymentIdRef = computed(() => deploymentId)
const {
    progress: streamProgress,
    currentPhase: streamCurrentPhase,
    currentPhaseIndex: streamCurrentPhaseIndex,
    totalPhases: streamTotalPhases,
    phaseNames: streamPhaseNames,
    liveLogs: streamLiveLogs,
    totalLogCount: streamTotalLogCount,
    connectionState: streamConnectionState,
    start: startStream,
    stop: stopStream,
} = useDeploymentStream(deploymentIdRef)

const activeTask = computed<Task | null>(() => {
    if (!tasks.value.length) return null
    // The "active" task is the one we still expect events from.
    // Fall back to the latest task by created_at if all are terminal —
    // its progress columns may still be useful for context.
    const sorted = [...tasks.value].sort((a, b) => b.created_at.localeCompare(a.created_at))
    return sorted.find((t) => t.status === 'pending' || t.status === 'running') ?? sorted[0] ?? null
})

const isStreamRelevant = computed(() => {
    // Members never get the live stream — backend would 403 the SSE
    // endpoint anyway, the gate here just keeps the UI from poking
    // at it. Owners see the stream while there's an active task.
    if (!isOwnerView.value) return false
    return activeTask.value?.status === 'pending' || activeTask.value?.status === 'running'
})

// True while the deployment (or its active task) is still moving. The
// resend-access button reads this to stay disabled until the run is
// terminal — otherwise an operator could mail credentials before the
// VMs/services they point at are reachable.
const isDeploymentBusy = computed(() => {
    const dStatus = deployment.value?.status
    if (dStatus === 'pending' || dStatus === 'running') return true
    const tStatus = activeTask.value?.status
    if (tStatus === 'pending' || tStatus === 'running') return true
    // Members never load the task list (tasks.value stays empty, so
    // activeTask is null), but a redeploy/pause/resume can still be in
    // flight while the deployment row reads "success". Fall back to the
    // latest_task status from the detail response, which is populated
    // regardless of role, so the member's resend button stays disabled
    // until the run is terminal.
    const latestStatus = deployment.value?.latest_task?.status
    return latestStatus === 'pending' || latestStatus === 'running'
})

// Tasks that aren't the currently running one. Shown as the history
// list below the active-task card so the running task isn't rendered
// twice (once in the live block, once in the static list).
const historyTasks = computed<Task[]>(() => {
    const active = activeTask.value
    const list = [...tasks.value].sort((a, b) => b.created_at.localeCompare(a.created_at))
    if (!active || !isStreamRelevant.value) return list
    return list.filter((t) => t.taskId !== active.taskId)
})

// Phase stepper — N dots based on the live ``totalPhases`` reported by the
// worker. Phase names live in the worker (different sets for deploy/destroy),
// so the frontend stays task-type-agnostic for the dot count. Label tables for
// the deploy/destroy presets render meaningful labels under each dot when the
// totals match a known shape; an unknown count falls back to numbered labels.
//
// Default to a conservative 11-dot view before the first event arrives so the
// layout doesn't jump when the worker reports its real phase count.
const DEFAULT_PHASE_COUNT = 11

const PHASE_LABELS_DEPLOY_FULL = [
    'STARTING',
    'OPENSTACK_SETUP',
    'GIT_CLONE',
    'CREDS_MATERIALISE',
    'PACKER_INIT',
    'PACKER_VALIDATE',
    'PACKER_BUILD',
    'TERRAFORM_INIT',
    'TERRAFORM_PLAN',
    'TERRAFORM_APPLY',
    'OUTPUTS_AND_CLEANUP',
] as const

const PHASE_LABELS_DEPLOY_NO_PACKER = [
    'STARTING',
    'OPENSTACK_SETUP',
    'GIT_CLONE',
    'CREDS_MATERIALISE',
    'TERRAFORM_INIT',
    'TERRAFORM_PLAN',
    'TERRAFORM_APPLY',
    'OUTPUTS_AND_CLEANUP',
] as const

const PHASE_LABELS_DESTROY = [
    'STARTING',
    'OPENSTACK_SETUP',
    'GIT_CLONE',
    'CREDS_MATERIALISE',
    'TERRAFORM_INIT',
    'TERRAFORM_DESTROY',
    'CLEANUP',
] as const

// Pause/Resume share the destroy preamble (clone + clouds + tf init to allow a
// state-pull) but their hot phase is a CLI-driven server stop/start, not a
// terraform destroy. Same length as ``PHASE_LABELS_DESTROY`` (7), so tables are
// picked by task type first and only fall back to length-matching when the type
// is unknown (e.g. live-stream attached before tasks were loaded).
const PHASE_LABELS_PAUSE = [
    'STARTING',
    'OPENSTACK_SETUP',
    'GIT_CLONE',
    'CREDS_MATERIALISE',
    'TERRAFORM_INIT',
    'SERVER_STOP',
    'CLEANUP',
] as const

const PHASE_LABELS_RESUME = [
    'STARTING',
    'OPENSTACK_SETUP',
    'GIT_CLONE',
    'CREDS_MATERIALISE',
    'TERRAFORM_INIT',
    'SERVER_START',
    'CLEANUP',
] as const

// Per-VM redeploy reuses the destroy preamble (clone, clouds.yaml,
// init) and then runs ``terraform apply -replace=… -target=…`` for
// the single targeted resource. Phase shape mirrors
// ``worker/app/tasks.py:_PHASES_REDEPLOY``.
const PHASE_LABELS_REDEPLOY = [
    'STARTING',
    'OPENSTACK_SETUP',
    'GIT_CLONE',
    'CREDS_MATERIALISE',
    'TERRAFORM_INIT',
    'TERRAFORM_APPLY',
    'CLEANUP',
] as const

// Stepper labels: the worker sends the full phase sequence as ``phase_names``
// with every progress event — the authoritative source, since multi-image
// deploys have a dynamic sequence whose template keys the frontend can't guess.
// Before the first progress event, we fall back to the static tables below,
// which cover the fixed shapes (single-image deploy / destroy / pause / resume
// / redeploy); multi-image slots show generic numbers until ``phase_names`` lands.

const phaseStepCount = computed<number>(() => {
    return streamTotalPhases.value > 0 ? streamTotalPhases.value : DEFAULT_PHASE_COUNT
})

// Return the label for a given 0-based index. Order of precedence:
//   1. ``streamPhaseNames`` — authoritative, ships from the worker on
//      every progress event for every real task (deploy / destroy /
//      pause / resume / redeploy). Contains the exact phase names
//      including ``:<template_key>`` suffixes for multi-image builds.
//   2. Static table picked by ``activeTask.type`` — used in the brief
//      window between page-load and the first progress event, and
//      always for legacy Single-Image-Deploy where the worker's
//      sequence is byte-identical to ``PHASE_LABELS_DEPLOY_FULL``.
//   3. Numeric slot index — empty-slot guard so the stepper height
//      doesn't collapse during the loading flicker.
const phaseStepLabel = (idx: number): string => {
    // 1. Worker-authoritative list.
    const fromStream = streamPhaseNames.value
    if (Array.isArray(fromStream) && idx >= 0 && idx < fromStream.length) {
        return phaseLabel(fromStream[idx])
    }

    // 2. Static fallback by active task type. Used until the first
    //    progress event lands.
    let table: readonly string[] | null = null
    const activeType = activeTask.value?.type
    if (activeType === 'pause') {
        table = PHASE_LABELS_PAUSE
    } else if (activeType === 'resume') {
        table = PHASE_LABELS_RESUME
    } else if (activeType === 'destroy') {
        table = PHASE_LABELS_DESTROY
    } else if (activeType === 'redeploy') {
        table = PHASE_LABELS_REDEPLOY
    } else if (activeType === 'deploy') {
        // Without the worker's ``phase_names`` we can't tell legacy
        // (11) apart from multi-image (14, 17, ...). The total is
        // already known from the stream though, so pick the matching
        // table when it fits exactly — otherwise leave ``table = null``
        // and let the loop fall through to numeric slot indices.
        // Once the first progress event arrives, ``phase_names`` takes
        // over and the predicted slots are replaced with real labels.
        if (streamTotalPhases.value === PHASE_LABELS_DEPLOY_NO_PACKER.length) {
            table = PHASE_LABELS_DEPLOY_NO_PACKER
        } else if (streamTotalPhases.value === PHASE_LABELS_DEPLOY_FULL.length) {
            table = PHASE_LABELS_DEPLOY_FULL
        }
    }
    // Length-based last resort (no active task type known yet).
    if (!table) {
        const total = streamTotalPhases.value
        if (total === PHASE_LABELS_DEPLOY_FULL.length) table = PHASE_LABELS_DEPLOY_FULL
        else if (total === PHASE_LABELS_DEPLOY_NO_PACKER.length) table = PHASE_LABELS_DEPLOY_NO_PACKER
        else if (total === PHASE_LABELS_DESTROY.length) table = PHASE_LABELS_DESTROY
    }
    if (table && idx >= 0 && idx < table.length) {
        return phaseLabel(table[idx])
    }
    // 3. Numeric placeholder so the slot has a non-empty label.
    return String(idx + 1)
}

// 0-based index of the active dot. Prefer the worker's authoritative
// ``phase_index`` (1-based) from the SSE payload — only fall back to
// rounding ``progress_pct`` if no progress event has arrived yet.
const currentPhaseIndex = computed<number>(() => {
    if (streamCurrentPhaseIndex.value !== null && streamCurrentPhaseIndex.value > 0) {
        return streamCurrentPhaseIndex.value - 1
    }
    if (streamProgress.value === null) return -1
    const total = phaseStepCount.value
    const pct = Math.max(0, Math.min(100, streamProgress.value))
    return Math.max(0, Math.min(total - 1, Math.round((pct / 100) * total) - 1))
})

// Initialise progress bar + stepper from whatever the DB has on the
// latest task — covers the gap between page load and the first SSE
// event. Important when the user opens the detail view *mid-deploy*:
// without a seed they'd see the loader card until the next worker
// progress event, which can be 30s+ during long phases like
// ``terraform apply``.
//
// Only seed from a *live* task. The persisted progress columns of a
// finished deploy would otherwise paint the stepper at 100% / phase
// "OUTPUTS_AND_CLEANUP" right after the user clicks delete, before
// the new destroy task's first progress event arrives.
watch(
    activeTask,
    (task) => {
        if (!task) return
        const live = task.status === 'pending' || task.status === 'running'
        if (!live) return
        if (task.progress_pct != null && streamProgress.value === null) {
            streamProgress.value = task.progress_pct
        }
        if (task.current_phase && streamCurrentPhase.value === null) {
            streamCurrentPhase.value = task.current_phase
            // Approximate the phase index from the persisted percent so the
            // stepper renders meaningfully before the first SSE progress event
            // lands, mirroring the worker's own round(idx/total*100) math.
            if (task.progress_pct != null && streamCurrentPhaseIndex.value === null) {
                const total = streamTotalPhases.value || DEFAULT_PHASE_COUNT
                streamCurrentPhaseIndex.value = Math.max(
                    1,
                    Math.min(total, Math.round((task.progress_pct / 100) * total)),
                )
            }
        }
    },
    { immediate: true },
)

watch(
    isStreamRelevant,
    (relevant, wasRelevant) => {
        if (relevant && !wasRelevant) {
            startStream()
        } else if (!relevant && wasRelevant) {
            stopStream()
            // Refresh the task list once on completion so the final
            // logs/outputs land in the static rendering below.
            loadTasks()
            // A redeploy task that just finished produces a new TF
            // state — reload the resource list so the redrawn card
            // reflects post-apply lifecycle. We also clear the
            // in-flight set; whichever address was waiting on this
            // task is now in the freshly-fetched list.
            redeployInFlight.value.clear()
            loadResources()
        }
    },
    { immediate: true },
)

// When the SSE stream ends (terminal lifecycle event), reload the deployment +
// tasks so the view switches from the live progress bar to the static render.
//
// Special case: a successful destroy auto-soft-deletes the deployment, so the
// row disappears. Detected either via the last active task being a terminal
// DESTROY, or via the refetch returning no current deployment (the store
// swallows the 404 into ``state.error``, so we check ``currentDeployment``).
watch(streamConnectionState, async (state) => {
    if (state !== 'ended') return

    const wasDestroy = activeTask.value?.type === 'destroy'
    // Snapshot the active task BEFORE the refetch so we can decide
    // whether to fire a pause/resume failure toast even when the
    // refresh races and clears the live state.
    const lastActiveType = activeTask.value?.type
    const lastActiveStatus = activeTask.value?.status

    await deploymentStore.fetchDeploymentById(deploymentId)
    await loadTasks()

    // The deployment row only disappears when destroy actually succeeded (the
    // celery listener auto-soft-deletes on ``task-succeeded`` of a DESTROY task).
    // A failed destroy leaves the row so the user can read the logs.
    const gone = !deploymentStore.currentDeployment
        || deploymentStore.currentDeployment.deploymentId !== deploymentId

    if (gone) {
        // Soft-deleted upstream — the destroy ran clean.
        toastStore.addToast({
            type: 'success',
            message: t('DeploymentDetailView.deleteSuccessToast'),
        })
        router.push({ name: 'deployments.list' })
        return
    }

    // Destroy attempted but the row still exists → it failed. Show a clear
    // error toast and leave the user on the detail page to inspect the logs.
    if (wasDestroy) {
        toastStore.addToast({
            type: 'error',
            message: t('DeploymentDetailView.deleteFailedAsyncToast'),
        })
        return
    }

    // Pause/Resume failed asynchronously. ``activeTask`` is no longer set, so
    // look at the newest task. The toast is kept separate from the logs panel
    // to give a clear "the lifecycle pass failed but the deployment is still up"
    // hint without pulling raw exception text into the toast.
    const sortedTasks = [...(tasks.value || [])]
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
    const newestTask = sortedTasks[0]
    const failedKind = (newestTask?.type === 'pause' || newestTask?.type === 'resume')
        && newestTask.status === 'failed'
        ? newestTask.type
        : null
    // Belt-and-braces: even if loadTasks() raced, the snapshot from
    // before the await should still tell us what was active.
    const fallbackKind = (lastActiveType === 'pause' || lastActiveType === 'resume')
        && lastActiveStatus === 'failed'
        ? lastActiveType
        : null
    const kind = failedKind || fallbackKind
    if (kind === 'pause') {
        toastStore.addToast({
            type: 'error',
            message: t('DeploymentDetailView.pauseFailedAsyncToast'),
        })
    } else if (kind === 'resume') {
        toastStore.addToast({
            type: 'error',
            message: t('DeploymentDetailView.resumeFailedAsyncToast'),
        })
    }
})

onBeforeUnmount(() => {
    stopStream()
})

// Pretty phase label for the progress bar header. Keeps the enum
// naming convention from the worker (UPPER_SNAKE_CASE) but renders
// it human-friendly. Defensive: anything that isn't a non-empty
// string falls back to an empty label so the template never sees a
// non-string slip through (e.g. the brief moment an unwrapped ref
// produced the original ``phase.split is not a function`` crash).
const phaseLabel = (phase: unknown): string => {
    if (typeof phase !== 'string' || !phase) return ''
    // Worker-emitted multi-image phases carry the template key as a ``:<key>``
    // suffix (e.g. ``PACKER_BUILD:database``). Split the suffix off, title-case
    // the base name, and append the sub-key as ``[<key>]`` so the stepper reads
    // ``Packer Build [database]`` instead of ``Packer Build:database``.
    const colonIdx = phase.indexOf(':')
    const base = colonIdx === -1 ? phase : phase.slice(0, colonIdx)
    const subKey = colonIdx === -1 ? '' : phase.slice(colonIdx + 1).trim()
    const formattedBase = base
        .split('_')
        .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
        .join(' ')
    return subKey ? `${formattedBase} [${subKey}]` : formattedBase
}

const deploymentTimestamp = computed(() => {
    return deployment.value?.created_at ? formatDate(deployment.value.created_at) : '-'
})

const getStatusStyles = (status?: string) => {
    switch (status) {
        case 'success':
            return {
                label: 'DeploymentsView.deploymentSuccessful',
                dotClass: 'bg-status-success shadow-[0_0_10px_rgba(34,197,94,0.4)]',
                textClass: 'text-content-primary',
                badgeClass: 'bg-status-successLight text-status-success border-status-success/30',
                icon: CheckCircle
            }
        case 'running':
            return {
                label: 'DeploymentsView.deploymentRunning',
                dotClass: 'bg-tag-info animate-pulse shadow-[0_0_12px_rgba(59,130,246,0.6)]',
                textClass: 'text-content-primary',
                badgeClass: 'bg-tag-infoLight text-tag-info border-tag-infoBorder',
                icon: Loader2
            }
        case 'pending':
            return {
                label: 'DeploymentsView.deploymentPending',
                dotClass: 'bg-status-warning shadow-[0_0_10px_rgba(234,179,8,0.4)]',
                textClass: 'text-content-primary',
                badgeClass: 'bg-status-warningLight text-status-warning border-status-warning/30',
                icon: Clock
            }
        case 'failed':
            return {
                label: 'DeploymentsView.deploymentFailed',
                dotClass: 'bg-status-error shadow-[0_0_10px_rgba(239,68,68,0.4)]',
                textClass: 'text-content-primary',
                badgeClass: 'bg-status-errorLight text-status-error border-status-error/30',
                icon: XCircle
            }
        case 'destroying':
            return {
                label: 'DeploymentsView.deploymentDestroying',
                dotClass: 'bg-tag-destroy animate-pulse shadow-[0_0_12px_rgba(249,115,22,0.6)]',
                textClass: 'text-content-primary',
                badgeClass: 'bg-tag-destroyLight text-tag-destroy border-tag-destroyBorder',
                icon: Loader2
            }
        case 'cancelled':
            return {
                label: 'DeploymentsView.deploymentCancelled',
                dotClass: 'bg-content-disabled',
                textClass: 'text-content-primary',
                badgeClass: 'bg-surface-input text-content-secondary border-card-border',
                icon: StopCircle
            }
        case 'destroyed':
            return {
                label: 'DeploymentsView.deploymentDestroyed',
                dotClass: 'bg-tag-destroy shadow-[0_0_10px_rgba(249,115,22,0.4)]',
                textClass: 'text-content-primary',
                badgeClass: 'bg-tag-destroyLight text-tag-destroy border-tag-destroyBorder',
                icon: Flame
            }
        case 'pausing':
            return {
                // ``pausing``/``resuming`` borrow the orange "in flight"
                // palette from destroying — the user reads "something
                // active is happening" at a glance, distinct from the
                // calm green of success.
                label: 'DeploymentsView.deploymentPausing',
                dotClass: 'bg-status-warning animate-pulse shadow-[0_0_12px_rgba(245,158,11,0.6)]',
                textClass: 'text-content-primary',
                badgeClass: 'bg-status-warningLight text-status-warning border-status-warning/30',
                icon: Loader2
            }
        case 'paused':
            return {
                label: 'DeploymentsView.deploymentPaused',
                dotClass: 'bg-border-strong shadow-[0_0_10px_rgba(148,163,184,0.4)]',
                textClass: 'text-content-primary',
                badgeClass: 'bg-surface-input text-content-secondary border-border',
                icon: PauseCircle
            }
        case 'resuming':
            return {
                label: 'DeploymentsView.deploymentResuming',
                dotClass: 'bg-status-success animate-pulse shadow-[0_0_12px_rgba(16,185,129,0.6)]',
                textClass: 'text-content-primary',
                badgeClass: 'bg-status-successLight text-status-success border-status-success/30',
                icon: Loader2
            }
        case 'pause_failed':
            // The deployment itself is unaffected — only the
            // pause-pass tripped. Use the warning palette so the
            // user reads "needs attention" rather than the harsher
            // red of a deploy-failed.
            return {
                label: 'DeploymentsView.deploymentPauseFailed',
                dotClass: 'bg-status-warning shadow-[0_0_10px_rgba(245,158,11,0.4)]',
                textClass: 'text-content-primary',
                badgeClass: 'bg-status-warningLight text-status-warning border-status-warning/30',
                icon: AlertCircle
            }
        case 'resume_failed':
            return {
                label: 'DeploymentsView.deploymentResumeFailed',
                dotClass: 'bg-status-warning shadow-[0_0_10px_rgba(245,158,11,0.4)]',
                textClass: 'text-content-primary',
                badgeClass: 'bg-status-warningLight text-status-warning border-status-warning/30',
                icon: AlertCircle
            }
        default:
            return {
                label: 'DeploymentsView.noStatus',
                dotClass: 'bg-surface-hover',
                textClass: 'text-content-disabled',
                badgeClass: 'bg-surface-input text-content-primary border-card-border',
                icon: AlertCircle
            }
    }
}

const selectedGroup = ref<number | null>(null)

const selectGroup = (groupIndex: number) => {
    selectedGroup.value = groupIndex
}

const deselectGroup = () => {
    selectedGroup.value = null
}

const groups = computed(() => {
    if (!deployment.value?.userInputVar) return []

    try {
        const data = typeof deployment.value.userInputVar === 'string'
            ? JSON.parse(deployment.value.userInputVar)
            : deployment.value.userInputVar
        const groupNames = data.groupNames || []
        const assignments = data.assignments || {}

        return Object.keys(assignments).map((groupIndex, idx) => ({
            index: parseInt(groupIndex),
            name: groupNames[idx] || `Gruppe ${parseInt(groupIndex) + 1}`,
            students: assignments[groupIndex] || []
        }))
    } catch (e) {
        console.error('Error parsing userInputVar:', e)
        return []
    }
})

const currentGroup = computed(() => {
    if (selectedGroup.value === null) return null
    return groups.value[selectedGroup.value] ?? null
})

const deploymentVariables = computed(() => {
    if (!deployment.value?.userInputVar) return {}

    try {
        const data = typeof deployment.value.userInputVar === 'string'
            ? JSON.parse(deployment.value.userInputVar)
            : deployment.value.userInputVar
        return data.variables || {}
    } catch (e) {
        console.error('Error parsing userInputVar:', e)
        return {}
    }
})

const cleanVariableValue = (value?: string) => {
    const str = String(value ?? '')
    let cleaned = str.split('#')[0]?.trim() ?? ''
    cleaned = cleaned.replace(/["']/g, '')
    return cleaned.trim() || '-'
}

const formatDate = formatDateTime
</script>


<template>
    <div v-if="deployment" class="space-y-6">
        <!--
            Two-column layout: the deployment detail content stays on the left,
            and the VM-detail sidebar anchors as a sticky right column when an
            inline VM is selected. The left column expands to full width otherwise.
        -->
        <div class="flex gap-6 items-start">
            <div class="flex-1 min-w-0 space-y-6">

        <!-- Header with back button and status badge -->
        <div class="flex items-center justify-between">
            <div class="flex items-center gap-4">
                <RouterLink :to="{ name: 'deployments.list' }">
                    <button
                        class="w-10 h-10 rounded-full flex items-center justify-center hover:bg-surface-input transition">
                        <CircleArrowLeft :size="24" class="text-content-secondary" />
                    </button>
                </RouterLink>

                <div>
                    <h1 class="text-3xl font-bold text-content-primary">{{ deployment.name }}</h1>
                    <p class="text-sm text-content-disabled mt-1">Deployment Details</p>
                </div>
            </div>

            <div class="flex items-center gap-4">
                <div class="flex items-center gap-3">
                    <component :is="getStatusStyles(deployment.status).icon" :size="20" :class="deployment.status === 'success' ? 'text-status-success' :
                        deployment.status === 'failed' ? 'text-status-error' :
                            deployment.status === 'running' ? 'text-tag-info' : 'text-status-warning'" />
                    <span
                        class="inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-semibold border capitalize"
                        :class="getStatusStyles(deployment.status).badgeClass">
                        {{ $t(getStatusStyles(deployment.status).label) }}
                    </span>
                </div>

                <!-- Pause / Resume button. One slot, two states, visible only
                     when the lifecycle matrix permits the action right now. -->
                <BaseButton
                    v-if="canPauseOrResume"
                    @click="!pauseResumeBusy && (showPauseResumeModal = true)"
                    :disabled="pauseResumeBusy"
                    :title="pauseResumeAction === 'pause'
                        ? $t('DeploymentDetailView.pauseTooltip')
                        : $t('DeploymentDetailView.resumeTooltip')"
                    class="flex items-center gap-2 px-4 py-2"
                    :variant="pauseResumeAction === 'pause' ? 'yellow' : 'green'">
                    <PauseCircle v-if="pauseResumeAction === 'pause'" :size="18" />
                    <PlayCircle v-else :size="18" />
                    <span class="font-medium">
                        {{ pauseResumeAction === 'pause'
                            ? $t('DeploymentDetailView.deploymentPause')
                            : $t('DeploymentDetailView.deploymentResume') }}
                    </span>
                </BaseButton>

                <!-- Single Delete button. The backend decides whether this
                     triggers a destroy task or a straight soft-delete based on
                     status. Hidden entirely for members. -->
                <BaseButton v-if="isOwnerView" @click="canDelete && (showDeleteModal = true)" :disabled="!canDelete"
                    :title="deleteDisabledReason" class="flex items-center gap-2 px-4 py-2" variant="red">
                    <Trash2 :size="18" />
                    <span class="font-medium">{{ $t('DeploymentDetailView.deploymentDelete') }}</span>
                </BaseButton>
            </div>
        </div>

        <DeploymentInfoGrid
            :deployment="deployment"
            :deployment-timestamp="deploymentTimestamp"
        />

        <!-- Groups section -->
        <div class="bg-surface-card rounded-xl border border-card-border p-6 shadow-sm" v-if="groups.length > 0">
            <h2 class="text-lg font-semibold text-content-primary mb-4 flex items-center gap-2">
                <Users :size="20" class="text-primary" />
                {{ $t('DeploymentDetailView.deploymentGroups') }}
            </h2>

            <Transition mode="out-in" enter-active-class="transition-all duration-200 ease-out"
                enter-from-class="opacity-0 translate-x-2" enter-to-class="opacity-100 translate-x-0"
                leave-active-class="transition-all duration-200 ease-out absolute top-0 left-0 right-0"
                leave-from-class="opacity-100 translate-x-0" leave-to-class="opacity-0 -translate-x-2">
                <div v-if="currentGroup" key="detail" class="bg-surface-input rounded-lg p-4">

                    <button @click="deselectGroup"
                        class="flex items-center gap-2 text-primary hover:text-primary/80 transition-colors mb-3 group">
                        <CircleArrowLeft :size="20" class="group-hover:-translate-x-1 transition-transform" />
                        <span class="text-sm font-medium">{{ $t('DeploymentDetailView.deploymentGroupsBack') }}</span>
                    </button>

                    <div class="flex items-center gap-3 mb-4 pb-3 border-b border-card-border">
                        <div class="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                            <span class="text-primary font-bold text-sm">{{ currentGroup.index + 1 }}</span>
                        </div>
                        <div class="font-semibold text-lg">{{ currentGroup.name }}</div>
                    </div>

                    <div class="space-y-2">
                        <div class="text-xs text-content-secondary uppercase tracking-wide mb-2">
                            {{ $t('DeploymentDetailView.deploymentStudentCount', {
                                n: currentGroup?.students?.length ||
                                    0
                            }, currentGroup?.students?.length || 0) }}
                        </div>
                        <div v-for="(student, idx) in currentGroup.students" :key="student"
                            class="flex items-center gap-3 bg-surface-card rounded-lg px-3 py-2 border border-card-border">
                            <div
                                class="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs text-primary font-bold">
                                {{ Number(idx) + 1 }}
                            </div>
                            <span class="font-mono text-sm text-content-secondary">{{ student }}</span>
                        </div>
                    </div>
                </div>

                <div v-else key="overview" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div v-for="group in groups" :key="group.index" @click="selectGroup(group.index)"
                        class="bg-surface-input rounded-lg p-4 cursor-pointer hover:bg-surface-input transition-colors border border-card-border hover:border-primary/30">
                        <div class="flex items-center gap-3 mb-2">
                            <div class="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                                <span class="text-primary font-bold text-sm">{{ group.index + 1 }}</span>
                            </div>
                            <div class="font-semibold">{{ group.name }}</div>
                        </div>
                        <div class="text-sm text-content-secondary ml-11">
                            {{ $t('DeploymentDetailView.deploymentStudentCount', { n: group.students.length },
                                group.students.length) }}
                        </div>
                    </div>
                </div>
            </Transition>
        </div>

        <!-- Deployment Variables -->
        <div class="bg-surface-card rounded-xl border border-card-border p-6 shadow-sm"
            v-if="Object.keys(deploymentVariables).length > 0">
            <h2 class="text-lg font-semibold text-content-primary mb-4 flex items-center gap-2">
                <Settings :size="20" class="text-tag-destroy" />
                {{ $t('DeploymentDetailView.deploymentConfig') }}
            </h2>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div v-for="(value, key) in deploymentVariables" :key="key"
                    class="bg-surface-input rounded-lg p-4 border border-card-border">
                    <div class="text-xs text-content-secondary uppercase tracking-wide mb-1 font-mono">{{ key }}</div>
                    <div class="font-medium text-content-primary break-all text-sm">
                        {{ cleanVariableValue(value) }}
                    </div>
                </div>
            </div>
        </div>

        <!-- Latest task info is shown inline in the Active Task card
             below while the deployment is running, and inline in the
             Tasks & Logs history once it has finished. The previous
             standalone "Latest Task" row was redundant with both. -->

        <!-- Active Task — live progress + log tail for the currently
             running task. Replaces the previous mix of "Latest Task"
             info card + duplicate entry in the Tasks & Logs list. -->
        <DeploymentActiveTaskCard
            v-if="isStreamRelevant && activeTask"
            :active-task="activeTask"
            :stream-connection-state="streamConnectionState"
            :stream-current-phase-index="streamCurrentPhaseIndex"
            :stream-current-phase="streamCurrentPhase"
            :stream-progress="streamProgress"
            :stream-live-logs="streamLiveLogs"
            :stream-total-log-count="streamTotalLogCount"
            :phase-step-count="phaseStepCount"
            :current-phase-index="currentPhaseIndex"
            :phase-label="phaseLabel"
            :phase-step-label="phaseStepLabel"
            :format-date="formatDate"
        />

        <!-- Teams & Members section — appears above Infrastructure so
             the human-readable view (who has access to what) precedes
             the technical resource listing. -->
        <DeploymentTeamsCard
            v-if="deployment.teams && deployment.teams.length > 0"
            :enriched-teams="enrichedTeams"
            :teams-count="deployment.teams.length"
            :visible-passwords="visiblePasswords"
            :copied-key="copiedKey"
            :resend-state="resendState"
            :is-owner-view="isOwnerView"
            :is-deployment-busy="isDeploymentBusy"
            :current-user-id="authStore.userId"
            :toggle-password-visibility="togglePasswordVisibility"
            :copy-to-clipboard="copyToClipboard"
            :ssh-command-for="sshCommandFor"
            :user-url-for="userUrlFor"
            :resend-access="resendAccess"
        />

        <DeploymentInfrastructureCard
            v-if="isOwnerView"
            :vm-resources="vmResources"
            :network-resources="networkResources"
            :security-resources="securityResources"
            :resources-loading="resourcesLoading"
            :resources-error="resourcesError"
            :redeploy-in-flight="redeployInFlight"
            :open-drawer-address="openDrawerAddress"
            :load-resources="loadResources"
            :open-vm-drawer="openVmDrawer"
            :redeploy-vm="redeployVm"
        />

        <DeploymentTasksCard
            :is-owner-view="isOwnerView"
            :is-stream-relevant="isStreamRelevant"
            :history-tasks="historyTasks"
            :selected-task="selectedTask"
            :active-data-task="activeDataTask"
            :loading-tasks="loadingTasks"
            :loading-task-detail="loadingTaskDetail"
            :task-logs-split="taskLogsSplit"
            :show-task-logs-trace="showTaskLogsTrace"
            :toggle-task-logs-trace="toggleTaskLogsTrace"
            :log-entry-count="logEntryCount"
            :tf-resources-count="tfResourcesCount"
            :copied-key="copiedKey"
            :get-status-styles="getStatusStyles"
            :format-date="formatDate"
            :pretty-json="prettyJson"
            :highlight-json="highlightJson"
            :copy-to-clipboard="copyToClipboard"
            :select-task="selectTask"
            :deselect-task="deselectTask"
        />

            </div>
            <!--
                VM detail sidebar — sticky right column, rendered only when the
                user opened a VM. Stays in view while scrolling the main content
                and is clamped to the viewport height. Below ``xl`` it falls into
                the page flow as a normal-width card.
            -->
            <aside
                v-if="openDrawerAddress"
                class="w-full xl:w-[420px] xl:shrink-0 xl:sticky xl:top-0 xl:self-start xl:max-h-[calc(100vh-3.5rem)] xl:flex xl:flex-col"
            >
                <InfrastructureVmDrawer
                    :deployment-id="deploymentId"
                    :address="openDrawerAddress"
                    class="xl:flex-1 xl:min-h-0"
                    @close="closeVmDrawer"
                />
            </aside>
        </div>

        <!-- Delete Confirmation Modal -->
        <Modal :show="showDeleteModal" @close="showDeleteModal = false">
            <template #title>
                {{ $t('DeploymentDetailView.confirmDeleteTitle') }}
            </template>
            <template #body>
                <p class="text-content-secondary" v-html="$t('DeploymentDetailView.confirmDeleteMessage', { name: deployment.name })"></p>
            </template>
            <template #footer>
                <div class="flex justify-end gap-3">
                    <BaseButton variant="ghost" @click="showDeleteModal = false">
                        {{ $t('DeploymentDetailView.cancelButton') }}
                    </BaseButton>
                    <BaseButton variant="red" @click="confirmDelete">
                        {{ $t('DeploymentDetailView.confirmButton') }}
                    </BaseButton>
                </div>
            </template>
        </Modal>

        <!-- Redeploy Confirmation Modal — same shape as Delete: a
             yellow Cancel and a red Confirm. We surface the VM
             address in the body so the user can sanity-check which
             instance they're about to recreate. The Modal is the
             single source of truth; we never fall back to
             ``window.confirm``. -->
        <Modal :show="showRedeployModal" @close="showRedeployModal = false">
            <template #title>
                VM neu erstellen?
            </template>
            <template #body>
                <div class="space-y-3">
                    <p class="text-content-secondary">
                        Diese VM wird zerstört und identisch neu erstellt.
                        Andere VMs in diesem Deployment bleiben unangetastet.
                    </p>
                    <p v-if="redeployTargetAddress" class="text-xs font-mono text-content-secondary bg-surface-input border border-card-border rounded-lg px-3 py-2 break-all">
                        {{ redeployTargetAddress }}
                    </p>
                </div>
            </template>
            <template #footer>
                <div class="flex justify-end gap-3">
                    <BaseButton variant="ghost" @click="showRedeployModal = false">
                        {{ $t('DeploymentDetailView.cancelButton') }}
                    </BaseButton>
                    <BaseButton variant="red" @click="confirmRedeploy">
                        Redeploy
                    </BaseButton>
                </div>
            </template>
        </Modal>

        <!-- Pause / Resume confirm. Same pattern as Delete: a tiny
             modal that asks the user to confirm before we POST. The
             title/body switch on ``pauseResumeAction`` so we don't
             render two near-identical modals. -->
        <Modal :show="showPauseResumeModal" @close="showPauseResumeModal = false">
            <template #title>
                {{ pauseResumeAction === 'pause'
                    ? $t('DeploymentDetailView.confirmPauseTitle')
                    : $t('DeploymentDetailView.confirmResumeTitle') }}
            </template>
            <template #body>
                <p class="text-content-secondary" v-html="pauseResumeAction === 'pause'
                    ? $t('DeploymentDetailView.confirmPauseMessage', { name: deployment.name })
                    : $t('DeploymentDetailView.confirmResumeMessage', { name: deployment.name })"></p>
            </template>
            <template #footer>
                <div class="flex justify-end gap-3">
                    <BaseButton variant="ghost" @click="showPauseResumeModal = false">
                        {{ $t('DeploymentDetailView.cancelButton') }}
                    </BaseButton>
                    <BaseButton
                        :variant="pauseResumeAction === 'pause' ? 'yellow' : 'green'"
                        @click="confirmPauseResume"
                        :disabled="pauseResumeBusy">
                        {{ pauseResumeAction === 'pause'
                            ? $t('DeploymentDetailView.deploymentPause')
                            : $t('DeploymentDetailView.deploymentResume') }}
                    </BaseButton>
                </div>
            </template>
        </Modal>
    </div>

    <!-- Loading State -->
    <div v-else class="flex items-center justify-center py-20">
        <Loader2 class="animate-spin text-primary" :size="40" />
    </div>
</template>
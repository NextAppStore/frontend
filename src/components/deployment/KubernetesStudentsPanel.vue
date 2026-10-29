<script setup lang="ts">
/**
 * Student-pod management for Kubernetes-App deployments (issue #36).
 *
 * ``labctl`` as UI: per team (each team is its own single-VM k3s cluster)
 * a table of student pods plus the actions the backend offers in
 * ``app/routers/lab.py`` — add, reassign, change password, reset, remove,
 * and the cluster-admin kubeconfig download.
 *
 * How an action flows:
 *   1. The store POSTs; the backend answers 202 with a task id.
 *   2. We emit ``action-started``; the detail view reloads its tasks and
 *      attaches the SSE stream (with replay, see ``useDeploymentStream``).
 *   3. When that task shows up terminal in ``tasks``, we toast the outcome
 *      and reload the team's list.
 *   4. A generated password arrives once as ``labResult`` from the stream
 *      and is shown in a dialog. It lives only in this component's local
 *      state and is dropped when the dialog closes.
 *
 * The backend allows one active task per deployment (409 otherwise), so
 * every action button is disabled while any task runs — not just one of
 * this team's.
 *
 * Who sees it is decided by the detail view (owner view and a
 * ``kubeconfigs`` output); the backend enforces the same rule.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  AlertCircle, Boxes, Check, CheckCircle, Clock, Copy, Download, KeyRound,
  Loader2, Plus, RefreshCw, RotateCcw, Trash2, UserMinus, XCircle,
} from 'lucide-vue-next'

import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import EntityListState from '@/components/ui/EntityListState.vue'
import Modal from '@/components/ui/Modal.vue'
import { useLabStore } from '@/stores/lab.store'
import { useToast } from '@/composables/useToast'
import { extractErrorMessage } from '@/utils/http-error'
import { labErrorKey } from '@/utils/lab-errors'
import { saveBlob } from '@/utils/download'
import { formatDateTime } from '@/utils/format'
import {
  LAB_NODE_PORT_MAX,
  LAB_NODE_PORT_MIN,
  LAB_USERNAME_PATTERN,
} from '@/types'
import type { DeploymentTeam, LabActionAccepted, LabResult, LabStudent, Task } from '@/types'

const props = defineProps<{
  deploymentId: string
  /** Teams that have a cluster (a key in the ``kubeconfigs`` output). */
  teams: DeploymentTeam[]
  /** Any task of the deployment is pending/running. */
  busy: boolean
  /** The detail view's task list — used to see our task finish. */
  tasks: Task[]
  /** One-time password from the SSE ``succeeded`` event. */
  labResult: LabResult | null
}>()

const emit = defineEmits<{
  (e: 'action-started', taskId: string): void
}>()

const { t } = useI18n()
const toast = useToast()
const labStore = useLabStore()

// ----------------------------------------------------------------
// LIST
// ----------------------------------------------------------------
const loadTeam = (teamId: string) => labStore.fetchStudents(props.deploymentId, teamId)

onMounted(() => {
  props.teams.forEach((team) => { loadTeam(team.teamId) })
})

const studentsOf = (teamId: string): LabStudent[] => labStore.studentsByTeam[teamId] ?? []
const isTeamLoading = (teamId: string) => !!labStore.loadingByTeam[teamId]
const teamError = (teamId: string) => labStore.errorByTeam[teamId] ?? null
const teamErrorText = (teamId: string): string => {
  const err = teamError(teamId)
  if (!err) return ''
  return err.key ? t(err.key) : err.message
}
const hasPendingPod = (teamId: string) => studentsOf(teamId).some((s) => s.pod_phase === 'Pending')

// Status is shown as icon + text, never by colour alone (#30).
const statusOf = (student: LabStudent) => {
  if (!student.pod_name) {
    return { label: t('KubernetesStudentsPanel.status.noPod'), icon: AlertCircle, classes: 'bg-tag-neutralLight text-tag-neutral border-tag-neutralBorder' }
  }
  if (student.ready) {
    return { label: t('KubernetesStudentsPanel.status.ready'), icon: CheckCircle, classes: 'bg-status-successLight text-status-success border-status-success/30' }
  }
  if (student.pod_phase === 'Pending') {
    return { label: student.pod_phase, icon: Clock, classes: 'bg-status-warningLight text-status-warning border-status-warning/30' }
  }
  if (student.pod_phase === 'Failed') {
    return { label: student.pod_phase, icon: XCircle, classes: 'bg-status-errorLight text-status-error border-status-error/30' }
  }
  return {
    label: student.pod_phase || t('KubernetesStudentsPanel.status.notReady'),
    icon: Loader2,
    classes: 'bg-tag-infoLight text-tag-info border-tag-infoBorder',
  }
}

// ----------------------------------------------------------------
// ACTIONS
// ----------------------------------------------------------------
interface PendingAction {
  taskId: string
  teamId: string
  username: string
}

const submitting = ref(false)
const pending = ref<PendingAction | null>(null)
const actionsDisabled = computed(() => props.busy || submitting.value || pending.value !== null)

const runAction = async (
  teamId: string,
  username: string,
  call: () => Promise<LabActionAccepted>,
): Promise<boolean> => {
  submitting.value = true
  try {
    const accepted = await call()
    pending.value = { taskId: accepted.task_id, teamId, username }
    toast.info(t('KubernetesStudentsPanel.toasts.queued', { username }))
    emit('action-started', accepted.task_id)
    return true
  } catch (err) {
    const key = labErrorKey(err)
    toast.error(key ? t(key) : extractErrorMessage(err))
    return false
  } finally {
    submitting.value = false
  }
}

// Our task finished: report it and reload that team's list. Watching the
// status (not ``busy``) also covers a task that finished before the task
// list was reloaded, where ``busy`` never flips.
const pendingTaskStatus = computed(() => {
  const id = pending.value?.taskId
  return id ? props.tasks.find((task) => task.taskId === id)?.status ?? null : null
})

watch(pendingTaskStatus, (status) => {
  const action = pending.value
  if (!action || !status || status === 'pending' || status === 'running') return
  pending.value = null
  if (status === 'success') {
    toast.success(t('KubernetesStudentsPanel.toasts.succeeded', { username: action.username }))
  } else {
    toast.error(t('KubernetesStudentsPanel.toasts.failed', { username: action.username }))
  }
  loadTeam(action.teamId)
})

const reassign = (teamId: string, student: LabStudent) =>
  runAction(teamId, student.username, () =>
    labStore.reassignStudent(props.deploymentId, teamId, student.username))

// ----------------------------------------------------------------
// DIALOGS
// ----------------------------------------------------------------
type Dialog =
  | { kind: 'add'; team: DeploymentTeam }
  | { kind: 'reset'; team: DeploymentTeam; username: string }
  | { kind: 'remove'; team: DeploymentTeam; username: string }
  | { kind: 'passwd'; team: DeploymentTeam; username: string }
  | { kind: 'kubeconfig'; team: DeploymentTeam }

const dialog = ref<Dialog | null>(null)
const closeDialog = () => { dialog.value = null }

const addUsername = ref('')
const addPassword = ref('')
const addPort = ref('')
const resetNewPassword = ref(false)
const passwdValue = ref('')
const formTouched = ref(false)

const openDialog = (next: Dialog) => {
  addUsername.value = ''
  addPassword.value = ''
  addPort.value = ''
  resetNewPassword.value = false
  passwdValue.value = ''
  formTouched.value = false
  dialog.value = next
}

const usernameValid = computed(() => LAB_USERNAME_PATTERN.test(addUsername.value.trim()))
const parsedPort = computed<number | null>(() => {
  const raw = addPort.value.trim()
  if (!raw) return null
  const port = Number(raw)
  return Number.isInteger(port) ? port : NaN
})
const portValid = computed(() => {
  const port = parsedPort.value
  return port === null || (port >= LAB_NODE_PORT_MIN && port <= LAB_NODE_PORT_MAX)
})
const portRange = { min: LAB_NODE_PORT_MIN, max: LAB_NODE_PORT_MAX }

const submitAdd = async () => {
  const current = dialog.value
  if (current?.kind !== 'add') return
  formTouched.value = true
  if (!usernameValid.value || !portValid.value) return
  const username = addUsername.value.trim()
  const ok = await runAction(current.team.teamId, username, () =>
    labStore.addStudent(props.deploymentId, current.team.teamId, {
      username,
      ...(addPassword.value ? { password: addPassword.value } : {}),
      ...(parsedPort.value !== null ? { port: parsedPort.value } : {}),
    }))
  if (ok) closeDialog()
}

const confirmReset = async () => {
  const current = dialog.value
  if (current?.kind !== 'reset') return
  const ok = await runAction(current.team.teamId, current.username, () =>
    labStore.resetStudent(props.deploymentId, current.team.teamId, current.username, resetNewPassword.value))
  if (ok) closeDialog()
}

const confirmRemove = async () => {
  const current = dialog.value
  if (current?.kind !== 'remove') return
  const ok = await runAction(current.team.teamId, current.username, () =>
    labStore.removeStudent(props.deploymentId, current.team.teamId, current.username))
  if (ok) closeDialog()
}

const confirmPasswd = async () => {
  const current = dialog.value
  if (current?.kind !== 'passwd') return
  const ok = await runAction(current.team.teamId, current.username, () =>
    labStore.changeStudentPassword(props.deploymentId, current.team.teamId, current.username, passwdValue.value || undefined))
  if (ok) closeDialog()
}

const downloading = ref(false)
const confirmKubeconfig = async () => {
  const current = dialog.value
  if (current?.kind !== 'kubeconfig') return
  downloading.value = true
  try {
    // The backend's own file name; the Content-Disposition header is not
    // readable cross-origin (no ``expose_headers`` in the CORS config).
    const { blob, filename } = await labStore.downloadKubeconfig(
      props.deploymentId, current.team.teamId, `${current.team.name}.kubeconfig`)
    saveBlob(blob, filename)
    closeDialog()
  } catch (err) {
    const key = labErrorKey(err)
    toast.error(key ? t(key) : extractErrorMessage(err))
  } finally {
    downloading.value = false
  }
}

// ----------------------------------------------------------------
// ONE-TIME PASSWORD
// ----------------------------------------------------------------
const revealed = ref<LabResult | null>(null)
const copied = ref(false)

watch(() => props.labResult, (result) => {
  if (!result) return
  revealed.value = { ...result }
  copied.value = false
})

const copyPassword = async () => {
  if (!revealed.value) return
  try {
    await navigator.clipboard.writeText(revealed.value.generated_password)
    copied.value = true
  } catch {
    // Clipboard blocked (insecure context, permissions) — the password
    // stays visible and selectable in the dialog.
  }
}

const closeReveal = () => {
  revealed.value = null
  copied.value = false
}
</script>

<template>
  <div class="bg-surface-card rounded-xl border border-card-border p-6 shadow-sm mb-8" data-testid="k8s-students-panel">
    <div class="flex items-center gap-3 mb-1">
      <div class="p-2 bg-surface-input rounded-lg">
        <Boxes :size="20" class="text-content-secondary" aria-hidden="true" />
      </div>
      <h2 class="text-lg font-semibold text-content-primary">{{ $t('KubernetesStudentsPanel.title') }}</h2>
    </div>
    <p class="text-sm text-content-secondary mb-5">{{ $t('KubernetesStudentsPanel.subtitle') }}</p>

    <p v-if="pending || busy" class="text-xs text-content-secondary mb-4 flex items-center gap-2" data-testid="k8s-action-running">
      <Loader2 :size="14" class="animate-spin" aria-hidden="true" />
      {{ $t('KubernetesStudentsPanel.actionRunning') }}
    </p>

    <section v-for="team in teams" :key="team.teamId" class="mb-6 last:mb-0" :data-testid="`k8s-team-${team.teamId}`">
      <div class="flex items-center justify-between gap-3 flex-wrap mb-3">
        <h3 class="font-semibold text-content-primary">{{ $t('KubernetesStudentsPanel.teamHeading', { team: team.name }) }}</h3>
        <div class="flex items-center gap-2 flex-wrap">
          <BaseButton variant="ghost" size="sm" :disabled="isTeamLoading(team.teamId)"
            data-testid="k8s-refresh" @click="loadTeam(team.teamId)">
            <RefreshCw :size="14" :class="{ 'animate-spin': isTeamLoading(team.teamId) }" aria-hidden="true" />
            {{ $t('KubernetesStudentsPanel.refresh') }}
          </BaseButton>
          <BaseButton variant="ghost" size="sm" data-testid="k8s-kubeconfig"
            @click="openDialog({ kind: 'kubeconfig', team })">
            <Download :size="14" aria-hidden="true" />
            {{ $t('KubernetesStudentsPanel.downloadKubeconfig') }}
          </BaseButton>
          <BaseButton size="sm" :disabled="actionsDisabled || !!teamError(team.teamId)" data-testid="k8s-add"
            @click="openDialog({ kind: 'add', team })">
            <Plus :size="14" aria-hidden="true" />
            {{ $t('KubernetesStudentsPanel.addStudent') }}
          </BaseButton>
        </div>
      </div>

      <div v-if="teamError(team.teamId)" role="alert" data-testid="k8s-team-error"
        class="flex items-center justify-between gap-3 flex-wrap p-4 rounded-lg border border-status-error/30 bg-status-errorLight text-status-error text-sm">
        <span class="flex items-center gap-2">
          <AlertCircle :size="16" aria-hidden="true" />
          {{ teamErrorText(team.teamId) }}
        </span>
        <BaseButton variant="ghost" size="sm" @click="loadTeam(team.teamId)">{{ $t('KubernetesStudentsPanel.retry') }}</BaseButton>
      </div>

      <EntityListState v-else
        :is-loading="isTeamLoading(team.teamId) && studentsOf(team.teamId).length === 0"
        :is-empty="!isTeamLoading(team.teamId) && studentsOf(team.teamId).length === 0"
        :empty-message="$t('KubernetesStudentsPanel.empty')"
        :loading-message="$t('KubernetesStudentsPanel.loading')">
        <p v-if="hasPendingPod(team.teamId)" class="text-xs text-content-secondary mb-3 flex items-start gap-2" data-testid="k8s-pending-hint">
          <Clock :size="14" class="mt-0.5 flex-shrink-0" aria-hidden="true" />
          {{ $t('KubernetesStudentsPanel.pendingHint') }}
        </p>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-xs text-content-secondary border-b border-card-border">
                <th scope="col" class="py-2 pr-4 font-medium">{{ $t('KubernetesStudentsPanel.columns.student') }}</th>
                <th scope="col" class="py-2 pr-4 font-medium">{{ $t('KubernetesStudentsPanel.columns.port') }}</th>
                <th scope="col" class="py-2 pr-4 font-medium">{{ $t('KubernetesStudentsPanel.columns.generation') }}</th>
                <th scope="col" class="py-2 pr-4 font-medium">{{ $t('KubernetesStudentsPanel.columns.pod') }}</th>
                <th scope="col" class="py-2 pr-4 font-medium">{{ $t('KubernetesStudentsPanel.columns.status') }}</th>
                <th scope="col" class="py-2 pr-4 font-medium">{{ $t('KubernetesStudentsPanel.columns.age') }}</th>
                <th scope="col" class="py-2 font-medium text-right">{{ $t('KubernetesStudentsPanel.columns.actions') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="student in studentsOf(team.teamId)" :key="student.username"
                class="border-b border-card-border last:border-0" :data-testid="`k8s-student-${student.username}`">
                <td class="py-2 pr-4 font-medium text-content-primary">{{ student.username }}</td>
                <td class="py-2 pr-4 font-mono text-content-secondary">{{ student.port ?? '-' }}</td>
                <td class="py-2 pr-4 text-content-secondary">{{ student.generation ?? '-' }}</td>
                <td class="py-2 pr-4 font-mono text-xs text-content-secondary break-all">{{ student.pod_name ?? '-' }}</td>
                <td class="py-2 pr-4">
                  <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold border whitespace-nowrap"
                    :class="statusOf(student).classes" data-testid="k8s-status">
                    <component :is="statusOf(student).icon" :size="12" aria-hidden="true" />
                    {{ statusOf(student).label }}
                  </span>
                </td>
                <td class="py-2 pr-4 text-content-secondary whitespace-nowrap">{{ formatDateTime(student.pod_age) }}</td>
                <td class="py-2">
                  <div class="flex items-center justify-end gap-1.5">
                    <BaseButton variant="ghost" size="sm" :disabled="actionsDisabled"
                      :title="$t('KubernetesStudentsPanel.actions.reassignHint')" data-testid="k8s-reassign"
                      @click="reassign(team.teamId, student)">
                      <RotateCcw :size="12" aria-hidden="true" />
                      {{ $t('KubernetesStudentsPanel.actions.reassign') }}
                    </BaseButton>
                    <BaseButton variant="ghost" size="sm" :disabled="actionsDisabled" data-testid="k8s-passwd"
                      @click="openDialog({ kind: 'passwd', team, username: student.username })">
                      <KeyRound :size="12" aria-hidden="true" />
                      {{ $t('KubernetesStudentsPanel.actions.changePassword') }}
                    </BaseButton>
                    <BaseButton variant="red" size="sm" :disabled="actionsDisabled" data-testid="k8s-reset"
                      @click="openDialog({ kind: 'reset', team, username: student.username })">
                      <Trash2 :size="12" aria-hidden="true" />
                      {{ $t('KubernetesStudentsPanel.actions.reset') }}
                    </BaseButton>
                    <BaseButton variant="red" size="sm" :disabled="actionsDisabled" data-testid="k8s-remove"
                      @click="openDialog({ kind: 'remove', team, username: student.username })">
                      <UserMinus :size="12" aria-hidden="true" />
                      {{ $t('KubernetesStudentsPanel.actions.remove') }}
                    </BaseButton>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </EntityListState>
    </section>

    <!-- Add student -->
    <Modal :show="dialog?.kind === 'add'" @close="closeDialog">
      <template #title>{{ $t('KubernetesStudentsPanel.add.title') }}</template>
      <template #body>
        <form class="space-y-4" data-testid="k8s-add-form" @submit.prevent="submitAdd">
          <div>
            <label for="k8s-add-username" class="block text-sm font-medium text-content-primary mb-1">{{ $t('KubernetesStudentsPanel.add.usernameLabel') }}</label>
            <BaseInput id="k8s-add-username" v-model="addUsername" autocomplete="off" data-testid="k8s-add-username" />
            <p class="text-xs mt-1" :class="formTouched && !usernameValid ? 'text-status-error' : 'text-content-secondary'">
              {{ formTouched && !usernameValid ? $t('KubernetesStudentsPanel.add.invalidUsername') : $t('KubernetesStudentsPanel.add.usernameHint') }}
            </p>
          </div>
          <div>
            <label for="k8s-add-password" class="block text-sm font-medium text-content-primary mb-1">{{ $t('KubernetesStudentsPanel.add.passwordLabel') }}</label>
            <BaseInput id="k8s-add-password" v-model="addPassword" type="password" autocomplete="new-password" />
            <p class="text-xs mt-1 text-content-secondary">{{ $t('KubernetesStudentsPanel.add.passwordHint') }}</p>
          </div>
          <div>
            <label for="k8s-add-port" class="block text-sm font-medium text-content-primary mb-1">{{ $t('KubernetesStudentsPanel.add.portLabel') }}</label>
            <BaseInput id="k8s-add-port" v-model="addPort" inputmode="numeric" data-testid="k8s-add-port" />
            <p class="text-xs mt-1" :class="formTouched && !portValid ? 'text-status-error' : 'text-content-secondary'">
              {{ formTouched && !portValid ? $t('KubernetesStudentsPanel.add.invalidPort', portRange) : $t('KubernetesStudentsPanel.add.portHint', portRange) }}
            </p>
          </div>
        </form>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <BaseButton variant="ghost" size="sm" @click="closeDialog">{{ $t('action.cancel') }}</BaseButton>
          <BaseButton size="sm" :disabled="actionsDisabled" data-testid="k8s-add-submit" @click="submitAdd">
            {{ $t('KubernetesStudentsPanel.add.submit') }}
          </BaseButton>
        </div>
      </template>
    </Modal>

    <!-- Reset (destructive) -->
    <Modal :show="dialog?.kind === 'reset'" @close="closeDialog">
      <template #title>{{ $t('KubernetesStudentsPanel.reset.title') }}</template>
      <template #body>
        <p class="text-content-secondary mb-4">
          {{ $t('KubernetesStudentsPanel.reset.body', { username: dialog?.kind === 'reset' ? dialog.username : '' }) }}
        </p>
        <label class="flex items-center gap-2 text-sm text-content-primary">
          <input v-model="resetNewPassword" type="checkbox" class="rounded border-border focus:ring-2 focus:ring-primary" data-testid="k8s-reset-new-password" />
          {{ $t('KubernetesStudentsPanel.reset.newPassword') }}
        </label>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <BaseButton variant="ghost" size="sm" @click="closeDialog">{{ $t('action.cancel') }}</BaseButton>
          <BaseButton variant="red" size="sm" :disabled="actionsDisabled" data-testid="k8s-reset-confirm" @click="confirmReset">
            {{ $t('KubernetesStudentsPanel.reset.confirm') }}
          </BaseButton>
        </div>
      </template>
    </Modal>

    <!-- Remove (destructive) -->
    <Modal :show="dialog?.kind === 'remove'" @close="closeDialog">
      <template #title>{{ $t('KubernetesStudentsPanel.remove.title') }}</template>
      <template #body>
        <p class="text-content-secondary">
          {{ $t('KubernetesStudentsPanel.remove.body', { username: dialog?.kind === 'remove' ? dialog.username : '' }) }}
        </p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <BaseButton variant="ghost" size="sm" @click="closeDialog">{{ $t('action.cancel') }}</BaseButton>
          <BaseButton variant="red" size="sm" :disabled="actionsDisabled" data-testid="k8s-remove-confirm" @click="confirmRemove">
            {{ $t('KubernetesStudentsPanel.remove.confirm') }}
          </BaseButton>
        </div>
      </template>
    </Modal>

    <!-- Change password -->
    <Modal :show="dialog?.kind === 'passwd'" @close="closeDialog">
      <template #title>{{ $t('KubernetesStudentsPanel.passwd.title') }}</template>
      <template #body>
        <form class="space-y-2" @submit.prevent="confirmPasswd">
          <p class="text-content-secondary mb-4">
            {{ $t('KubernetesStudentsPanel.passwd.body', { username: dialog?.kind === 'passwd' ? dialog.username : '' }) }}
          </p>
          <label for="k8s-passwd" class="block text-sm font-medium text-content-primary">{{ $t('KubernetesStudentsPanel.passwd.passwordLabel') }}</label>
          <BaseInput id="k8s-passwd" v-model="passwdValue" type="password" autocomplete="new-password" />
          <p class="text-xs text-content-secondary">{{ $t('KubernetesStudentsPanel.passwd.passwordHint') }}</p>
        </form>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <BaseButton variant="ghost" size="sm" @click="closeDialog">{{ $t('action.cancel') }}</BaseButton>
          <BaseButton size="sm" :disabled="actionsDisabled" data-testid="k8s-passwd-confirm" @click="confirmPasswd">
            {{ $t('KubernetesStudentsPanel.passwd.confirm') }}
          </BaseButton>
        </div>
      </template>
    </Modal>

    <!-- Kubeconfig: cluster-admin warning before the download -->
    <Modal :show="dialog?.kind === 'kubeconfig'" @close="closeDialog">
      <template #title>{{ $t('KubernetesStudentsPanel.kubeconfig.title') }}</template>
      <template #body>
        <div class="space-y-3">
          <p class="flex items-start gap-2 p-3 rounded-lg border border-status-warning/30 bg-status-warningLight text-status-warning text-sm">
            <AlertCircle :size="16" class="mt-0.5 flex-shrink-0" aria-hidden="true" />
            {{ $t('KubernetesStudentsPanel.kubeconfig.adminWarning', { team: dialog?.kind === 'kubeconfig' ? dialog.team.name : '' }) }}
          </p>
          <p class="text-sm text-content-secondary">{{ $t('KubernetesStudentsPanel.kubeconfig.networkHint') }}</p>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <BaseButton variant="ghost" size="sm" @click="closeDialog">{{ $t('action.cancel') }}</BaseButton>
          <BaseButton size="sm" :disabled="downloading" data-testid="k8s-kubeconfig-confirm" @click="confirmKubeconfig">
            <Loader2 v-if="downloading" :size="14" class="animate-spin" aria-hidden="true" />
            <Download v-else :size="14" aria-hidden="true" />
            {{ $t('KubernetesStudentsPanel.kubeconfig.confirm') }}
          </BaseButton>
        </div>
      </template>
    </Modal>

    <!-- One-time password -->
    <Modal :show="!!revealed" @close="closeReveal">
      <template #title>{{ $t('KubernetesStudentsPanel.password.title') }}</template>
      <template #body>
        <div v-if="revealed" class="space-y-3" data-testid="k8s-password-reveal">
          <p class="text-content-secondary">{{ $t('KubernetesStudentsPanel.password.body', { username: revealed.username }) }}</p>
          <div class="flex items-center gap-2">
            <code class="flex-1 px-3 py-2 rounded-lg bg-surface-input border border-card-border font-mono text-content-primary break-all select-all"
              data-testid="k8s-password-value">{{ revealed.generated_password }}</code>
            <BaseButton variant="ghost" size="sm" :aria-label="$t('KubernetesStudentsPanel.password.copy')" @click="copyPassword">
              <Check v-if="copied" :size="14" aria-hidden="true" />
              <Copy v-else :size="14" aria-hidden="true" />
              {{ copied ? $t('KubernetesStudentsPanel.password.copied') : $t('KubernetesStudentsPanel.password.copy') }}
            </BaseButton>
          </div>
          <p v-if="revealed.port" class="text-sm text-content-secondary">{{ $t('KubernetesStudentsPanel.password.port', { port: revealed.port }) }}</p>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end">
          <BaseButton size="sm" @click="closeReveal">{{ $t('action.close') }}</BaseButton>
        </div>
      </template>
    </Modal>
  </div>
</template>

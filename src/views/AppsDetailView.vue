<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { appApi } from '@/api/app.api'
import { useToast } from '@/composables/useToast'
import { useI18n } from 'vue-i18n'
import {
  Layers, Server, Box, Database, Terminal,
  Globe, LayoutTemplate, Shield, ArrowLeft, GitBranch,
  Trash2, AlertCircle, Clock, Send, ShoppingBag, Lock, Undo2,
  Pencil, Image as ImageIcon, Zap,
} from 'lucide-vue-next'
import { useDeploymentStore } from '@/stores/deployment.store'
import { useOpenStackCredentialsStore } from '@/stores/openstack-credentials.store'
import { useAuthStore } from '@/stores/auth.store'
import { useRole } from '@/composables/useRole'
import { formatDate, MAX_IMAGE_BYTES } from '@/utils/format'
import BaseButton from '@/components/ui/BaseButton.vue'
import Modal from '@/components/ui/Modal.vue'
import QuickDeployModal from '@/components/QuickDeployModal.vue'
import AppVersionStatusBadge from '@/components/ui/AppVersionStatusBadge.vue'
import MarkdownRenderer from '@/components/MarkdownRenderer.vue'
import MarkdownEditor from '@/components/MarkdownEditor.vue'
import type { AppVersionApproval, AppVariableMarkerError } from '@/types'

const deploymentStore = useDeploymentStore()
const credStore = useOpenStackCredentialsStore()
const authStore = useAuthStore()
const { isAdmin } = useRole()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const { t, locale } = useI18n()

const isLoading = ref(false)
const app = ref<any>(null)
const selectedVersion = ref('')
const activeTab = ref<'overview' | 'store'>('overview')

const showDeleteModal = ref(false)
const isDeleting = ref(false)

// Edit modal — Name/Description/Image. Privacy is intentionally NOT
// edited here; it has its own toggle in the Store tab to avoid two
// UIs touching the same field.
const showEditModal = ref(false)
const isSavingEdit = ref(false)
const editForm = ref<{ name: string; description: string }>({ name: '', description: '' })
// Image is tri-state on submit:
//   null         → user touched nothing → field omitted from payload
//   File         → new upload → encode as data-URL and send
//   'remove'     → user explicitly cleared → send '' (backend clears)
const editImage = ref<File | 'remove' | null>(null)
const editImagePreview = ref<string | null>(null)
const isEditDragging = ref(false)
const editFileInputRef = ref<HTMLInputElement | null>(null)

// Version approval state
const approvals = ref<AppVersionApproval[]>([])
const submittingVersion = ref<string | null>(null)
const withdrawingVersion = ref<string | null>(null)
const isTogglingPrivacy = ref(false)

// Submit modal (with optional notes)
const showSubmitModal = ref(false)
const submitTargetVersion = ref<string | null>(null)
const submitNotes = ref('')
const isSubmitting = ref(false)
const submitMarkerErrors = ref<AppVariableMarkerError[]>([])

// ----------------------------------------------------------------
// Computed permissions
// ----------------------------------------------------------------
const appId = computed(() => route.params.id as string)

const isOwner = computed(() =>
  !!app.value && String(app.value.userId) === String(authStore.userId)
)

// App edit/delete/version-management is "owner or admin". Mirrors the backend
// ``capabilities.can_edit_app`` so the UI doesn't offer actions that would 403.
const canDelete = computed(() =>
  !!app.value && (isAdmin.value || isOwner.value)
)

const canManageVersions = computed(() =>
  !!app.value && (isOwner.value || isAdmin.value)
)

// ----------------------------------------------------------------
// Store tab banner status
// ----------------------------------------------------------------
const appBannerStatus = computed<'none' | 'no_submission' | 'pending' | 'approved'>(() => {
  if (!app.value || app.value.is_private) return 'none'
  if (approvals.value.some(a => a.status === 'approved')) return 'approved'
  if (approvals.value.some(a => a.status === 'pending')) return 'pending'
  return 'no_submission'
})

// ----------------------------------------------------------------
// Version helpers
// ----------------------------------------------------------------
const approvalByVersion = computed(() => {
  const map: Record<string, AppVersionApproval> = {}
  for (const a of approvals.value) map[a.version_tag] = a
  return map
})

const versionOptions = computed(() => {
  const raw = app.value?.versions || []
  return raw
    .map((v: any) => (typeof v === 'string' ? v : v?.version || v?.releaseTag || ''))
    .filter((v: string) => Boolean(v))
})

const selectedVersionDetails = computed(() => {
  if (!app.value?.versions || !selectedVersion.value) return null
  const match = app.value.versions.find((v: any) => {
    if (typeof v === 'string') return v === selectedVersion.value
    return v?.version === selectedVersion.value || v?.releaseTag === selectedVersion.value || v?.tag === selectedVersion.value
  })
  if (!match) return null
  return typeof match === 'string' ? { version: match } : match
})

const versionInfo = computed(() => {
  const d: any = selectedVersionDetails.value
  if (!d || typeof d !== 'object') return null
  return {
    name: d.name ?? '',
    type: d.type ?? '',
    commit: d.commit ?? d.commit_sha ?? '',
    description: d.description ?? '',
    author: d.author ?? d.commit_author ?? '',
    published_at: d.published_at ?? d.commit_date ?? '',
    prerelease: d.prerelease ?? '',
    html_url: d.html_url ?? d.url ?? '',
  }
})

const hasVersionInfo = computed(() => {
  const d: any = selectedVersionDetails.value
  if (!d || typeof d !== 'object') return false
  return ['name','type','commit','description','author','published_at','prerelease','html_url',
    'commit_sha','commit_author','commit_date','url'].some(k => Boolean(d[k]))
})

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------
const getIconForApp = (appName: string) => {
  const name = (appName || '').toLowerCase()
  if (name.includes('node')) return Server
  if (name.includes('vue') || name.includes('front')) return LayoutTemplate
  if (name.includes('react')) return Globe
  if (name.includes('python') || name.includes('jupyter') || name.includes('fastapi')) return Box
  if (name.includes('postgres') || name.includes('sql') || name.includes('data')) return Database
  if (name.includes('docker') || name.includes('container')) return Terminal
  if (name.includes('security') || name.includes('pen')) return Shield
  return Layers
}

// ----------------------------------------------------------------
// API calls
// ----------------------------------------------------------------
const fetchAppDetails = async () => {
  if (!appId.value) return
  isLoading.value = true
  try {
    const response = await appApi.getById(appId.value, false)
    app.value = response.data
    if (versionOptions.value.length > 0 && !selectedVersion.value) {
      selectedVersion.value = versionOptions.value[0]
    }
  } catch {
    toast.error(t('AppsDetailView.toasts.loadError'))
    if (!app.value) router.push({ name: 'apps.index' })
  } finally {
    isLoading.value = false
  }
}

const fetchApprovals = async () => {
  if (!appId.value) return
  try {
    const res = await appApi.listVersionApprovals(appId.value)
    approvals.value = res.data
  } catch {
    approvals.value = []
  }
}

const handleDeploy = () => {
  if (!selectedVersion.value) {
    toast.warning(t('AppsDetailView.toasts.selectVersionFirst'))
    return
  }
  deploymentStore.resetDraft()
  deploymentStore.draft.appId = app.value.appId || app.value.id
  deploymentStore.draft.releaseTag = selectedVersion.value
  toast.success(t('AppsDetailView.toasts.preparingConfig', { name: app.value.name }))
  router.push({ name: 'deployment.config' })
}

const isQuickDeploying = ref(false)

/**
 * Express deploy with the version already picked here, so the store is spared
 * the extra detail call the tile needs. Anything that cannot be defaulted sends
 * the user into the regular wizard, with the draft already filled in.
 */
// Der Teilnehmer-Dialog läuft dem Schnell-Deploy voraus: Wer die Umgebung
// bekommt, lässt sich aus der App nicht ableiten — alles andere schon.
const showQuickDeployModal = ref(false)

const openQuickDeploy = () => {
  if (!selectedVersion.value) {
    toast.warning(t('AppsDetailView.toasts.selectVersionFirst'))
    return
  }
  if (isQuickDeploying.value) return
  showQuickDeployModal.value = true
}

const handleQuickDeploy = async (memberIds: string[]) => {
  showQuickDeployModal.value = false
  if (!selectedVersion.value || isQuickDeploying.value) return

  isQuickDeploying.value = true
  try {
    const outcome = await deploymentStore.prepareQuickDeploy(
      app.value.appId || app.value.id,
      app.value.name,
      selectedVersion.value,
      memberIds,
    )
    if (outcome.ready) {
      toast.success(t('deployment.quickDeploy.ready', { name: app.value.name }))
      router.push({ name: 'deployment.summary' })
      return
    }
    toast.info(t(`deployment.quickDeploy.${outcome.reason}`))
    router.push({ name: 'deployment.config' })
  } catch {
    toast.error(t('deployment.quickDeploy.error'))
  } finally {
    isQuickDeploying.value = false
  }
}

const openSubmitModal = (versionTag: string) => {
  submitTargetVersion.value = versionTag
  submitNotes.value = ''
  submitMarkerErrors.value = []
  showSubmitModal.value = true
}

const confirmSubmit = async () => {
  if (!submitTargetVersion.value) return
  isSubmitting.value = true
  try {
    await appApi.submitVersion(appId.value, submitTargetVersion.value, undefined, submitNotes.value.trim() || undefined)
    toast.success(t('AppsDetailView.toasts.submitSuccess'))
    showSubmitModal.value = false
    await fetchApprovals()
  } catch (err: any) {
    const s = err?.response?.status
    if (s === 409) {
      toast.warning(t('AppsDetailView.toasts.submitDuplicate'))
    } else if (s === 422) {
      const detail = err?.response?.data?.detail
      if (detail?.marker_errors?.length) {
        submitMarkerErrors.value = detail.marker_errors
      } else {
        toast.error(t('AppsDetailView.toasts.submitError'))
      }
    } else {
      toast.error(t('AppsDetailView.toasts.submitError'))
    }
  } finally {
    isSubmitting.value = false
  }
}

const withdrawVersion = async (versionTag: string) => {
  withdrawingVersion.value = versionTag
  try {
    await appApi.withdrawVersion(appId.value, versionTag)
    toast.success(t('AppsDetailView.toasts.withdrawSuccess'))
    await fetchApprovals()
  } catch {
    toast.error(t('AppsDetailView.toasts.withdrawError'))
  } finally {
    withdrawingVersion.value = null
  }
}

const togglePrivacy = async () => {
  if (!app.value) return
  isTogglingPrivacy.value = true
  try {
    await appApi.update(app.value.appId, { is_private: !app.value.is_private })
    app.value.is_private = !app.value.is_private
    toast.success(app.value.is_private
      ? t('AppsDetailView.toasts.setPrivate')
      : t('AppsDetailView.toasts.setPublic')
    )
  } catch {
    toast.error(t('AppsDetailView.toasts.updateError'))
  } finally {
    isTogglingPrivacy.value = false
  }
}

// ----------------------------------------------------------------
// Edit modal
// ----------------------------------------------------------------
const openEditModal = () => {
  if (!app.value) return
  editForm.value = {
    name: app.value.name || '',
    description: app.value.description || '',
  }
  editImage.value = null
  editImagePreview.value = app.value.image || null
  showEditModal.value = true
}

const closeEditModal = () => {
  if (isSavingEdit.value) return
  showEditModal.value = false
}

const triggerEditFileInput = () => editFileInputRef.value?.click()

const processEditFile = (file: File) => {
  if (!file.type.startsWith('image/')) {
    toast.error(t('AppsDetailView.toasts.onlyImages'))
    return
  }
  if (file.size > MAX_IMAGE_BYTES) {
    toast.error(t('AppsDetailView.toasts.imageTooLarge', { size: Math.round(MAX_IMAGE_BYTES / 1024 / 1024) }))
    return
  }
  editImage.value = file
  editImagePreview.value = URL.createObjectURL(file)
}

const handleEditFileChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  if (target.files && target.files.length > 0) {
    const file = target.files[0]
    if (file) processEditFile(file)
  }
  if (target) target.value = ''
}

const handleEditDrop = (event: DragEvent) => {
  isEditDragging.value = false
  if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
    const file = event.dataTransfer.files[0]
    if (file) processEditFile(file)
  }
}

const removeEditImage = () => {
  editImage.value = 'remove'
  editImagePreview.value = null
}

const editImageFile = computed<File | null>(() =>
  editImage.value instanceof File ? editImage.value : null
)

const fileToDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

const submitEdit = async () => {
  if (!app.value) return
  const name = editForm.value.name.trim()
  if (!name) {
    toast.error(t('AppsDetailView.toasts.nameRequired'))
    return
  }

  // Build payload — only send fields the user actually changed so we
  // don't accidentally overwrite server-side values with stale ones.
  const payload: { name?: string; description?: string; image?: string } = {}
  if (name !== app.value.name) payload.name = name
  if (editForm.value.description !== (app.value.description || '')) {
    payload.description = editForm.value.description
  }
  if (editImage.value instanceof File) {
    payload.image = await fileToDataUrl(editImage.value)
  } else if (editImage.value === 'remove') {
    payload.image = ''
  }

  if (Object.keys(payload).length === 0) {
    showEditModal.value = false
    return
  }

  isSavingEdit.value = true
  try {
    const { data } = await appApi.update(app.value.appId, payload)
    // Refresh from server response so image/description/name reflect
    // what the backend actually stored.
    app.value = { ...app.value, ...data }
    toast.success(t('AppsDetailView.toasts.editSuccess'))
    showEditModal.value = false
  } catch {
    toast.error(t('AppsDetailView.toasts.editError'))
  } finally {
    isSavingEdit.value = false
  }
}

const confirmDelete = async () => {
  if (!app.value) return
  const safeId = app.value.appId || app.value.id || app.value._id
  if (!safeId) { toast.error(t('AppsDetailView.deleteErrorToast')); return }

  isDeleting.value = true
  try {
    await appApi.delete(safeId)
    toast.success(t('AppsDetailView.deleteSuccessToast'))
    showDeleteModal.value = false
    router.push({ name: 'apps' })
  } catch (error: any) {
    const detail = error?.response?.data?.detail
    const reason = typeof detail === 'object' ? detail?.message || detail?.reason : detail
    toast.error(`${t('AppsDetailView.deleteErrorToast')}${reason ? ': ' + reason : ''}`)
  } finally {
    isDeleting.value = false
  }
}

onMounted(async () => {
  await fetchAppDetails()
  if (canManageVersions.value) await fetchApprovals()
})
</script>

<template>
  <div class="bg-surface-card rounded-2xl p-10 border border-card-border min-h-[600px]">

    <!-- Back -->
    <div class="mb-6">
      <button
        @click="router.back()"
        class="flex items-center text-content-secondary hover:text-content-primary transition-colors"
      >
        <ArrowLeft :size="20" class="mr-2" /> {{ $t('AppsDetailView.backToOverview') }}
      </button>
    </div>

    <!-- Loading -->
    <div v-if="isLoading" class="flex justify-center py-20">
      <div class="flex flex-col items-center gap-3">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <div class="text-content-disabled">{{ $t('AppsDetailView.loading') }}</div>
      </div>
    </div>

    <div v-else-if="app" class="max-w-4xl mx-auto">

      <!-- App header -->
      <div class="flex items-start gap-6 mb-6 border-b border-card-border pb-6">
        <div class="bg-card-tinted p-4 rounded-xl shadow-sm text-primary flex items-center justify-center w-[88px] h-[88px] flex-shrink-0">
          <img v-if="app.image" :src="app.image" :alt="app.name" class="w-full h-full object-contain" />
          <component v-else :is="getIconForApp(app.name)" :size="48" />
        </div>
        <div class="flex-grow">
          <div class="flex justify-between items-start">
            <div>
              <h1 class="text-3xl font-bold text-content-primary mb-2">{{ app.name }}</h1>
              <div class="flex items-center gap-3 text-sm text-content-secondary">
                <span class="flex items-center gap-1 bg-surface-input px-2 py-1 rounded">
                  <GitBranch :size="14" /> {{ app.versions?.length || 0 }} {{ $t('AppsDetailView.versionsAvailable') }}
                </span>
                <a v-if="app.git_link" :href="app.git_link" target="_blank" rel="noopener noreferrer" class="text-tag-info hover:underline cursor-pointer truncate max-w-xs block">
                  {{ app.git_link }}
                </a>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <BaseButton v-if="canDelete" @click="openEditModal" class="flex items-center gap-2 px-4 py-2" variant="ghost">
                <Pencil :size="18" />
                <span class="font-medium">{{ $t('AppsDetailView.editApp') }}</span>
              </BaseButton>
              <BaseButton v-if="canDelete" @click="showDeleteModal = true" class="flex items-center gap-2 px-4 py-2" variant="red">
                <Trash2 :size="18" />
                <span class="font-medium">{{ $t('AppsDetailView.deleteApp') }}</span>
              </BaseButton>
            </div>
          </div>
        </div>
      </div>

      <!-- Tab bar -->
      <div class="flex gap-1 mb-8 border-b border-card-border">
        <button
          @click="activeTab = 'overview'"
          class="flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px"
          :class="activeTab === 'overview'
            ? 'border-primary text-primary'
            : 'border-transparent text-content-secondary hover:text-content-primary hover:border-border-strong'"
        >
          <Layers :size="16" />
          {{ $t('AppsDetailView.tabOverview') }}
        </button>
        <button
          v-if="canManageVersions"
          @click="activeTab = 'store'"
          class="flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px"
          :class="activeTab === 'store'
            ? 'border-primary text-primary'
            : 'border-transparent text-content-secondary hover:text-content-primary hover:border-border-strong'"
        >
          <ShoppingBag :size="16" />
          {{ $t('AppsDetailView.tabStore') }}
          <!-- dot if action needed -->
          <span
            v-if="appBannerStatus === 'no_submission' || appBannerStatus === 'pending'"
            class="w-2 h-2 rounded-full bg-tag-destroy"
          />
        </button>
      </div>

      <!-- ============================================================ -->
      <!-- TAB 1: OVERVIEW                                               -->
      <!-- ============================================================ -->
      <div v-if="activeTab === 'overview'" class="grid grid-cols-1 lg:grid-cols-3 gap-12">

        <div class="lg:col-span-2 space-y-6">

          <div>
            <h2 class="text-xl font-semibold text-content-primary mb-3">{{ $t('AppsDetailView.descriptionTitle') }}</h2>
            <MarkdownRenderer
              v-if="app.description && app.description.trim()"
              :source="app.description"
              variant="full"
            />
            <p
                v-else
                :lang="locale"
                class="text-content-secondary italic"
            >
              {{ $t('AppsDetailView.noDescription') }}
            </p>
          </div>

          <div class="bg-surface-input rounded-lg p-4 border border-card-border">
            <h3 class="text-sm font-semibold text-content-primary uppercase tracking-wide mb-2">{{ $t('AppsDetailView.appInfoTitle') }}</h3>
            <ul class="space-y-2 text-sm text-content-secondary">
              <li class="flex justify-between">
                <span>{{ $t('AppsDetailView.createdAt') }}</span>
                <span class="font-medium">{{ app.created_at ? formatDate(app.created_at) : '-' }}</span>
              </li>
              <li class="flex justify-between">
                <span>{{ $t('AppsDetailView.createdBy') }}</span>
                <span class="font-medium">{{ app.user?.username || $t('AppsDetailView.unknownUser') }}</span>
              </li>
            </ul>
          </div>

          <div class="bg-surface-input rounded-lg p-4 border border-card-border">
            <h3 class="text-sm font-semibold text-content-primary uppercase tracking-wide mb-2">{{ $t('AppsDetailView.versionDetailsTitle') }}</h3>
            <div v-if="hasVersionInfo && versionInfo" class="space-y-2 text-sm">
              <div class="flex justify-between">
                <span class="text-content-secondary">{{ $t('AppsDetailView.versionName') }}</span>
                <span class="font-medium text-right">{{ versionInfo.name || '-' }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-content-secondary">{{ $t('AppsDetailView.versionType') }}</span>
                <span class="font-medium text-right">{{ versionInfo.type || '-' }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-content-secondary">{{ $t('AppsDetailView.versionCommit') }}</span>
                <span class="font-medium text-right">{{ versionInfo.commit || '-' }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-content-secondary">{{ $t('AppsDetailView.versionAuthor') }}</span>
                <span class="font-medium text-right">{{ versionInfo.author || '-' }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-content-secondary">{{ $t('AppsDetailView.versionPublishedAt') }}</span>
                <span class="font-medium text-right">{{ versionInfo.published_at ? formatDate(versionInfo.published_at) : '-' }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-content-secondary">{{ $t('AppsDetailView.versionPreRelease') }}</span>
                <span class="font-medium text-right">
                  {{ String(versionInfo.prerelease ?? '').toLowerCase() === 'true' ? $t('AppsDetailView.yes') : (versionInfo.prerelease === '' ? '-' : $t('AppsDetailView.no')) }}
                </span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-content-secondary">{{ $t('AppsDetailView.versionLink') }}</span>
                <a v-if="versionInfo.html_url" :href="versionInfo.html_url" target="_blank" rel="noopener" class="font-medium text-tag-info hover:underline break-all">{{ versionInfo.html_url }}</a>
                <span v-else class="font-medium text-right">-</span>
              </div>
            </div>
            <p v-else class="text-xs text-content-disabled">{{ $t('AppsDetailView.noVersionInfo') }}</p>
          </div>

          <div v-if="versionInfo && versionInfo.description" class="bg-surface-input rounded-lg p-4 border border-card-border">
            <h3 class="text-sm font-semibold text-content-primary uppercase tracking-wide mb-2">{{ $t('AppsDetailView.versionDescTitle') }}</h3>
            <MarkdownRenderer :source="versionInfo.description" variant="full" />
          </div>

        </div>

        <!-- Deploy sidebar -->
        <div class="bg-surface-card border border-card-border rounded-xl p-6 h-fit sticky top-6">
          <h2 class="text-lg font-semibold text-content-primary mb-6">{{ $t('AppsDetailView.startDeploymentTitle') }}</h2>

          <div class="mb-6">
            <label class="block text-sm font-medium text-content-primary mb-2">{{ $t('AppsDetailView.selectVersionLabel') }}</label>
            <select
              v-model="selectedVersion"
              class="w-full rounded-lg border border-border bg-surface-card py-2 px-3 text-sm text-content-primary focus:ring-2 focus:ring-primary focus:border-primary shadow-sm cursor-pointer transition-all hover:border-border-strong"
              :disabled="versionOptions.length === 0"
            >
              <option v-for="ver in versionOptions" :key="ver" :value="ver">{{ ver }}</option>
            </select>
          </div>

          <div class="flex flex-col gap-2">
            <BaseButton
              variant="yellow"
              class="w-full"
              data-testid="app-detail-quick-deploy"
              :disabled="!selectedVersion || isQuickDeploying || (credStore.isResolved && !credStore.hasCredential)"
              :title="credStore.isResolved && !credStore.hasCredential ? $t('AppsDetailView.missingCredsTitle') : ''"
              @click="openQuickDeploy"
            >
              <Zap :size="18" aria-hidden="true" />
              {{ $t('deployment.quickDeploy.button') }}
            </BaseButton>

            <button
              @click="handleDeploy"
              :disabled="!selectedVersion || (credStore.isResolved && !credStore.hasCredential)"
              :title="credStore.isResolved && !credStore.hasCredential ? $t('AppsDetailView.missingCredsTitle') : ''"
              class="w-full bg-gradient-to-r from-primary to-primary-dark text-content-inverse px-4 py-3 rounded-lg font-semibold hover:shadow-lg transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
            >
              <Layers :size="18" />
              {{ $t('AppsDetailView.deployButton') }}
            </button>
          </div>
          <p v-if="credStore.isResolved && !credStore.hasCredential" class="mt-2 text-sm text-status-warning">
            <router-link to="/user/openstack" class="underline font-medium">{{ $t('AppsDetailView.missingCredsLink') }}</router-link>
            {{ $t('AppsDetailView.missingCredsText') }}
          </p>
        </div>

      </div>

      <!-- ============================================================ -->
      <!-- TAB 2: APP STORE                                              -->
      <!-- ============================================================ -->
      <div v-else-if="activeTab === 'store'" class="space-y-6">

        <!-- Status banners -->
        <div v-if="appBannerStatus === 'no_submission'" class="flex items-start gap-3 bg-tag-warningLight border border-tag-warningBorder rounded-xl p-4 text-tag-warning">
          <AlertCircle :size="20" class="flex-shrink-0 mt-0.5" />
          <p class="text-sm">{{ $t('AppsDetailView.bannerNoSubmission') }}</p>
        </div>
        <div v-else-if="appBannerStatus === 'pending'" class="flex items-start gap-3 bg-tag-destroyLight border border-tag-destroyBorder rounded-xl p-4 text-tag-destroy">
          <Clock :size="20" class="flex-shrink-0 mt-0.5" />
          <p class="text-sm">{{ $t('AppsDetailView.bannerPending') }}</p>
        </div>

        <!-- Visibility toggle card -->
        <div class="bg-surface-input rounded-xl border border-card-border p-5">
          <h3 class="text-sm font-semibold text-content-primary uppercase tracking-wide mb-4">{{ $t('AppsDetailView.storeVisibilityTitle') }}</h3>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="p-2 rounded-lg" :class="app.is_private ? 'bg-tag-accentLight text-tag-accent' : 'bg-status-successLight text-status-success'">
                <Lock v-if="app.is_private" :size="20" />
                <Globe v-else :size="20" />
              </div>
              <div>
                <p class="font-medium text-content-primary">
                  {{ app.is_private ? $t('AppsDetailView.visibilityPrivate') : $t('AppsDetailView.visibilityPublic') }}
                </p>
                <p class="text-sm text-content-secondary">
                  {{ app.is_private ? $t('AppsDetailView.visibilityPrivateDesc') : $t('AppsDetailView.visibilityPublicDesc') }}
                </p>
              </div>
            </div>
            <button
              @click="togglePrivacy"
              :disabled="isTogglingPrivacy"
              class="relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-50"
              :class="app.is_private ? 'bg-tag-accent' : 'bg-status-success'"
            >
              <span
                class="inline-block h-5 w-5 transform rounded-full bg-surface-card shadow transition duration-200"
                :class="app.is_private ? 'translate-x-0' : 'translate-x-5'"
              />
            </button>
          </div>
        </div>

        <!-- Version approval table (only for public apps) -->
        <div v-if="!app.is_private" class="bg-surface-input rounded-xl border border-card-border p-5">
          <h3 class="text-sm font-semibold text-content-primary uppercase tracking-wide mb-4">{{ $t('AppsDetailView.versionTableTitle') }}</h3>

          <div v-if="versionOptions.length === 0" class="text-sm text-content-disabled italic">
            {{ $t('AppsDetailView.noVersionsYet') }}
          </div>

          <div v-else class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-card-border text-left text-xs text-content-secondary uppercase tracking-wide">
                  <th class="pb-2 pr-4">{{ $t('AppsDetailView.versionTableVersion') }}</th>
                  <th class="pb-2 pr-4">{{ $t('AppsDetailView.versionTableStatus') }}</th>
                  <th class="pb-2 pr-4">{{ $t('AppsDetailView.versionTableDate') }}</th>
                  <th class="pb-2">{{ $t('AppsDetailView.versionTableAction') }}</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-card-border">
                <tr v-for="ver in versionOptions" :key="ver" class="hover:bg-surface-hover transition-colors">
                  <td class="py-2.5 pr-4 font-mono text-content-primary">{{ ver }}</td>
                  <td class="py-2.5 pr-4">
                    <AppVersionStatusBadge v-if="approvalByVersion[ver]" :status="approvalByVersion[ver].status" />
                    <span v-else class="text-content-disabled text-xs">–</span>
                  </td>
                  <td class="py-2.5 pr-4 text-content-secondary text-xs">
                    {{ approvalByVersion[ver] ? formatDate(approvalByVersion[ver].created_at) : '–' }}
                  </td>
                  <td class="py-2.5">
                    <div v-if="approvalByVersion[ver]?.status === 'rejected'" class="space-y-1">
                      <p class="text-xs text-status-error italic">
                        {{ $t('AppsDetailView.rejectionReasonLabel') }} {{ approvalByVersion[ver].rejection_reason || '–' }}
                      </p>
                      <button
                        v-if="isOwner"
                        @click="openSubmitModal(ver)"
                        :disabled="submittingVersion === ver"
                        class="text-xs text-tag-info hover:underline flex items-center gap-1 disabled:opacity-50"
                      >
                        <Send :size="12" />
                        {{ submittingVersion === ver ? $t('AppsDetailView.submittingButton') : $t('AppsDetailView.resubmitButton') }}
                      </button>
                    </div>
                    <!-- Pending: withdraw button -->
                    <div v-else-if="approvalByVersion[ver]?.status === 'pending' && isOwner">
                      <button
                        @click="withdrawVersion(ver)"
                        :disabled="withdrawingVersion === ver"
                        class="text-xs text-content-secondary hover:text-status-error hover:underline flex items-center gap-1 disabled:opacity-50"
                      >
                        <Undo2 :size="12" />
                        {{ withdrawingVersion === ver ? '...' : $t('AppsDetailView.withdrawButton') }}
                      </button>
                    </div>
                    <button
                      v-else-if="!approvalByVersion[ver] && isOwner"
                      @click="openSubmitModal(ver)"
                      :disabled="submittingVersion === ver"
                      class="text-xs text-status-success hover:underline flex items-center gap-1 disabled:opacity-50"
                    >
                      <Send :size="12" />
                      {{ submittingVersion === ver ? $t('AppsDetailView.submittingButton') : $t('AppsDetailView.submitButton') }}
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Private app hint -->
        <div v-else class="bg-tag-accentLight border border-tag-accentBorder rounded-xl p-5 text-sm text-tag-accent">
          {{ $t('AppsDetailView.privateAppStoreHint') }}
        </div>

      </div>

    </div>

    <!-- Delete modal -->
    <Modal v-if="app" :show="showDeleteModal" @close="showDeleteModal = false">
      <template #title>{{ $t('AppsDetailView.confirmDeleteTitle') }}</template>
      <template #body>
        <div class="space-y-3">
          <p class="text-content-primary" v-html="$t('AppsDetailView.confirmDeleteMessage', { name: app.name })"></p>        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-3">
          <BaseButton variant="ghost" @click="showDeleteModal = false" :disabled="isDeleting">
            {{ $t('AppsDetailView.cancelButton') }}
          </BaseButton>
          <BaseButton variant="red" @click="confirmDelete" :disabled="isDeleting">
            {{ isDeleting ? $t('AppsDetailView.deletingButton') : $t('AppsDetailView.confirmButton') }}
          </BaseButton>
        </div>
      </template>
    </Modal>

    <!-- Edit modal: name / description / image. git_link is intentionally
         immutable (backend rejects it; AppUpdate schema drops it). Privacy
         has its own toggle in the Store tab. -->
    <Modal v-if="app" :show="showEditModal" @close="closeEditModal">
      <template #title>{{ $t('AppsDetailView.editModal.title') }}</template>
      <template #body>
        <div class="space-y-4">
          <p class="text-sm text-content-secondary">{{ $t('AppsDetailView.editModal.description') }}</p>

          <!-- Name -->
          <div>
            <label class="block text-sm font-medium text-content-primary mb-1.5">
              {{ $t('AppsDetailView.editModal.nameLabel') }}
            </label>
            <input
              v-model="editForm.name"
              type="text"
              class="w-full rounded-lg border border-border px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none bg-surface-card text-content-primary"
            />
          </div>

          <!-- Description -->
          <div>
            <label class="block text-sm font-medium text-content-primary mb-1.5">
              {{ $t('AppsDetailView.editModal.descLabel') }}
            </label>
            <MarkdownEditor
              v-model="editForm.description"
              :placeholder="$t('AppsCreateView.form.descPlaceholder')"
              :min-height-px="120"
              :max-height-px="320"
            />
            <p class="mt-1 text-xs text-content-disabled">{{ $t('AppsCreateView.form.descMarkdownHint') }}</p>
          </div>

          <!-- Image -->
          <div>
            <label class="block text-sm font-medium text-content-primary mb-1.5">
              {{ $t('AppsDetailView.editModal.imageLabel') }}
            </label>
            <div
              class="bg-surface-card rounded-lg py-2 px-3 text-content-primary shadow-sm border-2 transition-all cursor-pointer flex items-center min-h-[60px]"
              :class="isEditDragging ? 'border-primary bg-primary/5 border-dashed' : 'border-card-border hover:border-border border-dashed'"
              @dragover.prevent="isEditDragging = true"
              @dragleave.prevent="isEditDragging = false"
              @drop.prevent="handleEditDrop"
              @click="triggerEditFileInput"
            >
              <input
                ref="editFileInputRef"
                type="file"
                accept="image/*"
                class="hidden"
                @change="handleEditFileChange"
              />
              <div v-if="editImagePreview" class="flex justify-between items-center w-full">
                <div class="flex items-center gap-3">
                  <img :src="editImagePreview" :alt="editForm.name" class="w-10 h-10 object-contain rounded bg-surface-input" />
                  <span class="text-sm text-content-primary">
                    {{ editImageFile ? editImageFile.name : $t('AppsDetailView.editModal.currentImage') }}
                  </span>
                </div>
                <button
                  type="button"
                  class="text-xs text-content-disabled hover:text-status-error"
                  @click.stop="removeEditImage"
                >
                  {{ $t('AppsDetailView.editModal.imageRemove') }}
                </button>
              </div>
              <div v-else class="flex items-center gap-2 text-sm text-content-disabled">
                <ImageIcon :size="18" />
                <span>{{ $t('AppsDetailView.editModal.imageHint') }}</span>
              </div>
            </div>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-3">
          <BaseButton variant="ghost" @click="closeEditModal" :disabled="isSavingEdit">
            {{ $t('AppsDetailView.cancelButton') }}
          </BaseButton>
          <BaseButton variant="primary" @click="submitEdit" :disabled="isSavingEdit">
            {{ isSavingEdit ? $t('AppsDetailView.editModal.savingButton') : $t('AppsDetailView.editModal.saveButton') }}
          </BaseButton>
        </div>
      </template>
    </Modal>

    <!-- Submit modal (with optional notes) -->
    <Modal :show="showSubmitModal" @close="showSubmitModal = false">
      <template #title>{{ $t('AppsDetailView.submitModal.title') }}</template>
      <template #body>
        <div class="space-y-4">
          <p class="text-sm text-content-secondary">
            {{ $t('AppsDetailView.submitModal.description') }}
            <span class="font-mono bg-surface-input px-1.5 py-0.5 rounded text-xs ml-1">{{ submitTargetVersion }}</span>
          </p>
          <div>
            <label class="block text-sm font-medium text-content-primary mb-1.5">
              {{ $t('AppsDetailView.submitModal.notesLabel') }}
            </label>
            <textarea
              v-model="submitNotes"
              :placeholder="$t('AppsDetailView.submitModal.notesPlaceholder')"
              rows="3"
              class="w-full rounded-lg border border-border bg-surface-card text-content-primary px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none resize-none"
            />
          </div>

          <!-- Marker-Fehler -->
          <div v-if="submitMarkerErrors.length" class="rounded-lg border border-status-error/30 bg-status-errorLight p-3">
            <p class="text-xs font-semibold text-status-error mb-2">{{ $t('AppsDetailView.submitModal.markerErrorTitle') }}</p>
            <ul class="space-y-1.5">
              <li v-for="e in submitMarkerErrors" :key="e.variable + e.code" class="text-xs text-status-error">
                <span class="font-mono font-medium">{{ e.variable }}</span>
                <span class="text-status-error/50 mx-1">·</span>
                <span>{{ e.message }}</span>
                <span v-if="e.location" class="text-status-error/50 ml-1 text-[10px]">({{ e.location }})</span>
              </li>
            </ul>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-3">
          <BaseButton variant="ghost" @click="showSubmitModal = false" :disabled="isSubmitting">
            {{ $t('AppsDetailView.cancelButton') }}
          </BaseButton>
          <BaseButton variant="primary" @click="confirmSubmit" :disabled="isSubmitting">
            {{ isSubmitting ? '...' : $t('AppsDetailView.submitModal.submit') }}
          </BaseButton>
        </div>
      </template>
    </Modal>

    <QuickDeployModal
      :show="showQuickDeployModal"
      :app-name="app?.name || ''"
      @close="showQuickDeployModal = false"
      @confirm="handleQuickDeploy"
    />

  </div>
</template>

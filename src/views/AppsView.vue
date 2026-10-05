<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import Card from '@/components/ui/Card.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import EntityListState from '@/components/ui/EntityListState.vue'
import AppVersionStatusBadge from '@/components/ui/AppVersionStatusBadge.vue'
import MarkdownRenderer from '@/components/MarkdownRenderer.vue'
import { useRouter } from 'vue-router'
import { appApi } from '@/api/app.api'
import { useI18n } from 'vue-i18n'
import {
  Layers, Server, Box, Database, Terminal,
  Globe, LayoutTemplate, Shield, Inbox, Plus, Lock, Zap
} from 'lucide-vue-next'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth.store'
import { useDeploymentStore } from '@/stores/deployment.store'
import { useOpenStackCredentialsStore } from '@/stores/openstack-credentials.store'
import type { AppVersionApproval } from '@/types'

const { t, locale } = useI18n()
const toast = useToast()
const router = useRouter()
const authStore = useAuthStore()
const deploymentStore = useDeploymentStore()
const credStore = useOpenStackCredentialsStore()

// A quick deploy runs the whole way to the summary, so it needs the same
// credential gate the detail page puts on its deploy button — without one the
// deployment can only fail at the very last step. Waiting for ``isResolved``
// keeps the button from flashing disabled during the initial fetch.
const isMissingCredential = computed(() => credStore.isResolved && !credStore.hasCredential)

const isLoading = ref(false)
const apps = ref<any[]>([])
const approvalsMap = ref<Record<string, AppVersionApproval[]>>({})

// Admin-only filter
const visibilityFilter = ref<'all' | 'public' | 'private'>('all')

const filteredApps = computed(() => {
  if (!authStore.isAdmin || visibilityFilter.value === 'all') return apps.value
  if (visibilityFilter.value === 'private') return apps.value.filter(a => a.is_private)
  return apps.value.filter(a => !a.is_private)
})

const getIconForApp = (app: any) => {
  const name = (app.name || '').toLowerCase()
  if (name.includes('node')) return Server
  if (name.includes('vue') || name.includes('front')) return LayoutTemplate
  if (name.includes('react')) return Globe
  if (name.includes('python') || name.includes('jupyter') || name.includes('fastapi')) return Box
  if (name.includes('postgres') || name.includes('sql') || name.includes('data')) return Database
  if (name.includes('docker') || name.includes('container')) return Terminal
  if (name.includes('security') || name.includes('pen')) return Shield
  return Layers
}

const isOwnApp = (app: any) => String(app.userId) === String(authStore.userId)

const badgeStatusForApp = (app: any) => {
  if (!isOwnApp(app)) return null
  if (app.is_private) return 'private'
  const approvals = approvalsMap.value[app.appId] ?? []
  if (approvals.some(a => a.status === 'approved')) return 'published'
  if (approvals.some(a => a.status === 'pending')) return 'pending'
  return 'new'
}

const fetchApps = async () => {
  isLoading.value = true
  try {
    const response = await appApi.list()
    apps.value = (response.data && Array.isArray(response.data)) ? response.data : []
    const ownApps = apps.value.filter(isOwnApp)
    await Promise.allSettled(
      ownApps.map(async (app) => {
        try {
          const res = await appApi.listVersionApprovals(app.appId)
          approvalsMap.value[app.appId] = res.data
        } catch {
          approvalsMap.value[app.appId] = []
        }
      })
    )
  } catch (error) {
    console.error('Fehler beim Laden der Apps:', error)
    toast.error(t('AppsView.loadError'))
    apps.value = []
  } finally {
    isLoading.value = false
  }
}

const handleDeploy = (app: any) => {
  router.push({ name: 'apps.detail', params: { id: app.id || app._id || app.appId } })
}

// Tracks the tile whose quick deploy is currently being prepared, so only that
// one button shows the pending state instead of the whole grid.
const quickDeployBusyId = ref<string | null>(null)

/**
 * Express deploy straight from the tile: prefill the draft and jump to the
 * summary. When a value cannot be defaulted the store says so, and we route
 * into the regular wizard with a toast that names the reason — the draft
 * already carries app and version at that point, so nothing is retyped.
 */
const handleQuickDeploy = async (app: any) => {
  const id = app.appId || app.id || app._id
  if (!id || quickDeployBusyId.value) return

  quickDeployBusyId.value = id
  try {
    const outcome = await deploymentStore.prepareQuickDeploy(id, app.name)
    if (outcome.ready) {
      toast.success(t('deployment.quickDeploy.ready', { name: app.name }))
      router.push({ name: 'deployment.summary' })
      return
    }
    if (outcome.reason === 'noVersion') {
      toast.warning(t('deployment.quickDeploy.noVersion'))
      router.push({ name: 'apps.detail', params: { id } })
      return
    }
    toast.info(t(`deployment.quickDeploy.${outcome.reason}`))
    router.push({ name: 'deployment.config' })
  } catch {
    toast.error(t('deployment.quickDeploy.error'))
  } finally {
    quickDeployBusyId.value = null
  }
}

onMounted(() => {
  fetchApps()
})
</script>

<template>
  <div class="p-6">
    <PageHeader :title="$t('AppsView.title')" :subtitle="$t('AppsView.subtitle')">
      <template #actions>
        <!-- Admin-only visibility filter -->
        <div v-if="authStore.isAdmin" class="flex items-center bg-surface-input rounded-lg p-1 gap-1 text-sm">
          <button
            @click="visibilityFilter = 'all'"
            class="px-3 py-1.5 rounded-md font-medium transition-colors"
            :class="visibilityFilter === 'all' ? 'bg-surface-card text-content-primary shadow-sm' : 'text-content-secondary hover:text-content-primary'"
          >
            {{ $t('AppsView.filterAll') }}
          </button>
          <button
            @click="visibilityFilter = 'public'"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors"
            :class="visibilityFilter === 'public' ? 'bg-surface-card text-content-primary shadow-sm' : 'text-content-secondary hover:text-content-primary'"
          >
            <Globe :size="13" />
            {{ $t('AppsView.filterPublic') }}
          </button>
          <button
            @click="visibilityFilter = 'private'"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors"
            :class="visibilityFilter === 'private' ? 'bg-surface-card text-content-primary shadow-sm' : 'text-content-secondary hover:text-content-primary'"
          >
            <Lock :size="13" />
            {{ $t('AppsView.filterPrivate') }}
          </button>
        </div>

        <RouterLink :to="{ name: 'apps.create' }">
          <BaseButton class="flex items-center gap-2">
            <Plus :size="16" />
            {{ $t('AppsView.addApp') }}
          </BaseButton>
        </RouterLink>
      </template>
    </PageHeader>

    <EntityListState
      :is-loading="isLoading && apps.length === 0"
      :is-empty="!isLoading && filteredApps.length === 0"
      :icon="Inbox"
      :empty-message="visibilityFilter === 'private' ? $t('AppsView.noPrivateApps') : visibilityFilter === 'public' ? $t('AppsView.noPublicApps') : $t('AppsView.noAppsDesc')"
      :loading-message="$t('AppsView.loading')"
    >
      <template #empty-action>
        <RouterLink v-if="visibilityFilter === 'all'" :to="{ name: 'apps.create' }">
          <BaseButton class="flex items-center gap-2">
            <Plus :size="16" />
            {{ $t('AppsView.addApp') }}
          </BaseButton>
        </RouterLink>
      </template>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card
          v-for="app in filteredApps"
          :key="app.appId || app.id"
          class="flex flex-col group h-full relative cursor-pointer hover:border-primary/30"
          @click="handleDeploy(app)"
        >
          <div v-if="badgeStatusForApp(app)" class="absolute top-3 right-3">
            <AppVersionStatusBadge :status="badgeStatusForApp(app)!" />
          </div>

          <div class="flex items-center gap-4 mb-4">
            <div class="bg-surface-input p-3 rounded-lg text-content-secondary group-hover:text-primary transition-colors flex items-center justify-center w-[56px] h-[56px] flex-shrink-0 border border-card-border">
              <img v-if="app.image" :src="app.image" :alt="app.name" class="w-full h-full object-contain" />
              <component v-else :is="getIconForApp(app)" :size="32" />
            </div>
            <h3 class="font-bold text-xl text-content-primary leading-tight pr-16">{{ app.name }}</h3>
          </div>

          <div :lang="locale" class="text-sm mb-6 flex-grow text-left break-words hyphens-auto">
            <MarkdownRenderer
              v-if="app.description && app.description.trim()"
              :source="app.description"
              variant="compact"
              :clamp="3"
              :expandable="true"
            />
            <p v-else class="text-content-secondary leading-relaxed">
              {{ $t('AppsView.noDescription') }}
            </p>
          </div>

          <div class="mt-auto flex flex-col gap-2">
            <BaseButton
              variant="yellow"
              class="w-full flex items-center justify-center gap-2"
              data-testid="app-quick-deploy"
              :disabled="isMissingCredential || quickDeployBusyId === (app.appId || app.id || app._id)"
              :title="isMissingCredential ? $t('deployment.quickDeploy.missingCreds') : ''"
              @click.stop="handleQuickDeploy(app)"
            >
              <Zap :size="16" aria-hidden="true" />
              {{ $t('deployment.quickDeploy.button') }}
            </BaseButton>
            <BaseButton
              variant="green"
              class="w-full flex items-center justify-center gap-2"
              @click.stop="handleDeploy(app)"
            >
              {{ $t('AppsView.detailsDeploy') }}
            </BaseButton>
          </div>
        </Card>
      </div>
    </EntityListState>
  </div>
</template>

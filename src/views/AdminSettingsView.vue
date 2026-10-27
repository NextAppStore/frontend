<script setup lang="ts">
/**
 * Admin-only global platform settings.
 *
 * Two sections:
 *   * Default network (below) — stored via the backend.
 *   * Appearance — ``AccentColorSettings``; the accent itself is configured
 *     via the ``VITE_ACCENT_COLOR`` env, so that section is preview-only.
 *
 * Default network: the default OpenStack network used as a
 * fallback for any ``@openstack:network``-marked deploy variable a user
 * leaves empty (backend: ``_apply_default_network`` in
 * ``deployments.py``). The picker always runs in ``osMode="id"`` so the
 * admin resolves a concrete network from the list; the display name is
 * read back via the shared display cache the picker itself primes, and
 * the separate id/name toggle below only controls which shape
 * (``mode``) gets handed to deploys that declare the variable in name
 * mode instead of id mode.
 */
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Network, Settings as SettingsIcon } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import Card from '@/components/ui/Card.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import OpenStackResourcePicker from '@/components/OpenStackResourcePicker.vue'
import AccentColorSettings from '@/components/AccentColorSettings.vue'
import { useAdminSettingsStore } from '@/stores/admin-settings.store'
import { useToast } from '@/composables/useToast'
import { extractErrorMessage } from '@/utils/http-error'
import { formatDateTime } from '@/utils/format'
import { getDisplayName } from '@/composables/useOpenStackResourceCache'

const { t } = useI18n()
const toast = useToast()
const store = useAdminSettingsStore()

const selectedId = ref<string>('')
const mode = ref<'id' | 'name'>('id')
const isSaving = ref(false)

onMounted(async () => {
  await store.fetchDefaultNetwork()
  const current = store.defaultNetwork
  if (current?.configured) {
    selectedId.value = current.id || ''
    mode.value = current.mode || 'id'
  }
})

const resolvedName = computed(() => {
  if (!selectedId.value) return ''
  return getDisplayName('network', 'id', selectedId.value)?.name || ''
})

const lastUpdated = computed(() => formatDateTime(store.defaultNetwork?.updated_at))

const canSave = computed(() => !!selectedId.value && !!resolvedName.value)

const handleSave = async () => {
  if (!canSave.value) {
    toast.error(t('AdminSettingsView.errors.missingSelection'))
    return
  }
  isSaving.value = true
  try {
    await store.saveDefaultNetwork({
      id: selectedId.value,
      name: resolvedName.value,
      mode: mode.value,
    })
    toast.success(t('AdminSettingsView.toasts.saveSuccess'))
  } catch (err) {
    toast.error(extractErrorMessage(err))
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <div class="p-6 max-w-3xl mx-auto">
    <PageHeader :title="t('AdminSettingsView.title')" :subtitle="t('AdminSettingsView.subtitle')" />

    <!-- Status card -->
    <Card class="mb-6">
      <div v-if="store.isLoading && !store.defaultNetwork" class="text-content-secondary text-sm">
        {{ t('AdminSettingsView.status.loading') }}
      </div>
      <div v-else-if="!store.defaultNetwork?.configured" class="flex items-center gap-3">
        <SettingsIcon class="text-content-disabled" :size="22" aria-hidden="true" />
        <div>
          <div class="font-medium text-content-primary">{{ t('AdminSettingsView.status.noneTitle') }}</div>
          <div class="text-sm text-content-secondary">{{ t('AdminSettingsView.status.noneHint') }}</div>
        </div>
      </div>
      <div v-else class="flex items-center gap-3">
        <Network class="text-status-success" :size="22" aria-hidden="true" />
        <div>
          <div class="font-medium text-content-primary">
            {{ t('AdminSettingsView.status.configured', { name: store.defaultNetwork.name }) }}
          </div>
          <div class="text-sm text-content-secondary">
            {{ t('AdminSettingsView.status.mode', { mode: store.defaultNetwork.mode }) }}
            <span v-if="store.defaultNetwork.updated_at">
              · {{ t('AdminSettingsView.status.lastUpdated', { time: lastUpdated }) }}
            </span>
          </div>
        </div>
      </div>
    </Card>

    <!-- Form -->
    <Card>
      <div class="space-y-5">
        <div>
          <label class="block text-sm font-medium text-content-primary mb-1.5">
            {{ t('AdminSettingsView.fields.networkLabel') }}
          </label>
          <p class="text-xs text-content-secondary mb-2">
            {{ t('AdminSettingsView.fields.networkHint') }}
          </p>
          <OpenStackResourcePicker
            v-model="selectedId"
            os-type="network"
            os-mode="id"
            :multi="false"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-content-primary mb-1.5">
            {{ t('AdminSettingsView.fields.modeLabel') }}
          </label>
          <p class="text-xs text-content-secondary mb-2">
            {{ t('AdminSettingsView.fields.modeHint') }}
          </p>
          <div class="flex gap-2">
            <button
              type="button"
              class="px-3 py-1.5 rounded-lg border-2 text-sm font-medium transition"
              :class="mode === 'id'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-content-secondary hover:border-primary/50'"
              @click="mode = 'id'"
            >
              {{ t('AdminSettingsView.fields.modeId') }}
            </button>
            <button
              type="button"
              class="px-3 py-1.5 rounded-lg border-2 text-sm font-medium transition"
              :class="mode === 'name'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-content-secondary hover:border-primary/50'"
              @click="mode = 'name'"
            >
              {{ t('AdminSettingsView.fields.modeName') }}
            </button>
          </div>
        </div>

        <div class="flex justify-end">
          <BaseButton data-testid="admin-settings-save" :disabled="!canSave || isSaving" @click="handleSave">
            {{ isSaving ? t('AdminSettingsView.saving') : t('AdminSettingsView.save') }}
          </BaseButton>
        </div>
      </div>
    </Card>

    <AccentColorSettings class="mt-10" />
  </div>
</template>

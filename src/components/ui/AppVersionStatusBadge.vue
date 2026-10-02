<script setup lang="ts">
import { computed } from 'vue'
import { Globe, Clock, XCircle, MinusCircle, Lock } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import type { AppVersionBadgeStatus } from '@/types'

const props = defineProps<{ status: AppVersionBadgeStatus }>()
const { t } = useI18n()

const config = computed(() => {
  switch (props.status) {
    case 'new':
      return { icon: MinusCircle, label: t('AppVersionStatusBadge.new'), classes: 'bg-surface-input text-content-secondary border-border' }
    case 'pending':
      return { icon: Clock, label: t('AppVersionStatusBadge.pending'), classes: 'bg-status-warningLight text-status-warning border-status-warning/30' }
    case 'approved':
    case 'published':
      return { icon: Globe, label: t('AppVersionStatusBadge.published'), classes: 'bg-status-successLight text-status-success border-status-success/30' }
    case 'rejected':
      return { icon: XCircle, label: t('AppVersionStatusBadge.rejected'), classes: 'bg-status-errorLight text-status-error border-status-error/30' }
    case 'private':
      return { icon: Lock, label: t('AppVersionStatusBadge.private'), classes: 'bg-tag-accentLight text-tag-accent border-tag-accentBorder' }
    default:
      return { icon: MinusCircle, label: '-', classes: 'bg-surface-input text-content-disabled border-border' }
  }
})
</script>

<template>
  <span
    class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border"
    :class="config.classes"
  >
    <component :is="config.icon" :size="11" />
    {{ config.label }}
  </span>
</template>

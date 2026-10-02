<script setup lang="ts">
import { computed } from 'vue'
import { AlertTriangle, AlertCircle, Lock } from 'lucide-vue-next'

type Variant = 'warning' | 'error' | 'lock'

const props = withDefaults(defineProps<{
  variant?: Variant
  title?: string
  message?: string
  cta?: string
  ctaTo?: string
  next?: string
}>(), {
  variant: 'warning',
})

const styles = computed(() => {
  switch (props.variant) {
    case 'error':
      return {
        wrapper: 'bg-status-errorLight border-status-error/30 text-content-primary',
        iconBox: 'bg-status-error/20 text-status-error',
        title: 'text-content-primary',
        message: 'text-content-secondary',
        cta: 'bg-status-error hover:bg-primary-dark text-content-inverse',
        icon: AlertCircle,
      }
    case 'lock':
      return {
        wrapper: 'bg-tag-infoLight border-tag-infoBorder text-content-primary',
        iconBox: 'bg-tag-info/20 text-tag-info',
        title: 'text-content-primary',
        message: 'text-content-secondary',
        cta: 'bg-tag-info hover:opacity-90 text-content-inverse',
        icon: Lock,
      }
    case 'warning':
    default:
      return {
        wrapper: 'bg-status-warningLight border-status-warning/30 text-content-primary',
        iconBox: 'bg-status-warning/20 text-status-warning',
        title: 'text-content-primary',
        message: 'text-content-secondary',
        cta: 'bg-status-warning hover:opacity-90 text-content-inverse',
        icon: AlertTriangle,
      }
  }
})

const ctaLocation = computed(() => {
  if (!props.ctaTo) return null
  if (props.next) {
    return { path: props.ctaTo, query: { next: props.next } }
  }
  return props.ctaTo
})
</script>

<template>
  <div
    class="rounded-xl border p-4 flex items-start gap-4"
    :class="styles.wrapper"
  >
    <div
      class="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
      :class="styles.iconBox"
    >
      <component :is="styles.icon" :size="20" />
    </div>
    <div class="flex-1 min-w-0">
      <p v-if="title" class="font-semibold" :class="styles.title">{{ title }}</p>
      <p v-if="message" class="text-sm mt-0.5" :class="styles.message">{{ message }}</p>
    </div>
    <router-link
      v-if="cta && ctaLocation"
      :to="ctaLocation"
      class="shrink-0 px-4 py-2 rounded-md text-sm font-semibold transition-colors"
      :class="styles.cta"
    >
      {{ cta }}
    </router-link>
  </div>
</template>

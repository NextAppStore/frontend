<script setup lang="ts">
defineProps<{
  variant?: 'green' | 'red' | 'gray' | 'blue' | 'purple' | 'yellow'
}>()
</script>

<template>
  <span
    :class="[
      'inline-flex items-center px-3 py-1 rounded-full text-xs font-medium',
      variant === 'green'
        ? 'bg-status-successLight text-status-success'
        : variant === 'red'
        ? 'bg-status-errorLight text-status-error'
        : variant === 'blue'
        ? 'bg-tag-infoLight text-tag-info'
        : variant === 'purple'
        ? 'bg-tag-accentLight text-tag-accent'
        : variant === 'yellow'
        ? 'bg-tag-warningLight text-tag-warning'
        : 'bg-surface-input text-content-secondary'
    ]"
  >
    <slot />
  </span>
</template>

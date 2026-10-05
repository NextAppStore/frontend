<script setup lang="ts">
import { ArrowLeft, User } from 'lucide-vue-next'
</script>

<template>
  <div class="min-h-screen bg-surface-page flex flex-col">

    <!-- Header -->
    <header
      class="h-16 flex items-center justify-between px-8 flex-shrink-0 relative header-border"
      style="background: var(--color-surface-header);"
    >
      <div class="flex items-center gap-4">
        <RouterLink
          to="/dashboard"
          class="flex items-center gap-2 text-sm transition-colors"
          style="color: var(--color-nav-text);"
        >
          <ArrowLeft :size="20" />
          {{ $t('action.back') }}
        </RouterLink>

        <span class="font-semibold tracking-wide" style="color: var(--color-nav-text-hover);">
          {{ $t('user.title') }}
        </span>
      </div>

      <User :size="20" style="color: var(--color-nav-text);" />
    </header>

    <!-- Content -->
    <main class="flex-1 p-10 flex justify-center">
      <div class="w-full max-w-3xl">
        <slot />
      </div>
    </main>

  </div>
</template>

<style scoped>
.header-border::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 2px;
  background: var(--color-header-border);
}
</style>

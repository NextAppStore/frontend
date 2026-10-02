<script setup lang="ts">
import { ArrowLeft, User } from 'lucide-vue-next'
import { computed } from 'vue'
import { useColorScheme } from '@/composables/useColorScheme'

const { scheme } = useColorScheme()

const isDark = computed(() => {
  void scheme.value
  return document.documentElement.classList.contains('dark')
})

const headerStyle = computed(() => isDark.value
  ? { background: 'linear-gradient(90deg, #0D1520 0%, #0A1018 60%, #080E16 100%)' }
  : { background: 'var(--color-primary)' }
)
</script>

<template>
  <div class="min-h-screen bg-surface-page flex flex-col">

    <!-- Header -->
    <header
      class="h-16 text-white flex items-center justify-between px-8 border-b border-white/10"
      :style="headerStyle"
    >
      <div class="flex items-center gap-4">
        <RouterLink
          to="/dashboard"
          class="hover:text-white/80 transition flex items-center gap-2"
        >
          <ArrowLeft :size="20" />
          {{ $t('action.back') }}
        </RouterLink>

        <span class="font-semibold tracking-wide">
          {{ $t('user.title') }}
        </span>
      </div>

      <User :size="20" class="opacity-80" />
    </header>

    <!-- Content -->
    <main class="flex-1 p-10 flex justify-center">
      <div class="w-full max-w-3xl">
        <slot />
      </div>
    </main>

  </div>
</template>

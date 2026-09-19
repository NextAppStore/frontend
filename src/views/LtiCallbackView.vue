<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth.store'
import { useLtiSession } from '@/composables/useLtiSession'
import { Loader2 } from 'lucide-vue-next'

const router = useRouter()
const authStore = useAuthStore()
const ltiSession = useLtiSession()
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    const gotToken = ltiSession.consumeTokenFromUrlFragment()
    if (!gotToken) {
      throw new Error('No LTI session token found in the launch redirect')
    }

    await authStore.fetchMe()
    router.push('/dashboard')
  } catch (err: any) {
    console.error('LTI callback error:', err)
    error.value = err.message || 'Authentication failed'

    setTimeout(() => {
      router.push('/login')
    }, 3000)
  }
})
</script>

<template>
  <div class="flex flex-col items-center justify-center min-h-screen">
    <div class="text-center">
      <div v-if="!error" class="flex flex-col items-center gap-4">
        <Loader2 class="animate-spin text-primary" :size="48" />
        <p class="text-gray-600">Completing authentication...</p>
      </div>

      <div v-else class="flex flex-col items-center gap-4">
        <div class="text-red-500">
          <p class="font-semibold">Authentication Error</p>
          <p class="text-sm mt-2">{{ error }}</p>
        </div>
        <p class="text-sm text-gray-600">Redirecting to login...</p>
      </div>
    </div>
  </div>
</template>

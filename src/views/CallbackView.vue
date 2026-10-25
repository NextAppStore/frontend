<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth.store'
import { Loader2 } from 'lucide-vue-next'

const { t } = useI18n()
const router = useRouter()
const authStore = useAuthStore()
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    // Handle OAuth callback
    const returnUrl = await authStore.handleCallback()
    
    // Redirect to original destination or dashboard
    router.push(returnUrl || '/dashboard')
  } catch (err: any) {
    console.error('Callback error:', err)
    error.value = err.message || t('CallbackView.failed')
    
    // Redirect to login after short delay
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
        <p class="text-content-secondary">{{ t('CallbackView.completing') }}</p>
      </div>

      <div v-else class="flex flex-col items-center gap-4">
        <div class="text-status-error">
          <p class="font-semibold">{{ t('CallbackView.errorTitle') }}</p>
          <p class="text-sm mt-2">{{ error }}</p>
        </div>
        <p class="text-sm text-content-secondary">{{ t('CallbackView.redirecting') }}</p>
      </div>
    </div>
  </div>
</template>

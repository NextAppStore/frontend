<script setup lang="ts">
import { User, Mail, Shield, Calendar, Cloud, ChevronRight, BookOpen, Contact, Key, Sun, Moon, MonitorSmartphone } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth.store'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { roleLabelKey, roleBadgeVariant as roleBadgeVariantFor } from '@/i18n/role-labels'
import Badge from '@/components/ui/Badge.vue'
import Card from '@/components/ui/Card.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import { useColorScheme, type ColorScheme } from '@/composables/useColorScheme'

const authStore = useAuthStore()
const { t } = useI18n()
const { scheme, setScheme } = useColorScheme()

type SchemeOption = { value: ColorScheme; labelKey: string; hintKey: string; icon: unknown }
const schemeOptions: SchemeOption[] = [
  { value: 'auto',  labelKey: 'UserView.appearance.auto',  hintKey: 'UserView.appearance.autoHint',  icon: MonitorSmartphone },
  { value: 'light', labelKey: 'UserView.appearance.light', hintKey: 'UserView.appearance.lightHint', icon: Sun },
  { value: 'dark',  labelKey: 'UserView.appearance.dark',  hintKey: 'UserView.appearance.darkHint',  icon: Moon },
]

// Cast to ``any`` so fields like firstName/course are accessible without the strict user type.
const user = computed(() => authStore.user as any)

// Central role-label helpers: one source for variant + translation across views.
const roleBadgeVariant = computed(() => roleBadgeVariantFor(user.value?.role))
const roleLabel = computed(() => t(roleLabelKey(user.value?.role)))

const createdDate = computed(() => {
  if (!user.value?.created_at) return 'N/A'
  return new Date(user.value.created_at).toLocaleDateString('de-DE', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
})

</script>

<template>
  <div class="p-6">

    <PageHeader :title="t('UserView.title')" :subtitle="t('UserView.subtitle')" />

    <div v-if="!user" class="text-center py-12">
      <p class="text-content-secondary">{{ t('UserView.loading') }}</p>
    </div>

    <div v-else class="space-y-6">
      <Card class="flex items-center justify-between">
        <div class="flex items-center gap-4">
          <div
              class="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center"
          >
            <User :size="32" class="text-primary" />
          </div>

          <div>
            <div class="font-semibold text-content-primary text-lg">
              {{ user.username || 'N/A' }}
            </div>
            <Badge :variant="roleBadgeVariant">{{ roleLabel }}</Badge>
          </div>
        </div>
      </Card>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

        <Card class="flex items-center justify-between">
          <div>
            <div class="text-sm text-content-secondary mb-1">{{ t('UserView.fields.firstName') }}</div>
            <div class="font-medium" :class="user.firstName ? 'text-content-primary' : 'text-content-disabled'">
              {{ user.firstName || 'N/A' }}
            </div>
          </div>
          <Contact :size="20" class="text-primary" />
        </Card>

        <Card class="flex items-center justify-between">
          <div>
            <div class="text-sm text-content-secondary mb-1">{{ t('UserView.fields.lastName') }}</div>
            <div class="font-medium" :class="user.lastName ? 'text-content-primary' : 'text-content-disabled'">
              {{ user.lastName || 'N/A' }}
            </div>
          </div>
          <Contact :size="20" class="text-primary" />
        </Card>

        <Card class="flex items-center justify-between">
          <div>
            <div class="text-sm text-content-secondary mb-1">{{ t('UserView.fields.email') }}</div>
            <div class="font-medium" :class="user.email ? 'text-content-primary' : 'text-content-disabled'">
              {{ user.email || 'N/A' }}
            </div>
          </div>
          <Mail :size="20" class="text-primary" />
        </Card>

        <Card class="flex items-center justify-between">
          <div>
            <div class="text-sm text-content-secondary mb-1">{{ t('UserView.fields.course') }}</div>
            <div class="font-medium" :class="user.course?.name ? 'text-content-primary' : 'text-content-disabled'">
              {{ user.course?.name || 'N/A' }}
            </div>
          </div>
          <BookOpen :size="20" class="text-primary" />
        </Card>

        <Card class="flex items-center justify-between">
          <div>
            <div class="text-sm text-content-secondary mb-1">{{ t('UserView.fields.role') }}</div>
            <div class="font-medium text-content-primary">{{ roleLabel }}</div>
          </div>
          <Shield :size="20" class="text-primary" />
        </Card>

        <Card class="flex items-center justify-between">
          <div>
            <div class="text-sm text-content-secondary mb-1">{{ t('UserView.fields.userId') }}</div>
            <div class="font-mono text-xs" :class="user.userId ? 'text-content-primary' : 'text-content-disabled'">
              {{ user.userId || 'N/A' }}
            </div>
          </div>
          <User :size="20" class="text-primary" />
        </Card>

        <Card class="flex items-center justify-between">
          <div>
            <div class="text-sm text-content-secondary mb-1">{{ t('UserView.fields.registeredAt') }}</div>
            <div class="font-medium text-content-primary">{{ createdDate }}</div>
          </div>
          <Calendar :size="20" class="text-primary" />
        </Card>

        <Card class="flex items-center justify-between">
          <div>
            <div class="text-sm text-content-secondary mb-1">{{ t('UserView.fields.keycloakId') }}</div>
            <div class="font-mono text-xs" :class="user.keycloak_id ? 'text-content-primary' : 'text-content-disabled'">
              {{ user.keycloak_id || 'N/A' }}
            </div>
          </div>
          <Key :size="20" class="text-primary" />
        </Card>

      </div>

      <!-- Settings — list layout rather than a card grid; same border/padding
           style as the cards above. -->
      <div class="bg-surface-card rounded-2xl shadow-md border border-card-border overflow-hidden">
        <div class="px-6 py-4 border-b border-card-border">
          <h2 class="text-lg font-semibold text-content-primary">{{ t('UserView.settings.title') }}</h2>
        </div>
        <router-link
          to="/user/openstack"
          class="flex items-center justify-between px-6 py-4 hover:bg-surface-hover transition-colors"
        >
          <div class="flex items-center gap-4">
            <div class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Cloud :size="20" class="text-primary" />
            </div>
            <div>
              <div class="font-medium text-content-primary">{{ t('UserView.settings.openstackTitle') }}</div>
              <div class="text-sm text-content-secondary">
                {{ t('UserView.settings.openstackHint') }}
              </div>
            </div>
          </div>
          <ChevronRight :size="18" class="text-content-secondary" />
        </router-link>
      </div>

      <!-- Appearance -->
      <div class="bg-surface-card rounded-2xl shadow-md border border-card-border overflow-hidden">
        <div class="px-6 py-4 border-b border-card-border">
          <h2 class="text-lg font-semibold text-content-primary">{{ t('UserView.appearance.title') }}</h2>
          <p class="text-sm text-content-secondary mt-0.5">{{ t('UserView.appearance.hint') }}</p>
        </div>
        <div class="px-6 py-4 flex gap-3">
          <button
            v-for="opt in schemeOptions"
            :key="opt.value"
            @click="setScheme(opt.value)"
            :class="[
              'flex-1 flex flex-col items-center gap-2 px-3 py-4 rounded-xl border-2 transition-all text-center',
              scheme === opt.value
                ? 'border-primary bg-primary/5 text-primary'
                : 'border-border text-content-secondary hover:border-border-strong hover:bg-surface-hover'
            ]"
          >
            <component :is="opt.icon" :size="22" />
            <span class="text-sm font-medium">{{ t(opt.labelKey) }}</span>
            <span class="text-xs opacity-70">{{ t(opt.hintKey) }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
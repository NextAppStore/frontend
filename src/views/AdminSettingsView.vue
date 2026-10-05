<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Palette } from 'lucide-vue-next'
import PageHeader from '@/components/ui/PageHeader.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useToast } from '@/composables/useToast'
import { applyAccentColor } from '@/composables/useAccentColor'

const { t } = useI18n()
const toast = useToast()

const PRESETS = [
  { label: 'ScholarStack Red', value: '#E10210' },
  { label: 'DHBW Red',         value: '#E2001A' },
  { label: 'Blue',             value: '#0052CC' },
  { label: 'Green',            value: '#0A7C3E' },
  { label: 'Purple',           value: '#5B21B6' },
  { label: 'Orange',           value: '#C2410C' },
]

const current = getComputedStyle(document.documentElement)
  .getPropertyValue('--color-primary').trim() || '#E10210'

const selected = ref(current)
const custom = ref(current)

function pick(hex: string) {
  selected.value = hex
  custom.value = hex
}

function onCustomInput(e: Event) {
  const val = (e.target as HTMLInputElement).value
  custom.value = val
  selected.value = val
}

function apply() {
  // TODO: persist to backend tenant-settings endpoint once available.
  applyAccentColor(selected.value)
  toast.success(t('AdminSettingsView.applySuccess'))
}
</script>

<template>
  <div class="p-6 max-w-2xl">
    <PageHeader
      :title="t('AdminSettingsView.title')"
      :subtitle="t('AdminSettingsView.subtitle')"
    />

    <div class="mt-6 bg-surface-card border border-card-border rounded-xl p-6 space-y-6">
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 rounded-lg flex items-center justify-center" :style="{ background: selected }">
          <Palette :size="18" class="text-white" />
        </div>
        <div>
          <p class="text-sm font-semibold text-content-primary">{{ t('AdminSettingsView.accentLabel') }}</p>
          <p class="text-xs text-content-secondary">{{ t('AdminSettingsView.accentHint') }}</p>
        </div>
      </div>

      <!-- Presets -->
      <div class="flex flex-wrap gap-3">
        <button
          v-for="p in PRESETS"
          :key="p.value"
          @click="pick(p.value)"
          :title="p.label"
          class="w-8 h-8 rounded-full border-2 transition-all"
          :style="{ background: p.value, borderColor: selected === p.value ? p.value : 'transparent' }"
          :class="selected === p.value ? 'ring-2 ring-offset-2 ring-offset-surface-card' : 'opacity-70 hover:opacity-100'"
        />
      </div>

      <!-- Custom color picker -->
      <div class="flex items-center gap-3">
        <input
          type="color"
          :value="custom"
          @input="onCustomInput"
          class="w-10 h-10 rounded cursor-pointer border border-border bg-transparent p-0.5"
        />
        <span class="text-sm font-mono text-content-secondary">{{ selected }}</span>
      </div>

      <!-- Preview swatch -->
      <div class="flex gap-3 items-center">
        <div class="h-9 px-4 rounded-lg flex items-center text-sm font-medium text-white" :style="{ background: selected }">
          {{ t('AdminSettingsView.previewBtn') }}
        </div>
        <div class="h-9 px-4 rounded-lg flex items-center text-sm font-medium border" :style="{ color: selected, borderColor: selected }">
          {{ t('AdminSettingsView.previewGhost') }}
        </div>
        <div class="w-4 h-4 rounded-full" :style="{ background: selected }" />
      </div>

      <div class="pt-2 border-t border-card-border">
        <BaseButton variant="primary" @click="apply">
          {{ t('AdminSettingsView.applyBtn') }}
        </BaseButton>
        <p class="mt-2 text-xs text-content-secondary">{{ t('AdminSettingsView.persistNote') }}</p>
      </div>
    </div>
  </div>
</template>

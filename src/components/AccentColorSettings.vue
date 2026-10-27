<script setup lang="ts">
/**
 * "Appearance" section of the admin settings page — accent color preview.
 *
 * The accent is configured per deployment via ``VITE_ACCENT_COLOR`` (see
 * ``useAccentColor``), so there is nothing to save here: an admin picks any
 * color (wheel, hex field or preset), tries it live and copies the matching
 * env line. A preview only lasts until reload; "Reset" returns to the
 * configured color.
 */
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Palette, Copy, Info } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import Card from '@/components/ui/Card.vue'
import ColorWheel from '@/components/ColorWheel.vue'
import { useToast } from '@/composables/useToast'
import { applyAccentColor, resolveAccentColor } from '@/composables/useAccentColor'
import { env } from '@/env'
import { hexToRgb } from '@/utils/color'

const { t } = useI18n()
const toast = useToast()

// Names are i18n keys under ``AccentColorSettings.presets``.
const PRESETS = [
  { key: 'scholarstack', value: '#E10210' },
  { key: 'dhbw',         value: '#E2001A' },
  { key: 'pink',         value: '#BE185D' },
  { key: 'orange',       value: '#C2410C' },
  { key: 'green',        value: '#0A7C3E' },
  { key: 'teal',         value: '#0F766E' },
  { key: 'blue',         value: '#0052CC' },
  { key: 'purple',       value: '#5B21B6' },
  { key: 'slate',        value: '#334155' },
]

const configured = resolveAccentColor(env.ACCENT_COLOR)

const selected = ref(configured)

// Free-text hex field: only valid values reach ``selected``.
const hexInput = ref(configured)
const hexInvalid = computed(() => hexToRgb(hexInput.value) === null)
watch(selected, (hex) => { hexInput.value = hex })

function onHexInput() {
  if (!hexInvalid.value) selected.value = resolveAccentColor(hexInput.value)
}

// Quoted on purpose: an unquoted ``#`` starts a comment in .env files and
// YAML, which would silently leave the variable empty.
const envLine = computed(() => `VITE_ACCENT_COLOR="${selected.value}"`)

function preview() {
  applyAccentColor(selected.value)
  toast.success(t('AccentColorSettings.applySuccess'))
}

function reset() {
  selected.value = configured
  applyAccentColor(configured)
}

async function copyEnvLine() {
  try {
    await navigator.clipboard.writeText(envLine.value)
    toast.success(t('AccentColorSettings.copySuccess'))
  } catch {
    toast.error(t('AccentColorSettings.copyError'))
  }
}
</script>

<template>
  <section data-testid="accent-color-settings">
    <h2 class="text-lg font-semibold text-content-primary mb-3">{{ t('AccentColorSettings.title') }}</h2>

    <!-- How to make it permanent — first thing in the section, because the
         picker below is only a preview and nothing here is saved. -->
    <div
      data-testid="accent-persist-note"
      class="mb-6 flex items-start gap-3 rounded-xl border-2 border-primary/60 bg-primary/10 p-5 shadow-sm"
    >
      <Info :size="22" class="mt-0.5 flex-shrink-0 text-primary" aria-hidden="true" />
      <div class="flex-1 min-w-0 space-y-3">
        <p class="text-sm font-semibold text-content-primary">{{ t('AccentColorSettings.persistNote') }}</p>
        <div class="flex items-center gap-2">
          <code
            data-testid="accent-env-line"
            class="flex-1 min-w-0 px-3 py-2 rounded-lg bg-surface-card border border-primary/40 text-sm font-mono text-content-primary break-all"
          >{{ envLine }}</code>
          <BaseButton variant="ghost" data-testid="accent-copy" :title="t('AccentColorSettings.copyBtn')" @click="copyEnvLine">
            <Copy :size="16" />
          </BaseButton>
        </div>
        <p class="text-xs text-content-secondary">{{ t('AccentColorSettings.configuredLabel', { color: configured }) }}</p>
      </div>
    </div>

    <Card>
      <div class="space-y-6">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-lg flex items-center justify-center" :style="{ background: selected }">
            <Palette :size="18" class="text-content-onColor" />
          </div>
          <div>
            <p class="text-sm font-semibold text-content-primary">{{ t('AccentColorSettings.accentLabel') }}</p>
            <p class="text-xs text-content-secondary">{{ t('AccentColorSettings.accentHint') }}</p>
          </div>
        </div>

        <div class="flex flex-col sm:flex-row gap-8 items-center sm:items-start">
          <ColorWheel
            v-model="selected"
            :label="t('AccentColorSettings.wheelLabel')"
            :brightness-label="t('AccentColorSettings.brightnessLabel')"
          />

          <div class="flex-1 w-full space-y-5">
            <!-- Exact value -->
            <div>
              <label for="accent-hex" class="block text-xs font-medium text-content-secondary mb-1">
                {{ t('AccentColorSettings.hexLabel') }}
              </label>
              <input
                id="accent-hex"
                v-model="hexInput"
                data-testid="accent-hex"
                maxlength="7"
                spellcheck="false"
                class="w-36 px-3 py-2 rounded-lg bg-surface-input border text-sm font-mono text-content-primary focus:outline-none focus:ring-2 focus:ring-primary/60"
                :class="hexInvalid ? 'border-status-error' : 'border-border'"
                :aria-invalid="hexInvalid"
                @input="onHexInput"
              />
              <p v-if="hexInvalid" class="mt-1 text-xs text-status-error">{{ t('AccentColorSettings.hexInvalid') }}</p>
            </div>

            <!-- Presets -->
            <div>
              <p class="text-xs font-medium text-content-secondary mb-2">{{ t('AccentColorSettings.presetsLabel') }}</p>
              <div class="flex flex-wrap gap-3">
                <button
                  v-for="p in PRESETS"
                  :key="p.value"
                  type="button"
                  @click="selected = p.value"
                  :title="t(`AccentColorSettings.presets.${p.key}`)"
                  :aria-label="t(`AccentColorSettings.presets.${p.key}`)"
                  :data-testid="`accent-preset-${p.key}`"
                  class="w-8 h-8 rounded-full border-2 transition-all"
                  :style="{ background: p.value, borderColor: selected === p.value ? p.value : 'transparent' }"
                  :class="selected === p.value ? 'ring-2 ring-offset-2 ring-offset-surface-card' : 'opacity-70 hover:opacity-100'"
                />
              </div>
            </div>

            <!-- Preview swatch -->
            <div class="flex flex-wrap gap-3 items-center">
              <div class="h-9 px-4 rounded-lg flex items-center text-sm font-medium text-content-onColor" :style="{ background: selected }">
                {{ t('AccentColorSettings.previewBtn') }}
              </div>
              <div class="h-9 px-4 rounded-lg flex items-center text-sm font-medium border" :style="{ color: selected, borderColor: selected }">
                {{ t('AccentColorSettings.previewGhost') }}
              </div>
            </div>
          </div>
        </div>

        <div class="flex flex-wrap gap-3">
          <BaseButton variant="primary" data-testid="accent-preview" @click="preview">
            {{ t('AccentColorSettings.applyBtn') }}
          </BaseButton>
          <BaseButton variant="ghost" data-testid="accent-reset" @click="reset">
            {{ t('AccentColorSettings.resetBtn') }}
          </BaseButton>
        </div>
      </div>
    </Card>
  </section>
</template>

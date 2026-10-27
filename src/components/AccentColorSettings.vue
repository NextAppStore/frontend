<script setup lang="ts">
/**
 * "Appearance" section of the admin settings page — accent color.
 *
 * The accent is configured per deployment via ``VITE_ACCENT_COLOR`` (see
 * ``useAccentColor``), so there is nothing to save here: the admin moves a
 * hue slider, sees the whole app re-coloured live, and copies the matching
 * env line. The preview lasts until reload; "Reset" returns to the
 * configured color, "Default" to the ScholarStack red.
 *
 * A hue slider instead of a free color wheel on purpose: saturation and
 * lightness are fixed (and light hues darkened), so every pick keeps white
 * button text and accent links readable in light and dark mode.
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Copy, Info, Palette } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import Card from '@/components/ui/Card.vue'
import { useToast } from '@/composables/useToast'
import {
  DEFAULT_ACCENT,
  accentFromHue,
  applyAccentColor,
  configuredAccent,
} from '@/composables/useAccentColor'
import { hexToHue } from '@/utils/color'

const { t } = useI18n()
const toast = useToast()

const configured = configuredAccent()
const selected = ref(configured)
const hue = ref(hexToHue(configured))

const isPreviewing = computed(() => selected.value !== configured)

// Quoted on purpose: an unquoted ``#`` starts a comment in .env files and
// YAML, which would silently leave the variable empty.
const envLine = computed(() => `VITE_ACCENT_COLOR="${selected.value}"`)

// The reset / default buttons show the color they lead to, not the preview.
// Overriding ``--color-brand`` on the button would not be enough: the button
// tokens are resolved on ``<html>`` already, so they are set here directly.
// Inline on purpose — the color is only known at runtime.
const buttonColors = (hex: string) => ({
  '--color-btn-primary': hex,
  '--color-btn-primary-hover': `color-mix(in srgb, ${hex} 72%, black)`,
})

function select(hex: string) {
  selected.value = hex
  applyAccentColor(hex)
}

function onHueInput() {
  select(accentFromHue(hue.value))
}

function selectDefault() {
  hue.value = hexToHue(DEFAULT_ACCENT)
  select(DEFAULT_ACCENT)
}

function reset() {
  hue.value = hexToHue(configured)
  select(configured)
}

async function copyEnvLine() {
  try {
    // Modern ``navigator.clipboard`` requires a secure context
    // (https or localhost). Falls back to the legacy
    // ``execCommand('copy')`` so the button still works behind
    // plain http.
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(envLine.value)
    } else {
      const ta = document.createElement('textarea')
      ta.value = envLine.value
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
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
         slider below is only a preview and nothing here is saved. -->
    <div class="mb-6 flex items-start gap-3 rounded-xl border-2 border-primary/60 bg-primary/10 p-5">
      <Info :size="22" class="mt-0.5 flex-shrink-0 text-primary" aria-hidden="true" />
      <div class="flex-1 min-w-0 space-y-3">
        <p class="text-sm font-semibold text-content-primary">{{ t('AccentColorSettings.persistNote') }}</p>
        <div class="flex items-center gap-2">
          <code
            data-testid="accent-env-line"
            class="flex-1 min-w-0 px-3 py-2 rounded-lg bg-surface-card border border-primary/40 text-sm font-mono text-content-primary break-all"
          >{{ envLine }}</code>
          <BaseButton
            variant="ghost"
            size="sm"
            data-testid="btn-accent-copy"
            :title="t('AccentColorSettings.copyBtn')"
            :aria-label="t('AccentColorSettings.copyBtn')"
            @click="copyEnvLine"
          >
            <Copy :size="16" aria-hidden="true" />
          </BaseButton>
        </div>
        <p class="text-xs text-content-secondary">{{ t('AccentColorSettings.configuredLabel', { color: configured }) }}</p>
      </div>
    </div>

    <Card>
      <div class="space-y-6">
        <div class="flex items-center gap-3">
          <!-- Swatch reads the live accent, so it always shows what the app shows. -->
          <div class="w-9 h-9 rounded-lg bg-btn-primary flex items-center justify-center">
            <Palette :size="18" class="text-content-onColor" aria-hidden="true" />
          </div>
          <div>
            <p class="text-sm font-semibold text-content-primary">{{ t('AccentColorSettings.accentLabel') }}</p>
            <p class="text-xs text-content-secondary">{{ t('AccentColorSettings.accentHint') }}</p>
          </div>
        </div>

        <div>
          <label for="accent-hue" class="block text-xs font-medium text-content-secondary mb-2">
            {{ t('AccentColorSettings.sliderLabel') }}
          </label>
          <input
            id="accent-hue"
            v-model.number="hue"
            data-testid="accent-hue"
            type="range"
            min="0"
            max="359"
            step="1"
            :aria-valuetext="selected"
            class="w-full h-3 rounded-full appearance-none cursor-pointer bg-accent-hue focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface-card [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-btn-primary [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-surface-card [&::-webkit-slider-thumb]:shadow-md [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-btn-primary [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-surface-card [&::-moz-range-thumb]:shadow-md"
            @input="onHueInput"
          />
          <p class="mt-2 text-xs font-mono text-content-secondary" data-testid="accent-selected">{{ selected }}</p>
        </div>

        <p v-if="isPreviewing" data-testid="accent-preview-note" class="text-xs text-content-secondary">
          {{ t('AccentColorSettings.previewNote') }}
        </p>

        <div class="flex flex-wrap gap-3">
          <BaseButton data-testid="btn-accent-reset" :style="buttonColors(configured)" :disabled="!isPreviewing" @click="reset">
            {{ t('AccentColorSettings.resetBtn') }}
          </BaseButton>
          <BaseButton data-testid="btn-accent-default" :style="buttonColors(DEFAULT_ACCENT)" :disabled="selected === DEFAULT_ACCENT" @click="selectDefault">
            {{ t('AccentColorSettings.defaultBtn') }}
          </BaseButton>
        </div>
      </div>
    </Card>
  </section>
</template>

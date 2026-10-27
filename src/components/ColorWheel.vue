<script setup lang="ts">
/**
 * Circular HSV color picker (v-model = ``#RRGGBB``).
 *
 *   * angle on the wheel  → hue (0° = red at the top, clockwise)
 *   * distance from center → saturation (white in the middle)
 *   * slider below         → value / brightness
 *
 * Pointer drag and keyboard both work: ←/→ rotate the hue, ↑/↓ change the
 * saturation (Shift = bigger steps). The gradients are inline styles on
 * purpose — a color wheel *is* colors, there is no token for it.
 */
import { computed, ref, watch } from 'vue'
import { hexToHsv, hsvToHex, type Hsv } from '@/utils/color'

const props = defineProps<{
  modelValue: string
  /** Accessible name for the wheel and the slider. */
  label: string
  brightnessLabel: string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const hsv = ref<Hsv>(hexToHsv(props.modelValue) ?? { h: 0, s: 1, v: 1 })

// Keep the hue when the parent sets a grey (s = 0 has no hue of its own).
watch(() => props.modelValue, (hex) => {
  if (hex.toUpperCase() === hsvToHex(hsv.value)) return
  const next = hexToHsv(hex)
  if (next) hsv.value = next.s === 0 ? { ...next, h: hsv.value.h } : next
})

function update(next: Partial<Hsv>) {
  hsv.value = { ...hsv.value, ...next }
  emit('update:modelValue', hsvToHex(hsv.value))
}

const wheel = ref<HTMLElement | null>(null)
let dragging = false

function pickAt(e: PointerEvent) {
  const el = wheel.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const dx = e.clientX - (rect.left + rect.width / 2)
  const dy = e.clientY - (rect.top + rect.height / 2)
  const radius = rect.width / 2
  const hue = (Math.atan2(dx, -dy) * 180) / Math.PI
  update({ h: (hue + 360) % 360, s: Math.min(1, Math.hypot(dx, dy) / radius) })
}

function onPointerDown(e: PointerEvent) {
  dragging = true
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  pickAt(e)
}

function onPointerMove(e: PointerEvent) {
  if (dragging) pickAt(e)
}

function onPointerUp() {
  dragging = false
}

function onKeydown(e: KeyboardEvent) {
  const step = e.shiftKey ? 10 : 2
  const { h, s } = hsv.value
  const moves: Record<string, Partial<Hsv>> = {
    ArrowRight: { h: (h + step + 360) % 360 },
    ArrowLeft:  { h: (h - step + 360) % 360 },
    ArrowUp:    { s: Math.min(1, s + step / 100) },
    ArrowDown:  { s: Math.max(0, s - step / 100) },
  }
  const move = moves[e.key]
  if (!move) return
  e.preventDefault()
  update(move)
}

const markerStyle = computed(() => {
  const rad = (hsv.value.h * Math.PI) / 180
  return {
    left: `${50 + Math.sin(rad) * hsv.value.s * 50}%`,
    top: `${50 - Math.cos(rad) * hsv.value.s * 50}%`,
    background: props.modelValue,
  }
})

const wheelStyle = {
  background:
    'radial-gradient(closest-side, #FFFFFF, transparent), ' +
    'conic-gradient(#FF0000, #FFFF00, #00FF00, #00FFFF, #0000FF, #FF00FF, #FF0000)',
}

// Darkening overlay for the brightness — the wheel itself stays full value.
const shadeStyle = computed(() => ({ background: '#000000', opacity: 1 - hsv.value.v }))

const sliderStyle = computed(() => ({
  background: `linear-gradient(90deg, #000000, ${hsvToHex({ ...hsv.value, v: 1 })})`,
}))
</script>

<template>
  <div class="flex flex-col items-center gap-4 w-56">
    <div
      ref="wheel"
      role="slider"
      tabindex="0"
      :aria-label="label"
      :aria-valuetext="modelValue"
      aria-valuemin="0"
      aria-valuemax="360"
      :aria-valuenow="Math.round(hsv.h)"
      data-testid="color-wheel"
      class="relative w-56 h-56 rounded-full cursor-crosshair touch-none select-none shadow-sm border border-border focus:outline-none focus:ring-2 focus:ring-primary/60 focus:ring-offset-2 focus:ring-offset-surface-card"
      :style="wheelStyle"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @keydown="onKeydown"
    >
      <div class="absolute inset-0 rounded-full pointer-events-none" :style="shadeStyle" />
      <div
        class="absolute w-5 h-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-content-onColor shadow-md pointer-events-none"
        :style="markerStyle"
      />
    </div>

    <input
      type="range"
      min="0"
      max="100"
      :value="Math.round(hsv.v * 100)"
      :aria-label="brightnessLabel"
      data-testid="color-wheel-brightness"
      class="w-full h-3 rounded-full appearance-none cursor-pointer accent-content-primary"
      :style="sliderStyle"
      @input="update({ v: Number(($event.target as HTMLInputElement).value) / 100 })"
    />
  </div>
</template>

/**
 * Accent color of the deployment ("tenant").
 *
 * The accent is configured per deployment via the runtime env variable
 * ``VITE_ACCENT_COLOR`` (``#RRGGBB``, see ``src/env.ts`` / ``env-config.js``),
 * so every user sees the same color and nothing is stored in the backend.
 * The admin page only offers a live preview plus the env line to copy
 * (``AccentColorSettings.vue``).
 *
 * Applying an accent sets exactly one CSS variable, ``--color-brand``, on
 * ``<html>``: ``style.css`` derives every accent-coloured value from it, in
 * light and dark mode — so a light/dark switch needs no re-apply here.
 */
import { env } from '@/env'
import { contrastRatio, hexToRgb, hslToHex, rgbToHex } from '@/utils/color'

/** ScholarStack red — must match ``--color-brand`` in ``style.css``. */
export const DEFAULT_ACCENT = '#E10210'

/** Minimum contrast of white text on the accent (filled buttons) and of
 *  the accent as text on white cards — WCAG AA for normal text. */
const MIN_CONTRAST = 4.5

// The picker offers one slider over the hue only. Saturation and starting
// lightness are fixed so nobody can pick pastel or near-black accents;
// ``readableAccent`` then darkens hues that are naturally light (yellow,
// cyan …) until white text on them stays readable.
const PICKER_SATURATION = 0.85
const PICKER_LIGHTNESS = 0.45

/** Normalizes a configured value to ``#RRGGBB``; anything invalid or empty
 *  falls back to ``DEFAULT_ACCENT`` so a typo in the env never breaks the UI.
 *  Accepts the value with or without ``#`` and with surrounding quotes —
 *  ``#`` starts a comment in .env files and YAML, so it is usually quoted
 *  (``VITE_ACCENT_COLOR="#0052CC"``) and compose keeps the quotes. */
export function resolveAccentColor(raw: string | undefined | null): string {
  const value = (raw ?? '').trim().replace(/^(["'])(.*)\1$/, '$2').trim()
  if (!hexToRgb(value)) return DEFAULT_ACCENT
  return `#${value.replace(/^#/, '').toUpperCase()}`
}

/** Darkens ``hex`` in small steps until white has ``MIN_CONTRAST`` on it.
 *  Readable colors (the default red included) are returned unchanged. */
export function readableAccent(hex: string): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return DEFAULT_ACCENT
  let color = rgbToHex(rgb)
  for (let f = 0.95; contrastRatio(color, '#FFFFFF') < MIN_CONTRAST && f > 0; f -= 0.05) {
    color = rgbToHex({ r: rgb.r * f, g: rgb.g * f, b: rgb.b * f })
  }
  return color
}

/** The accent the slider produces for ``hue`` (0–359 degrees). */
export function accentFromHue(hue: number): string {
  return readableAccent(hslToHex(hue, PICKER_SATURATION, PICKER_LIGHTNESS))
}

/** The accent configured via ``VITE_ACCENT_COLOR`` — normalized and readable. */
export function configuredAccent(): string {
  return readableAccent(resolveAccentColor(env.ACCENT_COLOR))
}

/** Sets ``--color-brand`` on ``<html>``. The default removes the override so
 *  ``style.css`` stays the single source for the ScholarStack look. */
export function applyAccentColor(hex: string) {
  const root = document.documentElement.style
  if (hex === DEFAULT_ACCENT) root.removeProperty('--color-brand')
  else root.setProperty('--color-brand', hex)
}

/** Applies the configured accent; called once in ``main.ts`` before mount. */
export function initAccentColor() {
  applyAccentColor(configuredAccent())
}
